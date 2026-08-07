/**
 * MemoryQualityManager — 记忆质量管理器
 *
 * 负责：
 *   1. 记忆可信度评估（confidence 0-1）
 *   2. 记忆确认机制（用户确认前不存档）
 *   3. 记忆热度管理（heat + lastMention）
 *   4. 记忆冲突检测
 *   5. 记忆自动失效
 *   6. 重复记忆合并
 *   7. 记忆健康度评分
 *
 * 全部在本地完成，不消耗 API Token。
 */

import { loadFromStorage, saveToStorage, STORAGE_KEYS } from './storage'
import {
  getMemoriesV2,
  saveMemoriesV2,
  addMemoryV2,
  updateMemoryV2,
  deleteMemoryV2,
} from './memoriesV2Service'

// ============= 常量 =============

/** 可信度常量 */
export const CONFIDENCE = {
  USER_DIRECT: 1.0,       // 用户直接陈述
  USER_VAGUE: 0.55,       // 用户模糊表达
  AI_INFERRED: 0.3,       // AI 推断
  MIN_INJECTION: 0.5,     // 低于此值不注入 Prompt
}

/** 热度衰减周期（毫秒） */
const HEAT_DECAY_DAYS = 30
const HEAT_DECAY_RATE = 0.05 // 每30天衰减5%

/** 临时记忆过期时间（毫秒） */
const TEMP_MEMORY_EXPIRY_DAYS = 60

/** 里程碑关键词（触发 locked） */
const MILESTONE_KEYWORDS = [
  '第一次', '初次', '首次', '初见',
  '第一次认识', '第一次约会', '第一次拥抱', '第一次牵手', '第一次旅行',
  '第一次见面', '第一次吃饭', '第一次看电影',
  '纪念日', '周年', '生日',
  '表白', '告白', '在一起',
]

/** 冲突检测关键词对 */
const CONFLICT_PATTERNS = [
  { positive: ['喜欢', '爱', '偏爱'], negative: ['讨厌', '不喜欢', '反感', '厌恶'] },
  { positive: ['爱吃', '喜欢吃'], negative: ['不爱吃', '讨厌吃', '忌口', '过敏'] },
  { positive: ['想去', '要去', '打算去'], negative: ['不想去', '没兴趣', '讨厌去'] },
]

// ============= 可信度评估 =============

/**
 * 评估记忆的可信度
 * @param content - 记忆内容
 * @param source - 来源
 * @param context - 上下文（'direct_statement' | 'vague_expression' | 'ai_inference'）
 */
export function assessConfidence(content, source = 'manual', context = 'direct_statement') {
  // 用户直接陈述 → 高可信度
  if (context === 'direct_statement') return CONFIDENCE.USER_DIRECT

  // AI 推断 → 低可信度
  if (context === 'ai_inference') return CONFIDENCE.AI_INFERRED

  // 用户模糊表达 → 中低可信度
  if (context === 'vague_expression') return CONFIDENCE.USER_VAGUE

  // 根据来源判断
  if (source === 'import') return 0.7
  if (source === 'system') return 0.9
  if (source === 'ai_summary') return CONFIDENCE.AI_INFERRED

  // 默认：检查内容中的不确定性词汇
  if (/可能|也许|大概|好像|似乎|不确定|不太确定/.test(content)) {
    return CONFIDENCE.USER_VAGUE
  }

  return CONFIDENCE.USER_DIRECT
}

// ============= 确认机制 =============

/**
 * 获取待确认的记忆
 */
export function getPendingConfirmations(characterId) {
  const memories = getMemoriesV2(characterId)
  return memories.filter((m) => !m.confirmed && m.confidence < 0.7)
}

/**
 * 确认一条记忆（用户确认 → 升级为已确认）
 */
