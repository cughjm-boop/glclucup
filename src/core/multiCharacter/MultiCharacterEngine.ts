/**
 * MultiCharacterEngine — 多人聊天引擎主模块（Multi Character Engine V2）
 *
 * 串联：
 *  - ConversationState（全局状态）
 *  - CharacterRuntime（角色运行时）
 *  - SpeakerScheduler（发言调度）
 *  - PerceptionFilter（感知过滤）
 *
 * 提供：召唤/遣散流程、Prompt 编译、Reply 校验、事件广播。
 */

import {
  getConversationState,
  disposeConversationState,
  parseMentionTarget,
  type ConversationStateImplPublic,
  type ConversationMessage,
  type SceneEvent,
} from './ConversationState'
import {
  CharacterRuntime,
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  deleteRuntimeSnapshot,
  type CharacterRuntimeSnapshot,
} from './CharacterRuntime'
import {
  scheduleSpeakers,
  extractTopicKeywords,
  markSpeakersSpoken,
  tickAllCooldowns,
  type SchedulingResult,
} from './SpeakerScheduler'
import {
  filterHistoryForCharacter,
  detectPerceptionBreach,
  assignEventWitnesses,
} from './PerceptionFilter'
import { compileMultiCharacterPrompt, type MultiCharacterPromptResult } from './PromptCompiler'
import { validateReply, type ReplyValidationResult } from './ReplyValidator'

/** 引擎配置 */
export interface MultiCharacterEngineOptions {
  /** 当前对话 ID（通常等于角色 ID 或会话 ID） */
  conversationId: string
  /** 世界观 ID */
  worldId?: string
  /** 最大在场角色数（默认 4） */
  maxPresent?: number
}

/** 召唤结果 */
export interface SummonResult {
  success: boolean
  runtime?: CharacterRuntime
  error?: string
  /** 入场动作文本 */
  entryAction?: string
}

/** 遣散结果 */
export interface DismissResult {
  success: boolean
  savedSnapshot?: CharacterRuntimeSnapshot
  error?: string
}

/** 引擎主类 */
export class MultiCharacterEngine {
  readonly conversationId: string
  readonly maxPresent: number
  private state: ConversationStateImplPublic

  constructor(opts: MultiCharacterEngineOptions) {
    this.conversationId = opts.conversationId
    this.maxPresent = opts.maxPresent || 4
    this.state = getConversationState(opts.conversationId, { worldId: opts.worldId })
  }

  /** 获取会话状态（只读快照） */
  getState() {
    return this.state.getSnapshot()
  }

  /** 获取会话实现（仅内部使用） */
  getInternalState(): ConversationStateImplPublic {
    return this.state
  }

  /** 订阅状态变更 */
  subscribe(listener: (snapshot: ReturnType<ConversationStateImplPublic['getSnapshot']>) => void): () => void {
    return this.state.subscribe(listener)
  }

  /**
   * 角色进入流程：
   *  召唤 → 加载角色数据 → 加载角色记忆 → 恢复运行状态 → 加入 Scene → 生成入场动作 → 开始聊天
   */
  summonCharacter(opts: {
    characterId: string
    characterName: string
    profile?: Record<string, unknown>
    /** 初始位置 */
    position?: string
    /** 初始动作 */
    action?: string
  }): SummonResult {
    // 1) 检查在场上限
    if (this.state.present.length >= this.maxPresent) {
      return { success: false, error: `最多同时在场 ${this.maxPresent} 个角色` }
    }

    // 2) 检查是否已在场
    if (this.state.present.some((r) => r.characterId === opts.characterId)) {
      return { success: false, error: `${opts.characterName} 已经在场` }
    }

    // 3) 加载运行时快照（恢复上次状态）
    const savedSnap = loadRuntimeSnapshot(this.conversationId, opts.characterId)
    let runtime: CharacterRuntime
    if (savedSnap) {
      runtime = CharacterRuntime.fromSnapshot(savedSnap, opts.profile)
    } else {
      runtime = new CharacterRuntime({
        characterId: opts.characterId,
        characterName: opts.characterName,
        profile: opts.profile,
        position: opts.position,
        action: opts.action,
      })
    }

    // 4) 加入会话状态
    this.state.addCharacter(runtime)

    // 5) 生成入场动作
    const entryAction = runtime.buildEntryAction()

    return { success: true, runtime, entryAction }
  }

