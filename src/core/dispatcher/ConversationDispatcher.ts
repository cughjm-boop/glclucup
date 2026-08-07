/**
 * ConversationDispatcher — 聊天调度器（V5 最终架构）
 *
 * 这不是新的聊天系统，只是决定这一轮应该发生什么。
 *
 * 流程：
 *   用户消息 → analyzeUserEvent → updateRuntime → generateReplyPlan
 *          → compilePrompt → 调用 DeepSeek → CanonEngine.validateWithRuntime
 *          → 写入 Runtime → 推送 UI
 *
 * 注意：ReplyValidator 已合并到 Canon Engine，不再保留独立校验。
 */

import {
  createRuntime, addCharacter, removeCharacter, updateCharacter, updateScene,
  enqueueEvent, clearEvents, appendMessage, setReplyPlan, tickCooldowns,
  getCharRuntime, touchUserMessageTime, touchAiReplyTime,
  type ConversationRuntime,
} from './ConversationRuntime'
import {
  analyzeUserEvent, getSystemMessageForEvent, isSystemEvent,
  type GameEvent,
} from './EventTypes'
import { generateReplyPlan, buildReplyPlanInstruction, type ReplyPlan } from './ReplyPlan'
import { buildPromptFromRuntime } from './DispatcherPromptCompiler'
import { validateWithRuntime, type CanonValidationReport } from '../canon/CanonValidator'
import { getCanonCharacter, type CanonCharacterRecord } from '../canon/CanonDatabase'

export interface DispatcherProcessResult {
  event: GameEvent
  replyPlan: ReplyPlan
  systemMessage?: string
  prompt: string
  promptTokens: number
}

/** Dispatcher 实例缓存 */
const instances = new Map<string, ConversationDispatcher>()

export class ConversationDispatcher {
  private runtime: ConversationRuntime
  private conversationId: string
  private listeners = new Set<(rt: ConversationRuntime) => void>()
  /** Canon 角色映射缓存（供校验使用） */
  private characterMap: Record<string, CanonCharacterRecord> = {}

  constructor(conversationId: string, initial?: Partial<ConversationRuntime>) {
    this.conversationId = conversationId
    this.runtime = createRuntime(initial)
  }

  /** 获取实例 */
  static get(conversationId: string, initial?: Partial<ConversationRuntime>): ConversationDispatcher {
    if (!instances.has(conversationId)) {
      instances.set(conversationId, new ConversationDispatcher(conversationId, initial))
    }
    return instances.get(conversationId)!
  }

  /** 销毁 */
  static dispose(conversationId: string): void {
    instances.delete(conversationId)
  }

  /** 获取只读 Runtime 快照 */
  getRuntime(): ConversationRuntime {
    return this.runtime
  }

  /** 订阅变更 */
  subscribe(listener: (rt: ConversationRuntime) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach((l) => { try { l(this.runtime) } catch { /* ignore */ } })
  }

  // ====== 角色管理 ======

  summonCharacter(data: { characterId: string; characterName: string; position?: string; action?: string }): void {
    addCharacter(this.runtime, data)
    // 缓存 Canon 数据供校验
    const canon = getCanonCharacter(data.characterName)
    if (canon) this.characterMap[data.characterId] = canon
    // 入队 CharacterEnter 事件
    enqueueEvent(this.runtime, {
      type: 'CharacterEnter',
      targetName: data.characterName,
      summary: `${data.characterName}加入了`,
    })
    appendMessage(this.runtime, {
      role: 'system',
      content: getSystemMessageForEvent({
        id: '', type: 'CharacterEnter', targetName: data.characterName, summary: '', createdAt: Date.now(),
      }),
      systemType: 'enter',
    })
    this.notify()
  }

  dismissCharacter(characterId: string): void {
    const cr = getCharRuntime(this.runtime, characterId)
    if (!cr) return
    const name = cr.characterName
    removeCharacter(this.runtime, characterId)
    delete this.characterMap[characterId]
    enqueueEvent(this.runtime, {
      type: 'CharacterLeave',
      targetName: name,
      summary: `${name}离开了`,
    })
    appendMessage(this.runtime, {
      role: 'system',
      content: getSystemMessageForEvent({
        id: '', type: 'CharacterLeave', targetName: name, summary: '', createdAt: Date.now(),
      }),
      systemType: 'leave',
    })
    this.notify()
  }