export function confirmMemory(characterId, memoryId, confirmed = true) {
  const memories = getMemoriesV2(characterId)
  const mem = memories.find((m) => m.id === memoryId)
  if (!mem) return false

  if (confirmed) {
    // 用户确认：升级可信度，标记已确认
    mem.confirmed = true
    mem.confidence = Math.max(mem.confidence, CONFIDENCE.USER_DIRECT)
    mem.updatedAt = Date.now()
  } else {
    // 用户否认：删除记忆
    const idx = memories.findIndex((m) => m.id === memoryId)
    if (idx !== -1) {
      memories.splice(idx, 1)
      saveMemoriesV2(characterId, memories)
    }
    return true
  }

  saveMemoriesV2(characterId, memories)
  return true
}

/**
 * 生成确认提示（供 AI 在下次聊天中自然确认）
 */
export function generateConfirmationPrompt(characterId) {
  const pending = getPendingConfirmations(characterId)
  if (pending.length === 0) return null

  const items = pending.slice(0, 3).map((m) => {
    // 简化内容，生成自然的确认问题
    const short = m.content.length > 30 ? m.content.slice(0, 30) + '...' : m.content
    return `你之前提到${short}，现在还是这样吗？`
  })

  return {
    type: 'confirmation_request',
    message: `你之前提到一些事，现在还是这样吗？`,
    items,
    memoryIds: pending.map((m) => m.id),
  }
}

// ============= 热度管理 =============

/**
 * 记录一条记忆被提及（热度 +1，lastMention 更新）
 */
export function mentionMemory(characterId, memoryId) {
  const memories = getMemoriesV2(characterId)
  const mem = memories.find((m) => m.id === memoryId)
  if (!mem) return

  mem.heat = (mem.heat || 0) + 1
  mem.lastMention = Date.now()
  mem.updatedAt = Date.now()

  saveMemoriesV2(characterId, memories)
}

/**
 * 批量更新热度衰减（定期调用）
 */
export function decayHeat(characterId) {
  const memories = getMemoriesV2(characterId)
  const now = Date.now()
  let changed = false

  for (const mem of memories) {
    if (mem.locked) continue // 锁定记忆不衰减
    const age = now - (mem.lastMention || mem.createdAt)
    const decayCycles = age / (HEAT_DECAY_DAYS * 24 * 60 * 60 * 1000)
    const decayFactor = Math.pow(1 - HEAT_DECAY_RATE, decayCycles)
    const newHeat = Math.max(0, (mem.heat || 0) * decayFactor)
    if (Math.abs(newHeat - (mem.heat || 0)) > 0.01) {
      mem.heat = newHeat
      changed = true
    }
  }

  if (changed) saveMemoriesV2(characterId, memories)
  return changed
}

/**
 * 更新所有记忆的 lastMention（当用户消息中提到相关关键词时）
 */
export function updateLastMentionFromText(characterId, userMessage) {
  if (!userMessage) return 0
  const memories = getMemoriesV2(characterId)
  const now = Date.now()
  let updated = 0

  for (const mem of memories) {
    if (mem.content && userMessage.includes(mem.content.slice(0, 6))) {
      mem.lastMention = now
      mem.heat = (mem.heat || 0) + 1
      updated++
    }
  }

  if (updated > 0) saveMemoriesV2(characterId, memories)
  return updated
}

// ============= 里程碑锁定 =============

/**
 * 检查是否为里程碑事件（应锁定）
 */
export function isMilestoneEvent(content) {
  if (!content) return false
  return MILESTONE_KEYWORDS.some((kw) => content.includes(kw))
}

/**
 * 自动锁定里程碑记忆
 */
export function autoLockMilestones(characterId) {
  const memories = getMemoriesV2(characterId)
  let locked = 0

  for (const mem of memories) {
    if (!mem.locked && isMilestoneEvent(mem.content)) {
      mem.locked = true
      locked++
    }
  }

  if (locked > 0) saveMemoriesV2(characterId, memories)
  return locked
}

// ============= 冲突检测 =============

/**
 * 检测记忆冲突
 */
