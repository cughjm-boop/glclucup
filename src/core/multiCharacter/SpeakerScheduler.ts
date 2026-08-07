/**
 * SpeakerScheduler — 发言调度器（Multi Character Engine V2）
 *
 * 不要让所有角色每轮都说话。调度规则：
 *  1) 用户 @ 某角色 → 该角色优先回复
 *  2) 与当前话题最相关角色优先（关键词匹配）
 *  3) 长时间未发言角色适当提高优先级
 *  4) 刚发过言的角色降低优先级（冷却 2-3 轮）
 *
 * 输出：按优先级排序的候选角色列表，及"最多发言 N 个"的截断建议。
 */

import type { CharacterRuntime } from './CharacterRuntime'

/** 调度上下文 */
export interface SchedulingContext {
  /** 用户最新消息 */
  userMessage: string
  /** 所有在场角色 */
  present: CharacterRuntime[]
  /** 最近一次 @ 目标（角色名或 null） */
  mentionTarget: string | null
  /** 最近的话题关键词（由关键词提取器生成，可选） */
  topicKeywords?: string[]
  /** 最近 N 条 AI 回复中已经发言过的角色 ID（冷却用） */
  recentlySpokenIds?: string[]
  /** 当前是否已处于多人对话中 */
  isMultiCharacter: boolean
}

/** 调度结果 */
export interface SchedulingResult {
  /** 推荐发言角色（按优先级从高到低） */
  speakers: CharacterRuntime[]
  /** 每个角色的得分（0~100） */
  scores: Record<string, number>
  /** 本轮预计发言者上限（1~3，根据在场人数与上下文动态决定） */
  maxSpeakers: number
  /** 是否存在 @ 强指向 */
  hasMention: boolean
  /** 备注（给日志/UI） */
  reason: string
}

/** 默认最多同时发言数（避免"三个人每轮都说一大段"） */
const DEFAULT_MAX_SPEAKERS = 2
const MAX_SPEAKERS_CAP = 3
/** 冷却轮数 */
const COOLDOWN_ROUNDS = 3

/** 角色名与用户消息关键词的相关度匹配表（可扩展） */
const RELEVANCE_ALIASES: Record<string, string[]> = {
  流萤: ['流萤', '萤', 'firefly', '萤火虫', '记忆'],
  银狼: ['银狼', '狼', 'silverwolf', '黑客', '电脑', '数据'],
  卡芙卡: ['卡芙卡', 'kafka', 'kafka', '卡夫卡', '母亲', '星核'],
  知更鸟: ['知更鸟', '罗宾', 'robin', '歌', '音乐', '嗓子'],
  花火: ['花火', 'sparkle', 'sparkle', '烟花', '爆破'],
  刃: ['刃', 'blade', 'blade', '武士', '刀'],
  三月七: ['三月', '三月七', 'march', '相机', '拍照'],
  丹恒: ['丹恒', 'danheng', 'long', '龙', '饮月'],
  希儿: ['希儿', 'seele', 'seele', '量子', '亡灵'],
  布洛妮娅: ['布洛妮娅', 'bronya', 'bronya', '可可利亚'],
  希露瓦: ['希露瓦', 'serval', 'serval', '摇滚', '音乐'],
  黑塔: ['黑塔', 'herta', 'herta', '研究', '博士'],
  符玄: ['符玄', 'fuxuan', 'fuxuan', '太卜'],
}

/** 为某角色计算话题相关度（0~100） */
export function computeTopicRelevance(
  runtime: CharacterRuntime,
  userMessage: string,
  topicKeywords: string[] = [],
): number {
  if (!userMessage) return 0
  const msg = userMessage.toLowerCase()
  let score = 0

  // 角色名直接出现在消息中 +40
  if (msg.includes(runtime.characterName.toLowerCase())) {
    score += 40
  }

  // 别名匹配
  const aliases = RELEVANCE_ALIASES[runtime.characterName] || [runtime.characterName]
  for (const alias of aliases) {
    if (alias && msg.includes(alias.toLowerCase())) {
      score += 25
      break
    }
  }

  // 话题关键词匹配
  for (const kw of topicKeywords) {
    if (kw && runtime.characterName.includes(kw)) score += 15
    if (kw && msg.includes(kw.toLowerCase())) score += 10
  }

  // 情绪匹配（开心话题→外向角色优先等）
  const emotionBonus: Record<string, string[]> = {
    happy: ['开心', '喜欢', '爱', '好玩', '笑'],
    sad: ['难过', '伤心', '哭', '孤独'],
    angry: ['生气', '讨厌', '烦', '怒'],
    curious: ['为什么', '怎么', '是什么', '好奇'],
    playful: ['逗', '调皮', '玩笑', '闹'],
  }
  const hints = emotionBonus[runtime.emotion]
  if (hints) {
    if (hints.some((h) => msg.includes(h))) score += 10
  }

  return Math.min(100, score)
}