  /**
   * 角色离开流程：
   *  保存运行状态 → 保存位置 → 保存情绪 → 保存最近聊天摘要 → 退出 Scene
   */
  dismissCharacter(characterId: string): DismissResult {
    const rt = this.state.getCharacter(characterId)
    if (!rt) {
      return { success: false, error: '角色不在场' }
    }

    // 1) 生成最近聊天摘要（简化：取最近 5 条关于该角色的消息）
    const msgs = this.state.messages.filter(
      (m) => m.speakerId === characterId || m.witnessedBy.includes(characterId),
    )
    const recent = msgs.slice(-5).map((m) => `${m.speakerName || '?'}: ${m.content}`).join('；')
    rt.setLastChatSummary(recent)

    // 2) 保存快照
    const snap = rt.toSnapshot()
    saveRuntimeSnapshot(this.conversationId, snap)

    // 3) 从会话中移除
    this.state.removeCharacter(characterId)

    return { success: true, savedSnapshot: snap }
  }

  /** 批量遣散所有角色（多人模式关闭时） */
  dismissAll(): DismissResult[] {
    const results: DismissResult[] = []
    const ids = this.state.present.map((r) => r.characterId)
    for (const id of ids) {
      results.push(this.dismissCharacter(id))
    }
    return results
  }

  /**
   * 处理用户消息：解析 @ 目标、广播事件、调度发言者、生成 Prompt
   */
  processUserMessage(userMessage: string, options: {
    /** 主角色 ID（单人模式主角色） */
    mainSpeakerId?: string
    /** 是否强制单人模式 */
    forceSingle?: boolean
  } = {}): {
    scheduling: SchedulingResult
    prompt: MultiCharacterPromptResult
  } {
    const snapshot = this.state.getSnapshot()

    // 1) 更新 @ 目标
    const knownNames = snapshot.present.map((c) => c.characterName)
    const mention = parseMentionTarget(userMessage, knownNames)
    this.state.setMentionTarget(mention)

    // 2) 推进冷却
    tickAllCooldowns(snapshot.present)

    // 3) 话题关键词
    const keywords = extractTopicKeywords(userMessage)

    // 4) 调度发言者
    const scheduling = scheduleSpeakers({
      userMessage,
      present: snapshot.present,
      mentionTarget: mention,
      topicKeywords: keywords,
      recentlySpokenIds: [],
      isMultiCharacter: snapshot.present.length > 1 && !options.forceSingle,
    })

    // 5) 确定当前发言者（主角色兜底）
    let speakerId = scheduling.speakers[0]?.characterId || options.mainSpeakerId || snapshot.currentSpeakerId
    if (options.forceSingle && options.mainSpeakerId) {
      speakerId = options.mainSpeakerId
    }
    if (speakerId) {
      this.state.setSpeaker(speakerId)
    }

    // 6) 广播 scene event（用户消息触发的统一事件）
    const event: SceneEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: inferEventType(userMessage),
      summary: userMessage.length > 80 ? userMessage.slice(0, 80) + '...' : userMessage,
      at: Date.now(),
      witnesses: assignEventWitnesses('user_action', snapshot.present, speakerId || undefined),
    }
    this.state.broadcastEvent(event)

    // 7) 为每个发言者构造受限历史 + Prompt
    const speaker = snapshot.present.find((c) => c.characterId === speakerId)
    const prompt = compileMultiCharacterPrompt({
      speaker,
      allPresent: snapshot.present,
      userMessage,
      conversationSnapshot: snapshot,
      event,
      maxOtherCharacters: 3,
    })