export function detectConflicts(characterId) {
  const memories = getMemoriesV2(characterId)
  const conflicts = []

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const a = memories[i]
      const b = memories[j]

      // 锁定的记忆不参与冲突检测
      if (a.locked || b.locked) continue

      for (const pattern of CONFLICT_PATTERNS) {
        const aHasPositive = pattern.positive.some((kw) => a.content.includes(kw))
        const aHasNegative = pattern.negative.some((kw) => a.content.includes(kw))
        const bHasPositive = pattern.positive.some((kw) => b.content.includes(kw))
        const bHasNegative = pattern.negative.some((kw) => b.content.includes(kw))

        // 一个说喜欢，另一个说讨厌
        if ((aHasPositive && bHasNegative) || (aHasNegative && bHasPositive)) {
          conflicts.push({
            id: `conflict_${a.id}_${b.id}`,
            memoryA: { id: a.id, content: a.content },
            memoryB: { id: b.id, content: b.content },
            pattern: `${pattern.positive[0]} vs ${pattern.negative[0]}`,
            resolved: false,
            resolution: null, // 'keep_new' | 'keep_old' | 'keep_both' | 'delete_both'
          })
        }
      }
    }
  }

  return conflicts
}

/**
 * 存储冲突记录（等待用户确认）
 */
export function saveConflicts(characterId, conflicts) {
  const all = loadFromStorage(STORAGE_KEYS.MEMORY_CONFLICTS) || {}
  all[characterId] = conflicts
  saveToStorage(STORAGE_KEYS.MEMORY_CONFLICTS, all)
}

/**
 * 获取未解决的冲突
 */
export function getUnresolvedConflicts(characterId) {
  const all = loadFromStorage(STORAGE_KEYS.MEMORY_CONFLICTS) || {}
  return (all[characterId] || []).filter((c) => !c.resolved)
}

/**
 * 解决冲突
 */
export function resolveConflict(characterId, conflictId, resolution) {
  const all = loadFromStorage(STORAGE_KEYS.MEMORY_CONFLICTS) || {}
  const conflicts = all[characterId] || []
  const idx = conflicts.findIndex((c) => c.id === conflictId)
  if (idx === -1) return false

  const conflict = conflicts[idx]
  const memories = getMemoriesV2(characterId)

  switch (resolution) {
    case 'keep_new':
      // 保留新的（memoryB），删除旧的（memoryA）
      deleteMemoryV2(characterId, conflict.memoryA.id)
      break
    case 'keep_old':
      // 保留旧的（memoryA），删除新的（memoryB）
      deleteMemoryV2(characterId, conflict.memoryB.id)
      break
    case 'delete_both':
      // 都删除
      deleteMemoryV2(characterId, conflict.memoryA.id)
      deleteMemoryV2(characterId, conflict.memoryB.id)
      break
    case 'keep_both':
    default:
      // 都保留，标记为已解决
      break
  }

  conflict.resolved = true
  conflict.resolution = resolution
  conflict.resolvedAt = Date.now()

  saveMemoriesV2(characterId, memories)
  saveToStorage(STORAGE_KEYS.MEMORY_CONFLICTS, all)
  return true
}

// ============= 自动失效 =============

/**
 * 标记临时性记忆（设置过期时间）
 */
export function markAsTemporary(characterId, memoryId, days = TEMP_MEMORY_EXPIRY_DAYS) {
  const memories = getMemoriesV2(characterId)
  const mem = memories.find((m) => m.id === memoryId)
  if (!mem) return false

  mem.expiresAt = Date.now() + days * 24 * 60 * 60 * 1000
  mem.isTemporary = true
  saveMemoriesV2(characterId, memories)
  return true
}

/**
 * 删除已过期的临时记忆
 */
export function deleteExpiredMemories(characterId) {
  const memories = getMemoriesV2(characterId)
  const now = Date.now()
  let deleted = 0

  const remaining = memories.filter((m) => {
    if (m.expiresAt && now > m.expiresAt) {
      // 已过期
      deleted++
      return false
    }
    return true
  })

  if (deleted > 0) {
    saveMemoriesV2(characterId, remaining)
  }
  return deleted
}

// ============= 重复记忆合并 =============

/**
 * 合并重复记忆（语义相似的内容合并为一条）
 */
