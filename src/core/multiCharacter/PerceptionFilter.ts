/**
 * PerceptionFilter — 角色感知过滤（Multi Character Engine V2）
 *
 * 每个角色只知道自己应该知道的信息。
 *  - 流萤离开房间期间发生的事，回来后不能直接引用，除非有人告诉她。
 *  - AI 回复中出现"你/流萤之前说过..."但流萤实际不在场，应视为越权。
 */

import type { CharacterRuntime } from './CharacterRuntime'
import type { ConversationMessage, SceneEvent } from './ConversationState'

/** 感知上下文 */
export interface PerceptionContext {
  /** 当前角色 */
  self: CharacterRuntime
  /** 所有消息（会话历史） */
  messages: ConversationMessage[]
  /** 最近一次 Scene Event */
  lastSceneEvent: SceneEvent | null
}

/** 感知结果 */
export interface PerceptionResult {
  /** 允许被该角色引用的消息 ID 列表（安全子集） */
  visibleMessageIds: string[]
  /** 允许被该角色引用的 Scene Event ID 列表 */
  visibleEventIds: string[]
  /** 是否越权 */
  hasBreach: boolean
  /** 越权描述（用于 ReplyValidator 报错） */
  breachReasons: string[]
  /** 供 Prompt 使用的"受限消息"文本（已过滤） */
  filteredHistoryText: string
}

/**
 * 判断某条消息是否对某角色可见
 * 规则：
 *  1) 用户消息对所有在场角色可见
 *  2) 角色消息：若该角色当时已在场（在 witnessedBy 里），则可见
 *  3) 已被撤回的消息不可见
 */
export function isMessageVisibleTo(
  msg: ConversationMessage,
  selfId: string,
  presentAtMessageTime: string[],
): boolean {
  // 系统消息：仅对在场角色可见
  if (msg.role === 'system') return presentAtMessageTime.includes(selfId)
  // 用户消息：所有人可见
  if (msg.role === 'user') return true
  // 角色消息：仅对当时在场且在 witnessedBy 中的角色可见
  if (msg.role === 'assistant') {
    // 如果 witnessedBy 包含 selfId，说明当时 self 在场
    return msg.witnessedBy.includes(selfId) || presentAtMessageTime.includes(selfId)
  }
  return false
}

/**
 * 根据角色过滤会话历史
 */
export function filterHistoryForCharacter(ctx: PerceptionContext, maxMessages = 20): PerceptionResult {
  const { self, messages, lastSceneEvent } = ctx
  const visibleMessageIds: string[] = []
  const breachReasons: string[] = []

  // 简化规则：
  //  - 角色的 witnessedEventIds 决定了"看见过"哪些事件
  //  - 角色的 enteredAt 决定了"在那之后"在场
  //  - 对于 assistant 消息：必须 witnessedBy 包含 self 或由 self 本人发出
  //  - 对于用户消息：默认可见

  const filtered: ConversationMessage[] = []
  // 从后往前遍历，保留最新的 maxMessages 条"可见"消息
  for (let i = messages.length - 1; i >= 0 && filtered.length < maxMessages; i--) {
    const m = messages[i]
    let visible = false

    if (m.role === 'user') {
      visible = true
    } else if (m.role === 'assistant') {
      if (m.speakerId === self.characterId) {
        visible = true // 自己的发言当然记得
      } else if (m.witnessedBy.includes(self.characterId)) {
        visible = true
      } else if (m.timestamp >= self.enteredAt) {
        // 入场之后，其他人的发言默认可见
        visible = true
      }
    } else if (m.role === 'system') {
      visible = m.witnessedBy.includes(self.characterId) || m.timestamp >= self.enteredAt
    }

    if (visible) {
      filtered.unshift(m)
      visibleMessageIds.push(m.id)
    }
  }

  // 过滤 scene event：只保留角色见证过的
  const visibleEventIds: string[] = []
  if (lastSceneEvent && lastSceneEvent.witnesses.includes(self.characterId)) {
    visibleEventIds.push(lastSceneEvent.id)
  }

  // 构造过滤后的历史文本（供 Prompt 注入）
  const lines: string[] = []
  for (const m of filtered) {
    const speakerTag = m.speakerName ? `[${m.speakerName}]` : m.role === 'user' ? '[用户]' : '[系统]'
    lines.push(`${speakerTag}: ${m.content}`)
  }
  const filteredHistoryText = lines.join('\n')

  return {
    visibleMessageIds,
    visibleEventIds,
    hasBreach: false,
    breachReasons,
    filteredHistoryText,
  }
}

/**
 * 检查 AI 回复是否越权引用了某角色不该知道的信息
 *  @param reply AI 回复文本
 *  @param self 发言角色
 *  @param allPresent 所有在场角色
 *  @param messages 会话历史
 */
export function detectPerceptionBreach(
  reply: string,
  self: CharacterRuntime,
  allPresent: CharacterRuntime[],
  messages: ConversationMessage[],
): string[] {
  if (!reply) return []
  const reasons: string[] = []

  // 规则 1：回复中提到了离场角色（不在 present 列表中的角色名）
  const presentNames = new Set(allPresent.map((c) => c.characterName))
  // 所有已知角色名（用 characterDataService 的 findCharacter 索引，这里传进来）
  // 简化：用 presentNames 做白名单
  // 若 reply 中出现了"角色名："格式，检查该角色是否在场
  const mentionRegex = /([\u4e00-\u9fa5A-Za-z]{2,6})[：:]/g
  let m: RegExpExecArray | null
  const mentionedNames = new Set<string>()
  while ((m = mentionRegex.exec(reply)) !== null) {
    mentionedNames.add(m[1])
  }
  for (const name of mentionedNames) {
    if (!presentNames.has(name) && name !== self.characterName) {
      reasons.push(`引用了不在场的角色「${name}」`)
    }
  }

  // 规则 2：引用了自己未见证的历史事件
  //  - AI 回复中若出现"之前"/"刚才"/"上次"/"你曾"等，需要核对对应消息是否在可见范围内
  const historySensitiveWords = ['之前', '刚才', '上次', '曾经', '以前', '早先', '刚才的', '那时候', '那会儿']
  const visibleIds = new Set(
    messages
      .filter((msg) => msg.witnessedBy.includes(self.characterId) || msg.timestamp >= self.enteredAt)
      .map((m) => m.id),
  )
  if (historySensitiveWords.some((w) => reply.includes(w))) {
    // 简化处理：只标记可疑，交由上层做模糊判断
    if (messages.length > 0) {
      const recent = messages.slice(-5)
      const recentVisible = recent.filter((m) => visibleIds.has(m.id))
      if (recentVisible.length === 0 && recent.length > 0) {
        reasons.push('可能引用了未在场时发生的事件')
      }
    }
  }

  return reasons
}

/**
 * 把 scene event 分配给合适的"见证者"（决定哪些角色能感知到该事件）
 *  @param eventType 事件类型
 *  @param present 所有在场角色
 *  @param initiatorId 触发事件的角色 ID（可选）
 */
export function assignEventWitnesses(
  eventType: SceneEvent['type'],
  present: CharacterRuntime[],
  initiatorId?: string,
): string[] {
  // 默认：所有在场角色都是见证者
  if (eventType === 'user_action' || eventType === 'weather' || eventType === 'time' || eventType === 'story') {
    return present.map((c) => c.characterId)
  }
  if (eventType === 'location') {
    // 地点变化：只有在场景内的角色才是见证者（全部在场）
    return present.map((c) => c.characterId)
  }
  if (initiatorId) {
    return present.map((c) => c.characterId)
  }
  return present.map((c) => c.characterId)
}
