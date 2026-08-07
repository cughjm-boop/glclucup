/**
 * MultiCharacterEngineV4 — V4 多人聊天引擎主模块
 *
 * 核心流程：
 * 用户消息 → ① EventAnalyzer → ② Scene Manager → ③ SpeakerSchedulerV4
 *          → ④ PromptCompiler → ⑤ Official Canon Engine → DeepSeek
 *          → ⑥ ReplyValidator → 聊天 UI
 */

import {
  analyzeEvent, getSystemEventMessage, type AnalyzedEvent,
} from './EventAnalyzer'
import {
  CharacterRuntimeV4, loadV4Snapshot, saveV4Snapshot, deleteV4Snapshot,
  type CharacterRuntimeV4Snapshot,
} from './CharacterRuntimeV4'
import { scheduleSpeakersV4, tickAllV4Cooldowns, type V4SchedulingResult } from './SpeakerSchedulerV4'
import { buildConstraintSnapshot } from './CharacterConstraintEngine'
import { buildInteractionSummary } from './InteractionMatrix'
import { getSharedSceneMemory, disposeSharedSceneMemory } from './SharedSceneMemory'
import { compileCanonPrompt } from '../canon/CanonPromptCompiler'
import { validateAndEnforce } from '../canon/CanonValidator'
import { buildSelfSnapshot, buildCostumeSnapshot } from '../canon/SnapshotGenerators'
import { getCanonCharacter } from '../canon/CanonDatabase'
import { buildOtherCharacterBriefs, loadCanonResource } from '../canon/DynamicCanonLoader'

export interface V4EngineOptions {
  conversationId: string
  worldId?: string
  maxPresent?: number
}

export interface V4SummonResult {
  success: boolean
  runtime?: CharacterRuntimeV4
  error?: string
  entryAction?: string
}

export interface V4DismissResult {
  success: boolean
  savedSnapshot?: CharacterRuntimeV4Snapshot
  error?: string
}

export interface V4ProcessResult {
  event: AnalyzedEvent
  scheduling: V4SchedulingResult
  /** 系统事件消息（如"三月七加入了聊天"） */
  systemMessage?: string
  /** 当前发言角色的完整 Prompt */
  speakerPrompt?: string
  /** 所有需发言角色的 Prompt 列表 */
  prompts: Array<{
    characterId: string
    characterName: string
    systemPrompt: string
    estimatedTokens: number
    selfSnapshot: string
  }>
}

export class MultiCharacterEngineV4 {
  readonly conversationId: string
  readonly maxPresent: number
  private worldId: string
  private present: Map<string, CharacterRuntimeV4> = new Map()
  private lastSpeakerId: string | null = null
  private conversationSequence = 0
  private sharedMemory: ReturnType<typeof getSharedSceneMemory>

  constructor(opts: V4EngineOptions) {
    this.conversationId = opts.conversationId
    this.maxPresent = opts.maxPresent || 4
    this.worldId = opts.worldId || 'star_rail'
    this.sharedMemory = getSharedSceneMemory(opts.conversationId)
  }

  /** 获取在场角色列表（只读快照） */
  getPresent(): CharacterRuntimeV4[] {
    return Array.from(this.present.values())
  }

  /** 获取角色运行时 */
  getCharacter(characterId: string): CharacterRuntimeV4 | undefined {
    return this.present.get(characterId)
  }

  /** 获取共享场景记忆 */
  getSharedMemory() { return this.sharedMemory }

  /** 订阅共享记忆变化 */
  subscribe(listener: () => void): () => void {
    return this.sharedMemory.subscribe(listener)
  }

  // ===== 角色进入 =====

  summonCharacter(opts: {
    characterId: string
    characterName: string
    profile?: Record<string, unknown>
    position?: string
    action?: string
  }): V4SummonResult {
    if (this.present.size >= this.maxPresent) {
      return { success: false, error: `最多同时在场 ${this.maxPresent} 个角色` }
    }
    if (this.present.has(opts.characterId)) {
      return { success: false, error: `${opts.characterName} 已经在场` }
    }

    // 加载历史快照
    const saved = loadV4Snapshot(this.conversationId, opts.characterId)
    const runtime = saved
      ? CharacterRuntimeV4.fromSnapshot(saved, opts.profile)
      : new CharacterRuntimeV4({
          characterId: opts.characterId,
          characterName: opts.characterName,
          profile: opts.profile,
          position: opts.position,
          action: opts.action,
        })

    // 入场：给刚加入的角色高 Presence
    runtime.bumpPresence(30)
    this.present.set(opts.characterId, runtime)

    const entryAction = runtime.buildEntryAction()

    // 记录到共享记忆
    this.sharedMemory.addEvent({
      type: 'character_action',
      involvedCharacterIds: [runtime.characterId],
      summary: `${runtime.characterName}加入了聊天。${entryAction}`,
      isPrivate: false,
    })
    this.addKnownByToAll()

    return { success: true, runtime, entryAction }
  }

  // ===== 角色离开 =====

