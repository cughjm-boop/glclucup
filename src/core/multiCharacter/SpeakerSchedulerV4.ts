/**
 * SpeakerSchedulerV4 — V4 发言调度器 (Multi Character Engine V4)
 *
 * 综合评分公式：
 *   Score = 事件责任 × 50 + 是否被点名 × 40 + 是否刚加入 × 25
 *         + 话题相关性 × 30 + Presence × 0.4 + Initiative × 0.3
 *         - 发言冷却 × 20 - 最近发言次数 × 3
 *
 * 保证：
 *  - 刚加入的人先说
 *  - 被点名的人必须说
 *  - 沉默角色不会永远沉默（长期未发言补偿）
 *  - 一个角色不会一直霸屏（发言次数惩罚）
 */

import type { CharacterRuntimeV4 } from './CharacterRuntimeV4'
import type { AnalyzedEvent, EventType } from './EventAnalyzer'
import { getInteractionRule, shouldInterrupt } from './InteractionMatrix'

export interface V4SchedulingContext {
  userMessage: string
  event: AnalyzedEvent
  present: CharacterRuntimeV4[]
  /** 最近发言过的角色 */
  recentlySpokenIds?: string[]
  /** 是否强制单人模式 */
  forceSingle?: boolean
  /** 场景位置 */
  location?: string
}

export interface V4SchedulingResult {
  speakers: CharacterRuntimeV4[]
  scores: Record<string, number>
  maxSpeakers: number
  reason: string
  /** 每个角色的分项得分 */
  breakdown: Record<string, {
    eventResponsibility: number
    mention: number
    justJoined: number
    relevance: number
    presence: number
    initiative: number
    cooldown: number
    speakCountPenalty: number
    total: number
  }>
}

/** 主调度入口 */
export function scheduleSpeakersV4(ctx: V4SchedulingContext): V4SchedulingResult {
  const { present, userMessage, event, recentlySpokenIds = [], forceSingle } = ctx

  if (present.length === 0) {
    return { speakers: [], scores: {}, maxSpeakers: 0, reason: 'no characters', breakdown: {} }
  }

  const breakdown: V4SchedulingResult['breakdown'] = {}
  const scores: Record<string, number> = {}

  const scored = present.map((c) => {
    const parts = computeScoresForCharacter(c, event, userMessage, recentlySpokenIds)
    const total = Math.round(
      parts.eventResponsibility + parts.mention + parts.justJoined +
      parts.relevance + parts.presence + parts.initiative -
      parts.cooldown - parts.speakCountPenalty,
    )
    breakdown[c.characterId] = { ...parts, total }
    scores[c.characterId] = total
    return { c, total }
  })

  // 排序
  scored.sort((a, b) => b.total - a.total)

  // 决定 maxSpeakers
  let maxSpeakers: number
  if (event.type === 'CharacterEnter' || event.type === 'CharacterLeave') {
    maxSpeakers = 1 // 事件责任人单独回复
  } else if (event.type === 'Mention') {
    maxSpeakers = 1
  } else if (forceSingle) {
    maxSpeakers = 1
  } else if (present.length <= 2) {
    maxSpeakers = present.length
  } else {
    maxSpeakers = Math.min(3, Math.max(2, Math.floor(present.length / 2)))
  }

  // 特殊：事件责任人必须在场顶
  let picked = scored.slice(0, maxSpeakers).map((s) => s.c)
  const mandatorySpeakerId = getMandatorySpeakerId(event, present)
  if (mandatorySpeakerId && !picked.some((p) => p.characterId === mandatorySpeakerId)) {
    const mandatory = present.find((c) => c.characterId === mandatorySpeakerId)
    if (mandatory) {
      picked.unshift(mandatory)
      picked = picked.slice(0, maxSpeakers)
    }
  }

  // 根据互动矩阵决定是否让其他角色插话
  const finalPicked: CharacterRuntimeV4[] = [...picked]
  if (!forceSingle && present.length > 2 && picked.length < maxSpeakers) {
    for (const candidate of present) {
      if (finalPicked.some((p) => p.characterId === candidate.characterId)) continue
      if (shouldInterrupt(0.15, getInteractionRule(finalPicked[0]?.characterName || '', candidate.characterName)?.frequency || 50, getInteractionRule(finalPicked[0]?.characterName || '', candidate.characterName)?.initiativeBias || 'normal')) {
        finalPicked.push(candidate)
        if (finalPicked.length >= maxSpeakers) break
      }
    }
  }

  // 最多 3 人
  const speakers = finalPicked.slice(0, Math.min(3, maxSpeakers))

  const reasonParts: string[] = []
  if (mandatorySpeakerId) reasonParts.push(`事件强制:${present.find((c) => c.characterId === mandatorySpeakerId)?.characterName}`)
  reasonParts.push(`top ${speakers.map((c) => c.characterName).join('、')}`)

  return {
    speakers,
    scores,
    maxSpeakers: speakers.length,
    reason: reasonParts.join(' | '),
    breakdown,
  }
}