export function mergeDuplicateMemories(characterId) {
  const memories = getMemoriesV2(characterId)
  const merged = []
  const skip = new Set()
  let mergedCount = 0

  for (let i = 0; i < memories.length; i++) {
    if (skip.has(i)) continue
    const a = memories[i]

    for (let j = i + 1; j < memories.length; j++) {
      if (skip.has(j)) continue
      const b = memories[j]

      // 检查是否为重复（内容相似度高且同层级）
      if (isDuplicate(a, b)) {
        // 合并：保留较新的，合并字段
        const newer = a.updatedAt >= b.updatedAt ? a : b
        const older = newer === a ? b : a

        // 保留较新的，合并旧的热度
        newer.heat = Math.max(newer.heat || 0, older.heat || 0)
        newer.confidence = Math.max(newer.confidence || 0, older.confidence || 0)
        if (!newer.source || newer.source === 'auto') {
          newer.source = older.source || 'merged'
        }

        merged.push(newer)
        skip.add(i)
        skip.add(j)
        mergedCount++
        break
      }
    }

    if (!skip.has(i)) {
      merged.push(a)
    }
  }

  if (mergedCount > 0) {
    saveMemoriesV2(characterId, merged)
  }
  return mergedCount
}

/**
 * 判断两条记忆是否为重复
 */
function isDuplicate(a, b) {
  if (a.tier !== b.tier) return false
  if (a.locked || b.locked) return false
  if (!a.content || !b.content) return false

  const la = a.content.toLowerCase()
  const lb = b.content.toLowerCase()

  // 完全相同
  if (la === lb) return true

  // 一个包含另一个
  if (la.includes(lb) || lb.includes(la)) return true

  // 关键词重叠度 > 80%
  const wordsA = new Set(la.split(/[，,。.!！？?\s]+/).filter(Boolean))
  const wordsB = new Set(lb.split(/[，,。.!！？?\s]+/).filter(Boolean))
  if (wordsA.size === 0 || wordsB.size === 0) return false

  let overlap = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++
  }
  const similarity = overlap / Math.min(wordsA.size, wordsB.size)

  return similarity > 0.8
}

// ============= 记忆健康度评分 =============

/**
 * 计算记忆健康度百分比
 */
export function calculateHealthScore(characterId) {
  const memories = getMemoriesV2(characterId)

  if (memories.length === 0) {
    return { score: 100, details: { total: 0, issues: 0 } }
  }

  const now = Date.now()
  let issues = 0
  let score = 100

  // 1. 检查过期未删除的临时记忆（扣 5 分/条）
  const expired = memories.filter((m) => m.expiresAt && now > m.expiresAt)
  issues += expired.length
  score -= expired.length * 5

  // 2. 检查低可信度记忆（扣 2 分/条）
  const lowConfidence = memories.filter(
    (m) => (m.confidence || 0) < CONFIDENCE.MIN_INJECTION && !m.locked
  )
  issues += lowConfidence.length
  score -= lowConfidence.length * 2

  // 3. 检查零热度记忆（扣 1 分/条）
  const zeroHeat = memories.filter(
    (m) => !m.locked && (m.heat || 0) === 0 && (m.lastMention || 0) < now - 60 * 24 * 60 * 60 * 1000
  )
  issues += zeroHeat.length
  score -= zeroHeat.length * 1

  // 4. 检查重复记忆（扣 10 分/组）
  let duplicateGroups = 0
  const checked = new Set()
  for (let i = 0; i < memories.length; i++) {
    if (checked.has(i)) continue
    for (let j = i + 1; j < memories.length; j++) {
      if (isDuplicate(memories[i], memories[j])) {
        duplicateGroups++
        checked.add(i)
        checked.add(j)
        break
      }
    }
  }
  issues += duplicateGroups
  score -= duplicateGroups * 10

  // 5. 检查冲突（扣 15 分/个）
  const conflicts = detectConflicts(characterId)
  const unresolvedConflicts = conflicts.filter((c) => !c.resolved)
  issues += unresolvedConflicts.length
  score -= unresolvedConflicts.length * 15

  // 6. 锁定记忆比例（加分）
  const locked = memories.filter((m) => m.locked)
  const lockedRatio = locked.length / memories.length
  score += lockedRatio * 5 // 最多加 5 分

  // 限制在 0-100
  score = Math.max(0, Math.min(100, Math.round(score)))

  return {
    score,
    issues,
    details: {
      total: memories.length,
      expired: expired.length,
      lowConfidence: lowConfidence.length,
      zeroHeat: zeroHeat.length,
      duplicateGroups,
      unresolvedConflicts: unresolvedConflicts.length,
      locked: locked.length,
    },
    conflicts: unresolvedConflicts,
  }
}