  // ====== 主流程 ======

  /** 处理用户消息：完整流程 */
  processUserMessage(message: string): DispatcherProcessResult {
    // ① 事件分析
    const event = analyzeUserEvent(message)

    // ② 更新 Runtime（不再全员改 emotion，保持独立性）
    this.applyEvent(event, message)

    // ②+  标记用户消息时间（给自动旁听 3 分钟用）
    touchUserMessageTime(this.runtime)

    // ③ 生成回复计划（V2：点名/泛问/串行顺序/防刷屏/角色间对话）
    const plan = generateReplyPlan(this.runtime, event, message)
    setReplyPlan(this.runtime, plan)

    // ④ 推进冷却
    tickCooldowns(this.runtime)

    // ⑤ 追加用户消息（含 speakerId=__user__，方便角色之间对话追踪）
    const mentionId =
      event.targetName && this.findIdByName(event.targetName)
        ? this.findIdByName(event.targetName)
        : plan.mustReply[0] || '__all__'
    appendMessage(this.runtime, {
      role: 'user',
      speakerId: '__user__',
      speakerName: '用户',
      targetId: mentionId,
      content: message,
    })

    // ⑥ 编译 Prompt
    const { prompt, tokens } = buildPromptFromRuntime(this.runtime, event, plan, message)

    // ⑦ 系统事件消息
    let systemMessage: string | undefined
    if (isSystemEvent(event.type)) {
      systemMessage = getSystemMessageForEvent(event)
    }

    this.notify()

    return { event, replyPlan: plan, systemMessage, prompt, promptTokens: tokens }
  }

  /** 处理 AI 回复：Canon Engine 校验 + 写入 Runtime */
  processAIReply(reply: string, plan?: ReplyPlan): {
    validated: boolean
    report: CanonValidationReport
  } {
    const activePlan = plan || this.runtime.lastReplyPlan || { mustReply: [], optionalReply: [], silent: [], order: [] }

    // ① 使用 Canon Engine 统一校验（合并原 ReplyValidator 职责）
    const report = validateWithRuntime(
      reply,
      {
        activeCharacters: this.runtime.activeCharacters,
        characterRuntime: this.runtime.characterRuntime,
        scene: this.runtime.scene,
      },
      activePlan,
      this.characterMap,
    )

    // ② 写入 Runtime（使用自动修正后的回复）
    const finalReply = report.fixedReply || reply

    // 从回复里拆出 speakerId，写进 messages（避免后续解析）
    const speakerNames = extractSpeakersFromReply(reply)
    const firstSpeaker = speakerNames[0] || null
    const firstSpeakerId = firstSpeaker ? this.findIdByName(firstSpeaker) : null

    appendMessage(this.runtime, {
      role: 'assistant',
      speakerId: firstSpeakerId || (activePlan.mustReply[0] ?? activePlan.optionalReply[0] ?? ''),
      speakerName: firstSpeaker || '',
      targetId: '__user__',
      content: finalReply,
    })

    // ③ 更新每个发言角色的独立状态（五维状态每人独立，不再广播）
    for (const name of speakerNames) {
      const id = this.findIdByName(name)
      if (id) {
        const cr = this.runtime.characterRuntime[id]
        if (cr) {
          cr.lastSpokeAt = Date.now()
          cr.cooldown = 2
          cr.speakCount++
          cr.currentTarget = '__user__'
          cr.presence = Math.min(100, cr.presence + 3)
          // 只改发言角色自己的 emotion
          const emotion = detectEmotion(reply)
          if (emotion) cr.emotion = emotion
          // 同时更新表情（发言者独立的）
          const expression = detectExpression(reply)
          if (expression) cr.expression = expression
        }
      }
    }

    // ③+  标记 AI 回复时间（给自动旁听用）
    touchAiReplyTime(this.runtime)

    // ④ 清空事件队列
    clearEvents(this.runtime)

    this.notify()
    return { validated: report.passed, report }
  }

  // ====== 事件 → Runtime 更新 ======