/** 为单个角色计算各维度分数 */
function computeScoresForCharacter(
  c: CharacterRuntimeV4,
  event: AnalyzedEvent,
  userMessage: string,
  recentlySpokenIds: string[],
) {
  const parts = {
    eventResponsibility: 0,
    mention: 0,
    justJoined: 0,
    relevance: 0,
    presence: 0,
    initiative: 0,
    cooldown: 0,
    speakCountPenalty: 0,
  }

  // 1) 事件责任
  if (event.targetName === c.characterName) {
    parts.eventResponsibility = 50 // 必须回复
  } else if (event.mentionName === c.characterName) {
    parts.mention = 40 // 被点名
  }

  // 2) 刚加入（10秒内）
  const elapsed = Date.now() - c.enteredAt
  if (elapsed < 10000) {
    parts.justJoined = 25
  }

  // 3) 话题相关性
  parts.relevance = computeRelevance(c, userMessage) * 0.3

  // 4) Presence 影响
  parts.presence = c.presence * 0.4

  // 5) Initiative 影响
  parts.initiative = c.initiative * 0.3

  // 6) 冷却惩罚
  if (c.isCoolingDown()) {
    parts.cooldown = c.cooldown * 20
  } else if (recentlySpokenIds.includes(c.characterId)) {
    parts.cooldown = 15
  }

  // 7) 发言次数惩罚（避免霸屏）
  if (c.speakCount > 0) {
    parts.speakCountPenalty = Math.min(30, c.speakCount * 3)
  }

  return parts
}

/** 话题相关性计算 */
function computeRelevance(c: CharacterRuntimeV4, msg: string): number {
  if (!msg) return 0
  const lower = msg.toLowerCase()
  let score = 0
  if (lower.includes(c.characterName.toLowerCase())) score += 60
  // 关键词匹配（从 profile 读取）
  const profile = c.profile as Record<string, any>
  const personality = Array.isArray(profile?.personality) ? profile.personality.join('') : ''
  if (personality) {
    for (const ch of personality) {
      if (msg.includes(ch)) { score += 15; break }
    }
  }
  // 长期未发言 → 补偿
  if (c.lastSpokeAt > 0) {
    const gap = Date.now() - c.lastSpokeAt
    if (gap > 60000) score += 10
  }
  return Math.min(100, score)
}

/** 获取事件的强制责任人 */
function getMandatorySpeakerId(event: AnalyzedEvent, present: CharacterRuntimeV4[]): string | null {
  const name = event.targetName || event.mentionName
  if (!name) return null
  const found = present.find((c) => c.characterName === name)
  return found ? found.characterId : null
}

/** 事件类型 → 是否需要强制发言 */
export function isMandatoryEvent(type: EventType): boolean {
  return type === 'CharacterEnter' || type === 'CharacterLeave' || type === 'Mention'
}

/** 工具：降低所有人冷却 */
export function tickAllV4Cooldowns(runtimes: CharacterRuntimeV4[]): void {
  runtimes.forEach((r) => {
    r.tickCooldown()
    r.decayPresence(1) // 被动存在感衰减
  })
}