/**
 * 完整的记忆质量扫描
 */
export function runQualityAudit(characterId) {
  const now = Date.now()
  const result = {
    deletedExpired: 0,
    mergedDuplicates: 0,
    autoLocked: 0,
    decayApplied: false,
    conflictsFound: 0,
    healthBefore: 0,
    healthAfter: 0,
  }

  // 1. 记录扫描前的健康度
  result.healthBefore = calculateHealthScore(characterId).score

  // 2. 删除过期临时记忆
  result.deletedExpired = deleteExpiredMemories(characterId)

  // 3. 合并重复记忆
  result.mergedDuplicates = mergeDuplicateMemories(characterId)

  // 4. 自动锁定里程碑
  result.autoLocked = autoLockMilestones(characterId)

  // 5. 衰减热度
  result.decayApplied = decayHeat(characterId)

  // 6. 检测冲突
  const conflicts = detectConflicts(characterId)
  result.conflictsFound = conflicts.filter((c) => !c.resolved).length
  if (conflicts.length > 0) {
    saveConflicts(characterId, conflicts)
  }

  // 7. 记录扫描后的健康度
  result.healthAfter = calculateHealthScore(characterId).score

  return result
}

// ============= Prompt 注入优化 =============

/**
 * 获取优化后的记忆注入文本（基于可信度 + 热度 + 相关度）
 * 只注入：核心档案 + 高可信情感精华 + 当前话题相关记忆 + 最近几条
 */
export function getOptimizedInjection(characterId, currentMessage = '') {
  const memories = getMemoriesV2(characterId)
  const now = Date.now()
  const parts = []

  // 1. 核心档案（无条件注入，但需可信度 >= 0.5）
  const core = memories
    .filter((m) => m.tier === 'core' && (m.confidence || 0) >= CONFIDENCE.MIN_INJECTION)
    .sort((a, b) => {
      // 锁定优先，然后按 lastMention，然后 heat
      if (a.locked !== b.locked) return a.locked ? -1 : 1
      const la = a.lastMention || a.createdAt
      const lb = b.lastMention || b.createdAt
      if (la !== lb) return lb - la
      return (b.heat || 0) - (a.heat || 0)
    })
    .slice(0, 10) // 最多 10 条

  if (core.length > 0) {
    parts.push('【核心档案】')
    for (const m of core) {
      const lockIcon = m.locked ? '🔒 ' : ''
      parts.push(`- ${lockIcon}${m.content}`)
    }
  }

  // 2. 情感精华（高热度优先）
  const emotional = memories
    .filter((m) => m.tier === 'emotional' && (m.confidence || 0) >= CONFIDENCE.MIN_INJECTION)
    .sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? -1 : 1
      return (b.heat || 0) - (a.heat || 0)
    })
    .slice(0, 5) // 最多 5 条

  if (emotional.length > 0) {
    parts.push('')
    parts.push('【情感精华】')
    for (const m of emotional) {
      const lockIcon = m.locked ? '🔒 ' : ''
      parts.push(`- ${lockIcon}${m.content}`)
    }
  }

  // 3. 当前话题相关记忆（根据用户当前消息匹配）
  if (currentMessage) {
    const relevant = findRelevantMemories(characterId, currentMessage)
    if (relevant.length > 0) {
      parts.push('')
      parts.push('【相关记忆】')
      for (const m of relevant.slice(0, 3)) {
        parts.push(`- ${m.content}`)
      }
    }
  }

  // 4. 最近日常（最近 7 天内，且热度 > 0）
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const recent = memories
    .filter(
      (m) =>
        m.tier === 'daily' &&
        !m.archived &&
        m.createdAt >= sevenDaysAgo &&
        (m.confidence || 0) >= CONFIDENCE.MIN_INJECTION &&
        (m.heat || 0) > 0
    )
    .sort((a, b) => (b.lastMention || b.createdAt) - (a.lastMention || a.createdAt))
    .slice(0, 5)

  if (recent.length > 0) {
    parts.push('')
    parts.push('【最近日常】')
    for (const m of recent) {
      parts.push(`- ${m.content}`)
    }
  }

  return parts.join('\n')
}