  dismissCharacter(characterId: string): V4DismissResult {
    const rt = this.present.get(characterId)
    if (!rt) return { success: false, error: '角色不在场' }

    // 保存快照
    const snap = rt.toSnapshot()
    saveV4Snapshot(this.conversationId, snap)

    // 记录离开事件
    this.sharedMemory.addEvent({
      type: 'character_action',
      involvedCharacterIds: [characterId],
      summary: `${rt.characterName}离开了。`,
      isPrivate: false,
    })

    this.present.delete(characterId)
    if (this.lastSpeakerId === characterId) this.lastSpeakerId = null

    return { success: true, savedSnapshot: snap }
  }

  dismissAll(): V4DismissResult[] {
    const ids = Array.from(this.present.keys())
    return ids.map((id) => this.dismissCharacter(id))
  }

  // ===== 主处理流程 =====

  processUserMessage(userMessage: string, options: {
    location?: string
    forceSingle?: boolean
    mainSpeakerId?: string
  } = {}): V4ProcessResult {
    // ① 事件分析
    const event = analyzeEvent(userMessage)
    let systemMessage: string | undefined

    // 处理 CharacterEnter / CharacterLeave
    if (event.type === 'CharacterEnter' && event.targetName) {
      const target = this.findOrSummonByName(event.targetName)
      if (target) systemMessage = getSystemEventMessage(event)
    } else if (event.type === 'CharacterLeave' && event.targetName) {
      this.dismissByName(event.targetName)
      systemMessage = getSystemEventMessage(event)
    }

    // ② 推进所有角色冷却
    tickAllV4Cooldowns(this.getPresent())

    // ③ 调度发言者
    const scheduling = scheduleSpeakersV4({
      userMessage,
      event,
      present: this.getPresent(),
      recentlySpokenIds: this.getRecentlySpokenIds(),
      forceSingle: options.forceSingle,
      location: options.location,
    })

    // ④ 为每个发言者编译 Prompt
    const prompts: V4ProcessResult['prompts'] = []
    for (const speaker of scheduling.speakers) {
      const canonPrompt = compileCanonPrompt({
        speakerName: speaker.characterName,
        userMessage,
        mode: detectPromptMode(event, userMessage),
        sceneInfo: { location: options.location, area: speaker.position, position: speaker.position },
        otherPresentNames: this.getPresent()
          .filter((c) => c.characterId !== speaker.characterId)
          .map((c) => c.characterName),
        emotion: speaker.emotion,
        relationshipScore: speaker.relationship.score,
      })

      // 注入 V4 约束
      const constraint = buildConstraintSnapshot(speaker)
      const interactionSummary = buildInteractionSummary(
        speaker.characterName,
        this.getPresent().filter((c) => c.characterId !== speaker.characterId).map((c) => c.characterName),
      )
      const sharedMemoryContext = this.sharedMemory.getContextText(speaker.characterId, 5)

      const fullSystemPrompt = [
        canonPrompt.systemPrompt,
        '',
        constraint.promptText,
      ].join('\n')

      if (interactionSummary) {
        prompts.push({
          characterId: speaker.characterId,
          characterName: speaker.characterName,
          systemPrompt: fullSystemPrompt + '\n\n【互动关系】\n' + interactionSummary,
          estimatedTokens: canonPrompt.estimatedTokens + constraint.promptText.length * 2,
          selfSnapshot: canonPrompt.selfSnapshot,
        })
      } else {
        prompts.push({
          characterId: speaker.characterId,
          characterName: speaker.characterName,
          systemPrompt: fullSystemPrompt,
          estimatedTokens: canonPrompt.estimatedTokens + constraint.promptText.length * 2,
          selfSnapshot: canonPrompt.selfSnapshot,
        })
      }

      this.lastSpeakerId = speaker.characterId
    }

    // 记录用户事件到共享记忆
    this.sharedMemory.addEvent({
      type: 'user_action',
      involvedCharacterIds: this.getPresent().map((c) => c.characterId),
      summary: `用户说：${userMessage.slice(0, 80)}`,
      isPrivate: false,
    })
    this.addKnownByToAll()

    return {
      event,
      scheduling,
      systemMessage,
      speakerPrompt: prompts[0]?.systemPrompt,
      prompts,
    }
  }

  // ===== AI 回复处理 =====

  handleAIReply(reply: string, speakerIds: string[]): Array<{
    characterId: string
    characterName: string
    content: string
    validationScore: number
  }> {
    const results: Array<{ characterId: string; characterName: string; content: string; validationScore: number }> = []

    // 拆分回复（按"角色名："）
    const parts = splitReplyBySpeaker(reply, this.getPresent().map((c) => c.characterName))

    for (const part of parts) {
      const runtime = this.present.get(part.speakerId)
      if (!runtime) continue

      // Canon 校验
      const report = validateAndEnforce(part.content, {
        speakerName: runtime.characterName,
        sceneInfo: { location: this.sharedMemory.getRecentEvents(1)[0]?.summary || '' },
        otherPresentNames: this.getPresent()
          .filter((c) => c.characterId !== runtime.characterId)
          .map((c) => c.characterName),
      })

      // 应用修正
      let content = report.fixedReply || part.content

      results.push({
        characterId: runtime.characterId,
        characterName: runtime.characterName,
        content,
        validationScore: report.totalScore,
      })

      // 更新运行时状态
      runtime.markSpoke()
      runtime.bumpPresence(5)
      // 情绪变化检测
      const emotion = detectEmotionFromText(content)
      if (emotion) runtime.setEmotion(emotion)

      // 记录共享事件
      this.sharedMemory.addEvent({
        type: 'character_action',
        involvedCharacterIds: [runtime.characterId],
        summary: `${runtime.characterName}说：${content.slice(0, 80)}`,
        isPrivate: false,
      })
      this.addKnownByToAll()
    }

    return results
  }