  private applyEvent(event: GameEvent, userMessage: string): void {
    switch (event.type) {
      case 'CharacterEnter': {
        break
      }
      case 'CharacterLeave': {
        break
      }
      case 'Move': {
        // 角色独立移动：如果点名了某个角色，只改这个人的 position；否则改全局场景 location
        if (event.targetName) {
          const targetId = this.findIdByName(event.targetName)
          if (targetId) {
            updateCharacter(this.runtime, targetId, { position: event.summary })
          } else {
            // 没找到角色 → 当全局场景切换
            updateScene(this.runtime, { location: event.summary })
          }
        } else {
          updateScene(this.runtime, { location: event.summary })
        }
        break
      }
      case 'Emotion': {
        // 五维状态独立：只改被点名的人的 emotion，不再全员广播
        const emotion = detectEmotion(userMessage)
        if (emotion) {
          if (event.targetName) {
            const targetId = this.findIdByName(event.targetName)
            if (targetId) {
              updateCharacter(this.runtime, targetId, { emotion })
              break
            }
          }
          // 非点名 → 只改 lastReplyPlan.mustReply[0]（如果有）
          const mustId = this.runtime.lastReplyPlan?.mustReply?.[0]
          if (mustId && this.runtime.characterRuntime[mustId]) {
            updateCharacter(this.runtime, mustId, { emotion })
          }
        }
        break
      }
      case 'Outfit': {
        // 服装独立：点名谁只改谁的 costumeId / costume
        if (event.targetName) {
          const targetId = this.findIdByName(event.targetName)
          if (targetId) {
            updateCharacter(this.runtime, targetId, {
              costume: event.summary,
              costumeId: event.summary || 'default',
            })
          }
        }
        break
      }
      case 'Battle': {
        break
      }
      case 'TimeSkip': {
        updateScene(this.runtime, { time: '（时间流逝）' })
        break
      }
      case 'SceneChange': {
        break
      }
      default:
        break
    }
  }

  private findIdByName(name: string): string | null {
    for (const [id, cr] of Object.entries(this.runtime.characterRuntime)) {
      if (cr.characterName === name) return id
    }
    if (this.runtime.activeCharacters.includes(name)) return name
    return null
  }
}

function extractSpeakersFromReply(reply: string): string[] {
  const names = new Set<string>()
  const re = /([\u4e00-\u9fa5A-Za-z]{2,8})[：:]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(reply)) !== null) names.add(m[1])
  return Array.from(names)
}

function detectEmotion(text: string): string {
  if (!text) return 'calm'
  if (/(哈哈|开心|笑|愉快|😊|😄|😆)/.test(text)) return 'happy'
  if (/(难过|伤心|哭|孤独|😢|😭)/.test(text)) return 'sad'
  if (/(生气|愤怒|讨厌|怒|😠|😡)/.test(text)) return 'angry'
  if (/(害羞|脸红|不好意思)/.test(text)) return 'shy'
  if (/(惊讶|吃惊|什么|😲|😮)/.test(text)) return 'surprised'
  if (/(严肃|认真|郑重)/.test(text)) return 'thinking'
  if (/(累|疲惫|困|😪|😴)/.test(text)) return 'sleepy'
  if (/(温柔|摸摸|摸摸头|乖|抱抱)/.test(text)) return 'tender'
  return 'calm'
}

function detectExpression(text: string): string {
  if (!text) return ''
  if (/(害羞|脸红|脸烫)/.test(text)) return 'blush'
  if (/(皱眉|皱着眉|蹙眉)/.test(text)) return 'frown'
  if (/(偷笑|偷笑了|捂嘴)/.test(text)) return 'smirk'
  if (/(浅笑|淡淡一笑|抿嘴|勾唇)/.test(text)) return 'faint_smile'
  if (/(温柔笑|温柔地笑|甜甜)/.test(text)) return 'gentle_smile'
  if (/(哈哈|大笑|笑了|哈哈哈)/.test(text)) return 'laugh'
  if (/(惊讶|睁大眼睛|瞪大眼)/.test(text)) return 'surprise'
  if (/(若有所思|沉思|认真)/.test(text)) return 'thinking'
  if (/(眨眼|眨了眨眼|wink)/.test(text)) return 'blink'
  if (/(眯眼|眯起)/.test(text)) return 'squint'
  if (/(微笑|笑笑|笑着)/.test(text)) return 'smile'
  return ''
}