/**
 * 主调度函数
 * @returns 推荐发言者列表（按优先级）
 */
export function scheduleSpeakers(ctx: SchedulingContext): SchedulingResult {
  const { present, userMessage, mentionTarget, recentlySpokenIds = [], isMultiCharacter } = ctx
  const topicKeywords = ctx.topicKeywords || []

  if (present.length === 0) {
    return { speakers: [], scores: {}, maxSpeakers: 0, hasMention: false, reason: 'no characters' }
  }

  // 1) @ 强指向
  let mentionCandidate: CharacterRuntime | null = null
  if (mentionTarget) {
    mentionCandidate =
      present.find((c) => c.characterName === mentionTarget) ||
      present.find((c) => c.characterName.includes(mentionTarget)) ||
      null
  }

  // 2) 为每个角色打分
  const scores: Record<string, number> = {}
  const scored = present.map((c) => {
    let score = 0

    // @ 命中：直接封顶
    if (mentionCandidate && c.characterId === mentionCandidate.characterId) {
      score = 100
    } else {
      // 话题相关度 0~60
      score += Math.round((computeTopicRelevance(c, userMessage, topicKeywords) / 100) * 60)

      // 冷却惩罚：刚发过言扣分
      if (c.isCoolingDown()) {
        score -= 25 + c.cooldown * 5
      } else if (recentlySpokenIds.includes(c.characterId)) {
        score -= 15
      }

      // 长时间未发言：小奖励（最高 +15，按 lastSpokeAt 距今时间）
      if (c.lastSpokeAt > 0) {
        const gap = Date.now() - c.lastSpokeAt
        // 每 30 秒 +1 分，上限 15
        score += Math.min(15, Math.floor(gap / 30000))
      } else {
        // 从未发言过，给一个基础机会
        score += 8
      }

      // 情绪与话题适配（粗粒度）
      if (!isMultiCharacter) {
        // 单人模式，主角色始终最高
        score += 30
      }
    }

    score = Math.max(0, Math.min(100, score))
    scores[c.characterId] = score
    return { c, score }
  })

  // 3) 排序
  scored.sort((a, b) => b.score - a.score)

  // 4) 决定 maxSpeakers
  let maxSpeakers = DEFAULT_MAX_SPEAKERS
  if (mentionCandidate) maxSpeakers = 1 // @ 时只让被 @ 的角色回复
  else if (present.length <= 2) maxSpeakers = present.length
  else if (present.length === 3) maxSpeakers = 2
  else if (present.length >= 4) maxSpeakers = 2

  maxSpeakers = Math.min(maxSpeakers, MAX_SPEAKERS_CAP, present.length)

  // 5) 截取
  let picked = scored.slice(0, maxSpeakers).map((s) => s.c)

  // 6) 保底：如果分数过于集中（例如全是 0），给没发过言的一次机会
  if (picked.length === 0 && present.length > 0) {
    picked = [present[0]]
  }

  const reasonParts: string[] = []
  if (mentionCandidate) reasonParts.push(`@${mentionCandidate.characterName}`)
  if (!mentionCandidate && picked.length) {
    reasonParts.push(`top ${picked.map((c) => c.characterName).join('、')}`)
  }

  return {
    speakers: picked,
    scores,
    maxSpeakers,
    hasMention: !!mentionCandidate,
    reason: reasonParts.join(' | ') || 'default',
  }
}

/**
 * 工具：从用户消息中抽取话题关键词（极简分词，不依赖分词库）
 */
export function extractTopicKeywords(message: string): string[] {
  if (!message) return []
  const tokens = new Set<string>()
  // 英文/数字
  const asciiParts = message.match(/[A-Za-z]{2,}|[0-9]+/g) || []
  asciiParts.forEach((t) => tokens.add(t.toLowerCase()))
  // 连续 2 个中文字符作为一个词（简单切分）
  const zhMatch = message.match(/[\u4e00-\u9fa5]+/g) || []
  for (const seg of zhMatch) {
    if (seg.length <= 2) {
      tokens.add(seg)
    } else {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.add(seg.slice(i, i + 2))
      }
    }
  }
  // 过滤停用词
  const STOP = new Set(['我们', '你们', '他们', '自己', '什么', '怎么', '一个', '一下', '现在', '刚才'])
  return Array.from(tokens).filter((t) => t.length >= 1 && !STOP.has(t))
}

/** 工具：标记发言（更新冷却） */
export function markSpeakersSpoken(runtime: CharacterRuntime): void {
  runtime.markSpoke()
}

/** 工具：降低所有人的冷却（每轮新用户消息时调用） */
export function tickAllCooldowns(runtimes: CharacterRuntime[]): void {
  runtimes.forEach((r) => r.tickCooldown())
}

export { COOLDOWN_ROUNDS }