  // ===== 辅助 =====

  private findOrSummonByName(name: string): CharacterRuntimeV4 | null {
    // 简化处理：查找已在角色库中的角色（由上层决定是否 summon）
    return this.present.get(name) || null
  }

  private dismissByName(name: string): void {
    const rt = this.present.get(name)
    if (rt) this.dismissCharacter(rt.characterId)
  }

  private getRecentlySpokenIds(): string[] {
    return Array.from(this.present.values())
      .filter((c) => c.isCoolingDown() || Date.now() - c.lastSpokeAt < 30000)
      .map((c) => c.characterId)
  }

  private addKnownByToAll(): void {
    const presentIds = this.getPresent().map((c) => c.characterId)
    const recent = this.sharedMemory.getRecentEvents(5)
    for (const evt of recent) {
      if (!evt.isPrivate) {
        this.sharedMemory.addKnownBy(evt.id, presentIds)
      }
    }
  }

  /** 销毁 */
  dispose(): void {
    this.dismissAll()
    this.present.clear()
    disposeSharedSceneMemory(this.conversationId)
  }

  /** 调试信息 */
  getDebugInfo(): {
    present: Array<{ id: string; name: string; presence: number; initiative: number; speakCount: number; cooldown: number }>
    eventQueue: string[]
    sharedMemorySize: number
    lastSpeakerId: string | null
  } {
    const present = this.getPresent().map((c) => ({
      id: c.characterId,
      name: c.characterName,
      presence: Math.round(c.presence),
      initiative: c.initiative,
      speakCount: c.speakCount,
      cooldown: c.cooldown,
    }))
    return {
      present,
      eventQueue: [],
      sharedMemorySize: this.sharedMemory.getRecentEvents(50).length,
      lastSpeakerId: this.lastSpeakerId,
    }
  }
}

// ===== 工具函数 =====

function detectPromptMode(event: AnalyzedEvent, msg: string): 'battle' | 'costume' | 'relationship' | 'daily' | 'question_other' | 'all' {
  if (event.type === 'Battle') return 'battle'
  if (event.type === 'DressChange') return 'costume'
  if (event.type === 'Mention') return 'relationship'
  const lower = msg.toLowerCase()
  if (/(武器|攻击|战斗|技能|能力)/.test(msg)) return 'battle'
  if (/(衣服|服装|穿|发型|头发)/.test(msg)) return 'costume'
  return 'daily'
}

function splitReplyBySpeaker(reply: string, knownNames: string[]): Array<{ speakerId: string; speakerName: string; content: string }> {
  if (!reply) return []
  const results: Array<{ speakerId: string; speakerName: string; content: string }> = []
  const lines = reply.split(/\r?\n/)
  let currentName: string | null = null
  let buffer = ''

  const flush = () => {
    if (currentName) {
      results.push({ speakerId: currentName, speakerName: currentName, content: buffer.trim() })
    }
    buffer = ''
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { if (buffer) buffer += '\n'; continue }
    let matched: string | null = null
    for (const name of knownNames) {
      if (trimmed.startsWith(`${name}：`) || trimmed.startsWith(`${name}:`)) {
        matched = name
        break
      }
    }
    if (matched) {
      flush()
      currentName = matched
      buffer = trimmed.slice(matched.length + 1).trim()
    } else {
      if (currentName) buffer += (buffer ? '\n' : '') + trimmed
    }
  }
  flush()

  if (results.length === 0 && knownNames.length) {
    results.push({ speakerId: knownNames[0], speakerName: knownNames[0], content: reply.trim() })
  }
  return results
}

function detectEmotionFromText(text: string): import('./CharacterRuntimeV4').Emotion | null {
  if (!text) return null
  if (/(哈哈|开心|笑|愉快)/.test(text)) return 'happy'
  if (/(难过|伤心|哭|孤独)/.test(text)) return 'sad'
  if (/(生气|愤怒|讨厌|怒)/.test(text)) return 'angry'
  if (/(好奇|为什么|怎么)/.test(text)) return 'curious'
  if (/(害羞|脸红|不好意思)/.test(text)) return 'shy'
  if (/(严肃|认真|郑重)/.test(text)) return 'serious'
  if (/(调皮|哈哈|嘻嘻)/.test(text)) return 'playful'
  if (/(累|疲惫|困)/.test(text)) return 'tired'
  if (/(惊讶|吃惊|什么)/.test(text)) return 'surprised'
  return null
}