    return { scheduling, prompt }
  }

  /**
   * 校验 AI 回复是否合规
   */
  validateAIReply(
    reply: string,
    speakerId: string,
  ): ReplyValidationResult {
    const snapshot = this.state.getSnapshot()
    const speaker = snapshot.present.find((c) => c.characterId === speakerId)
    return validateReply({
      reply,
      speaker,
      allPresent: snapshot.present,
      messages: snapshot.messages,
      knownCharacterNames: [], // 由 PromptCompiler 注入或由上层补充
    })
  }

  /**
   * 将 AI 回复写入会话（解析成每条角色消息）
   */
  appendAIReply(
    reply: string,
    speakerId: string,
    speakerName: string,
  ): ConversationMessage[] {
    const snapshot = this.state.getSnapshot()
    // 判断当前在场的所有角色
    const presentIds = snapshot.present.map((c) => c.characterId)
    const witnesses = presentIds

    // 为当前发言者标记已发言
    const speaker = snapshot.present.find((c) => c.characterId === speakerId)
    if (speaker) markSpeakersSpoken(speaker)

    // 尝试拆分为多条（按 "角色名：" 分隔）
    const parts = splitReplyBySpeaker(reply, snapshot.present.map((c) => c.characterName))
    const messages: ConversationMessage[] = []

    for (const part of parts) {
      const msg = this.state.appendMessage({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        speakerId: part.speakerId,
        speakerName: part.speakerName,
        content: part.content,
        timestamp: Date.now(),
        witnessedBy: witnesses,
      })
      messages.push(msg)

      // 发言者标记
      const rt = snapshot.present.find((c) => c.characterId === part.speakerId)
      if (rt) markSpeakersSpoken(rt)
    }

    return messages
  }

  /** 销毁引擎（多人切换清理时调用） */
  dispose(): void {
    // 先保存所有在场角色的快照
    const snapshot = this.state.getSnapshot()
    for (const rt of snapshot.present) {
      saveRuntimeSnapshot(this.conversationId, rt.toSnapshot())
    }
    disposeConversationState(this.conversationId)
  }

  /** 清空某角色的持久化快照（彻底删除角色数据） */
  clearCharacterSnapshot(characterId: string): void {
    deleteRuntimeSnapshot(this.conversationId, characterId)
  }
}

/** 推断事件类型（简单规则） */
function inferEventType(message: string): SceneEvent['type'] {
  if (!message) return 'user_action'
  if (/下雨|下雪|晴天|天气/.test(message)) return 'weather'
  if (/现在|今天|时间|几点/.test(message)) return 'time'
  if (/去|走|到|换|地方|房间|大厅/.test(message)) return 'location'
  if (/故事|剧情|任务|冒险|发生了/.test(message)) return 'story'
  return 'user_action'
}

/** 把 AI 回复按 "角色名：" 拆分成多条 */
export function splitReplyBySpeaker(
  reply: string,
  knownNames: string[],
): Array<{ speakerId: string; speakerName: string; content: string }> {
  if (!reply) return []
  const results: Array<{ speakerId: string; speakerName: string; content: string }> = []

  // 尝试匹配 "角色名：" 格式
  const lines = reply.split(/\r?\n/)
  let currentSpeaker: string | null = null
  let buffer = ''

  const flush = () => {
    if (currentSpeaker) {
      results.push({
        speakerId: currentSpeaker,
        speakerName: currentSpeaker,
        content: buffer.trim(),
      })
    }
    buffer = ''
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (buffer) buffer += '\n'
      continue
    }
    // 识别角色名前缀
    let matched: string | null = null
    for (const name of knownNames) {
      if (trimmed.startsWith(`${name}：`) || trimmed.startsWith(`${name}:`)) {
        matched = name
        break
      }
    }
    if (matched) {
      flush()
      currentSpeaker = matched
      buffer = trimmed.slice(matched.length + 1).trim()
    } else {
      if (currentSpeaker) {
        buffer += (buffer ? '\n' : '') + trimmed
      }
    }
  }
  flush()

  // 如果完全没解析出角色，作为单条回复
  if (results.length === 0) {
    const fallbackName = knownNames[0] || 'AI'
    results.push({
      speakerId: fallbackName,
      speakerName: fallbackName,
      content: reply.trim(),
    })
  }

  return results
}