/**
 * 查找与当前消息相关的记忆
 */
function findRelevantMemories(characterId, message) {
  const memories = getMemoriesV2(characterId)
  const msgLower = message.toLowerCase()

  // 提取消息中的关键词（简单分词）
  const keywords = message
    .split(/[，,。.!！？?\s、；;：:（）()\[\]【】"'']/)
    .filter((w) => w.length >= 2)

  const scored = memories
    .filter((m) => (m.confidence || 0) >= CONFIDENCE.MIN_INJECTION)
    .map((m) => {
      let score = 0
      const contentLower = m.content.toLowerCase()

      // 直接包含关键词
      for (const kw of keywords) {
        if (contentLower.includes(kw.toLowerCase())) {
          score += 10
        }
      }

      // 热度加成
      score += (m.heat || 0) * 0.5

      // 最近提及加成
      if (m.lastMention) {
        const age = Date.now() - m.lastMention
        if (age < 24 * 60 * 60 * 1000) score += 5
        else if (age < 7 * 24 * 60 * 60 * 1000) score += 2
      }

      return { memory: m, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.memory)

  return scored
}

// ============= 向后兼容迁移 =============

/**
 * 迁移旧记忆数据（为所有记忆添加新字段）
 */
export function migrateMemorySchema(characterId) {
  const memories = getMemoriesV2(characterId)
  if (memories.length === 0) return { migrated: 0 }

  let migrated = 0
  const now = Date.now()
  const updated = memories.map((m) => {
    const newMem = { ...m }
    let changed = false

    // confidence: 从 'high'/'medium'/'low' 字符串迁移为 0-1 数值
    if (typeof m.confidence === 'string') {
      newMem.confidence =
        m.confidence === 'high' ? 1.0 :
        m.confidence === 'medium' ? 0.7 :
        m.confidence === 'low' ? 0.3 :
        CONFIDENCE.USER_DIRECT
      changed = true
    } else if (typeof m.confidence === 'number') {
      // 已经是数值，保持不变
    } else {
      newMem.confidence = CONFIDENCE.USER_DIRECT
      changed = true
    }

    // lastMention
    if (!m.lastMention) {
      newMem.lastMention = m.updatedAt || m.createdAt || now
      changed = true
    }

    // heat
    if (m.heat === undefined || m.heat === null) {
      newMem.heat = 1 // 初始热度
      changed = true
    }

    // source
    if (!m.source) {
      newMem.source = 'chat'
      changed = true
    }

    // locked
    if (m.locked === undefined) {
      newMem.locked = false
      if (m.tier === 'core' || m.tier === 'emotional') {
        newMem.locked = isMilestoneEvent(m.content)
      }
      changed = true
    }

    // confirmed
    if (m.confirmed === undefined) {
      newMem.confirmed = (newMem.confidence || 0) >= 0.7
      changed = true
    }

    // expiresAt
    if (m.expiresAt === undefined && m.tier === 'daily') {
      // 日常记忆默认不过期，但可以标记
      newMem.expiresAt = null
      changed = true
    }

    if (changed) migrated++
    return newMem
  })

  if (migrated > 0) {
    saveMemoriesV2(characterId, updated)
  }

  return { migrated }
}