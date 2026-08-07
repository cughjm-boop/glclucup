/**
 * 三层记忆金字塔服务（V2）
 *
 * 记忆分为三层：
 * 1. 核心档案（core）- 永久锁定，不可自动删除
 * 2. 情感精华（emotional）- 永久保留，不可自动删除
 * 3. 日常琐事（daily）- 可自动清理归档
 *
 * 数据结构（Memory Engine V2 完整版）：
 * {
 *   id: string,
 *   tier: 'core'|'emotional'|'daily',
 *   subCategory: 'first_time'|'best_moment'|'hardship'|'favorite'|null,
 *   content: string,
 *   // ===== 多人聊天 V2：记忆归属（M5/M6 核心字段）=====
 *   owner: string|null,          // 记忆归属人：Firefly / March7th / Robin / Kafka...（单角色独立记忆）
 *   participants: string[],      // 参与人：['User','Firefly','March7th']（谁在场/参与了）
 *   // ===== 记忆元数据 =====
 *   source: 'chat'|'import'|'manual'|'system'|'user_edit'|'ai_summary',
 *   confidence: number 0-1,       // 可信度
 *   importance: number 0-100,    // 重要度
 *   heat: number,                // 热度
 *   lastMention: timestamp,      // 最后提及时间
 *   createdAt: timestamp,
 *   updatedAt: timestamp,
 *   confirmed: boolean,          // 是否已确认
 *   locked: boolean,             // 里程碑锁定
 *   expiresAt: timestamp|null,   // 过期时间
 *   isTemporary: boolean,
 *   // ===== 扩展预留字段 =====
 *   tags: string[],              // 标签
 *   topic: string|null,          // 主题
 *   vectorId: string|null,       // 向量 ID（预留）
 *   embeddingVersion: string|null, // Embedding 版本（预留）
 *   // ===== 保留旧字段 =====
 *   important: boolean,
 *   archived: boolean, archivedAt: timestamp,
 *   relatedMessageId: string,
 *   importSessionId: string,
 * }
 */

import { loadFromStorage, saveToStorage, STORAGE_KEYS } from './storage'
import { getAllCharacters } from './characterDataService'
import { assessConfidence, isMilestoneEvent, calculateHealthScore, detectConflicts } from './memoryQualityManager'
import { getRelationshipPrompt } from './relationshipBuilder'
import { getTimelinePrompt, getTimelineStats } from './memoryTimeline'

// ============= 常量 =============

export const MEMORY_TIERS = {
  core: { label: '核心档案', icon: '🔒', color: 'gold', desc: '永久锁定，不可自动删除' },
  emotional: { label: '情感精华', icon: '❤️', color: 'red', desc: '永久保留，不可自动删除' },
  daily: { label: '日常琐事', icon: '📝', color: 'gray', desc: '可自动清理归档' },
}

export const EMOTIONAL_SUB_CATEGORIES = {
  first_time: { label: '第一次', icon: '✨' },
  best_moment: { label: '最时刻', icon: '⭐' },
  hardship: { label: '困难与鼓励', icon: '💪' },
  favorite: { label: '最喜欢', icon: '💝' },
}

export const DEFAULT_CLEANUP_DAYS = 30

// ============= 存储读写 =============

export function getMemoriesV2(characterId) {
  const all = loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {}
  return all[characterId] || []
}

export function saveMemoriesV2(characterId, memories) {
  const all = loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {}
  all[characterId] = memories
  saveToStorage(STORAGE_KEYS.MEMORIES_V2, all)
}

/**
 * 获取某角色全部记忆（别名，外部接口统一）
 */
export function getAllMemoriesV2(characterId) {
  return getMemoriesV2(characterId)
}

/**
 * 按 tier 过滤记忆
 */
export function getMemoriesByTier(characterId, tier) {
  return getMemoriesV2(characterId).filter((m) => m.tier === tier)
}

export function getCoreMemories(characterId) {
  return getMemoriesByTier(characterId, 'core')
}

export function getEmotionalMemories(characterId) {
  return getMemoriesByTier(characterId, 'emotional')
}

export function getDailyMemories(characterId) {
  return getMemoriesByTier(characterId, 'daily')
}

/**
 * 按 owner 过滤记忆（多人聊天 V2 仪表盘"其他角色记忆"Tab）
 * owner === null/undefined => 返回所有 owner 缺失的（待认领）
 */
export function getOwnedMemories(characterId, owner) {
  const all = getMemoriesV2(characterId)
  if (owner == null) {
    return all.filter((m) => !m.owner)
  }
  const target = String(owner).trim()
  if (!target) return all.filter((m) => !m.owner)
  return all.filter((m) => {
    if (!m || !m.owner) return false
    return String(m.owner).trim() === target
  })
}

export function getArchives(characterId) {
  const all = loadFromStorage(STORAGE_KEYS.MEMORY_ARCHIVES) || {}
  return all[characterId] || []
}

export function saveArchives(characterId, archives) {
  const all = loadFromStorage(STORAGE_KEYS.MEMORY_ARCHIVES) || {}
  all[characterId] = archives
  saveToStorage(STORAGE_KEYS.MEMORY_ARCHIVES, all)
}

export function getCleanupDays() {
  return loadFromStorage(STORAGE_KEYS.DAILY_CLEANUP_DAYS) || DEFAULT_CLEANUP_DAYS
}

export function setCleanupDays(days) {
  saveToStorage(STORAGE_KEYS.DAILY_CLEANUP_DAYS, days)
}

export function getImpressionText(characterId) {
  const all = loadFromStorage(STORAGE_KEYS.IMPRESSION_TEXT) || {}
  return all[characterId] || null
}

export function saveImpressionText(characterId, text) {
  const all = loadFromStorage(STORAGE_KEYS.IMPRESSION_TEXT) || {}
  all[characterId] = { text, updatedAt: Date.now() }
  saveToStorage(STORAGE_KEYS.IMPRESSION_TEXT, all)
}

// ============= 记忆 CRUD =============

let _uuidCounter = 0
function generateId() {
  _uuidCounter++
  return `mem_${Date.now()}_${_uuidCounter}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 添加一条记忆（Memory Engine V2 完整版）
 * ===== 多人聊天 V2 新增（M5/M6）=====
 * @param {string} owner  - 记忆归属人：'Firefly'|'March7th'|'Robin'|'Kafka'|...（单个角色私有记忆）
 * @param {string[]} participants - 参与人列表：['User','Firefly','March7th']（谁在场/参与了）
 * ===== B-1：多人会话缺 owner 强绑定守卫（防串记忆核心）=====
 * @param {string[]|null} [multiActive=null] 当前 activeCharacters，用于判断是否在多人会话
 * @param {string|null} [fallbackSpeaker=null] 若缺 owner 且 strictWriteGuard=false，用此发言人兜底
 * @param {boolean} [strictWriteGuard=true] 默认 true：多人会话缺 owner 直接 WARN + 拒绝写入；false 才用 fallbackSpeaker
 */
export function addMemoryV2(characterId, payload) {
  const raw = payload || {}
  const tier = raw.tier
  const subCategory = raw.subCategory
  const content = raw.content
  const source = raw.source || 'manual'
  const confidence = raw.confidence
  const importance = raw.importance
  const relatedMessageId = raw.relatedMessageId
  const importSessionId = raw.importSessionId
  const isTemporary = raw.isTemporary === true
  const expiresAt = raw.expiresAt
  const tags = Array.isArray(raw.tags) ? raw.tags : []
  const topic = raw.topic || null
  const owner = raw.owner || null
  const participants =
    Array.isArray(raw.participants) && raw.participants.length
      ? raw.participants
      : ['User']
  const multiActive = Array.isArray(raw.multiActive) ? raw.multiActive : null
  const fallbackSpeaker = typeof raw.fallbackSpeaker === 'string' ? raw.fallbackSpeaker : null
  const strictWriteGuard = raw.strictWriteGuard !== false
  const writeGuardMeta = raw._writeGuardMeta || null

  const memories = getMemoriesV2(characterId)
  const multiOn = multiActive && multiActive.length > 0

  // =====================================================================
  // B-1：多人记忆写入 owner 强绑定守卫（核心！避免串记忆）
  // =====================================================================
  if (multiOn && !owner) {
    if (strictWriteGuard) {
      const caller = writeGuardMeta ? `（caller=${writeGuardMeta}）` : ''
      console.warn(
        `[memoriesV2.addMemoryV2] 多人会话已开启${caller}，但本条记忆未提供 owner，为避免串记忆已拒绝写入。` +
          ` content="${String(content || '').slice(0, 50)}" active=[${(multiActive || []).join(',')}]` +
          `，请调用方补充 owner（建议为 speaker 名）或传 strictWriteGuard=false + fallbackSpeaker`,
      )
      return null
    }
    // 宽松模式：用 fallbackSpeaker 兜底（仅当自动抽取已知可信发言人时使用）
    const safeOwner = fallbackSpeaker && fallbackSpeaker.trim() ? fallbackSpeaker.trim() : null
    if (!safeOwner) {
      console.warn(
        `[memoriesV2.addMemoryV2] 多人会话缺 owner 且 fallbackSpeaker 无效，拒绝写入：content="${String(content || '').slice(0, 50)}"`,
      )
      return null
    }
    const mergedParticipants = Array.from(
      new Set(['User', safeOwner, ...(multiActive || []), ...participants].filter(Boolean)),
    )
    return _doAddMemory(characterId, {
      tier, subCategory, content,
      source: source === 'manual' ? 'manual' : `${source}_guarded`,
      confidence, importance, relatedMessageId, importSessionId,
      isTemporary, expiresAt, tags, topic,
      owner: safeOwner,
      participants: mergedParticipants,
    })
  }

  return _doAddMemory(characterId, {
    tier, subCategory, content, source,
    confidence, importance, relatedMessageId, importSessionId,
    isTemporary, expiresAt, tags, topic,
    owner, participants,
  })
}

// 内部真正落盘函数
function _doAddMemory(characterId, p) {
  const memories = getMemoriesV2(characterId)
  const now = Date.now()
  const {
    tier, subCategory, content, source, confidence, importance,
    relatedMessageId, importSessionId, isTemporary, expiresAt, tags, topic,
    owner, participants,
  } = p

  // 可信度自动评估
  let numericConfidence
  if (typeof confidence === 'number') {
    numericConfidence = confidence
  } else if (confidence === 'high') {
    numericConfidence = 1.0
  } else if (confidence === 'medium') {
    numericConfidence = 0.7
  } else if (confidence === 'low') {
    numericConfidence = 0.3
  } else {
    numericConfidence = assessConfidence(content, source, 'direct_statement')
  }

  // 重要度评估
  const numericImportance = importance || (
    tier === 'core' ? 80 :
    tier === 'emotional' ? 70 :
    tier === 'daily' ? 30 : 50
  )

  // 里程碑自动锁定
  const locked = tier !== 'daily' ? isMilestoneEvent(content) : false

  const item = {
    id: generateId(),
    tier,
    subCategory: tier === 'emotional' ? (subCategory || null) : null,
    content,
    // ===== 多人聊天 V2：记忆归属（M5/M6）=====
    owner: owner || null,
    participants: Array.isArray(participants) && participants.length
      ? Array.from(new Set(participants.filter(Boolean)))
      : ['User'],
    // 记忆元数据
    source: source === 'auto' ? 'chat' : source,
    confidence: numericConfidence,
    importance: numericImportance,
    heat: 1,
    lastMention: now,
    createdAt: now,
    updatedAt: now,
    confirmed: numericConfidence >= 0.7,
    locked,
    expiresAt: expiresAt || (isTemporary ? now + 60 * 24 * 60 * 60 * 1000 : null),
    isTemporary,
    // 扩展预留字段
    tags: Array.isArray(tags) ? tags : [],
    topic: topic || null,
    vectorId: null,
    embeddingVersion: null,
    // 保留旧字段
    important: tier !== 'daily',
    archived: false,
    archivedAt: null,
    relatedMessageId: relatedMessageId || null,
    importSessionId: importSessionId || null,
  }
  memories.push(item)
  saveMemoriesV2(characterId, memories)
  return item
}

/**
 * 按 ID 取一条记忆（供 UI 编辑详情、详情页）
 */
export function getMemoryById(characterId, id) {
  if (!id) return null
  const memories = getMemoriesV2(characterId)
  return memories.find((m) => m.id === id) || null
}

/**
 * 更新一条记忆（保留 ID/createdAt，更新 updatedAt；官方锁定字段 core tier 的 core 字段保护）
 * 可传 patch，不强制重写整行
 */
export function updateMemoryV2(characterId, id, patch) {
  if (!id) return null
  const memories = getMemoriesV2(characterId)
  const idx = memories.findIndex((m) => m.id === id)
  if (idx < 0) return null
  const prev = memories[idx]
  const rawPatch = patch || {}
  // 防止覆盖 core 官方锁定：若原 tier === 'core' 且来源是官方锁定的，则禁止改 tier
  const locked = !!prev.officialLocked
  if (locked && rawPatch.tier && rawPatch.tier !== prev.tier) {
    console.warn('[memoriesV2.updateMemoryV2] 官方锁定 core 记忆，禁止改 tier')
    delete rawPatch.tier
  }
  const next = {
    ...prev,
    ...rawPatch,
    // 不可改字段保护
    id: prev.id,
    createdAt: prev.createdAt,
    updatedAt: Date.now(),
  }
  memories[idx] = next
  saveMemoriesV2(characterId, memories)
  return next
}

/**
 * 删除一条记忆
 */
export function deleteMemoryV2(characterId, id) {
  if (!id) return false
  const memories = getMemoriesV2(characterId)
  const before = memories.length
  const filtered = memories.filter((m) => m.id !== id)
  if (filtered.length === before) return false
  saveMemoriesV2(characterId, filtered)
  return true
}

/**
 * 删除关联到某条消息的所有记忆（用户撤回消息时同步删关联记忆，避免孤儿记忆）
 */
export function deleteMemoriesByMessageId(characterId, messageId) {
  if (!messageId) return 0
  const memories = getMemoriesV2(characterId)
  const before = memories.length
  const filtered = memories.filter((m) => m.relatedMessageId !== messageId)
  const removed = before - filtered.length
  if (removed > 0) saveMemoriesV2(characterId, filtered)
  return removed
}

/**
 * 批量添加记忆（B-1：逐条走 addMemoryV2，让单条守卫生效）
 * 新增 meta：multiActive / fallbackSpeakerPerItem / strictWriteGuard
 */
export function addMemoriesV2(characterId, items, meta) {
  const memories = getMemoriesV2(characterId)
  const now = Date.now()
  let added = 0
  let discarded = 0

  const multiActive = meta && Array.isArray(meta.multiActive) ? meta.multiActive : null
  const strictWriteGuard = !meta || meta.strictWriteGuard !== false
  const fallbackSpeakerGlobal = meta && typeof meta.fallbackSpeaker === 'string' ? meta.fallbackSpeaker : null
  const caller = meta && meta._writeGuardMeta ? meta._writeGuardMeta : 'batch'

  for (let i = 0; i < (items || []).length; i++) {
    const rawItem = items[i]
    const content = (rawItem.content || '').trim()
    if (!content || content.length < 2) { discarded++; continue }

    // 检查核心档案中的角色信息是否与官方设定冲突
    if (rawItem.tier === 'core' && rawItem.subCategory === 'character_info') {
      if (isOfficialConflict(content)) { discarded++; continue }
    }

    // 去重（tier + content 精确 match）
    const dup = memories.find(
      (m) => m.content.trim().toLowerCase() === content.toLowerCase() && m.tier === rawItem.tier,
    )
    if (dup) {
      dup.updatedAt = now
      dup.lastMention = now
      dup.heat = (dup.heat || 0) + 0.5
      continue
    }

    const perItemSpeaker =
      (rawItem && typeof rawItem.fallbackSpeaker === 'string' && rawItem.fallbackSpeaker.trim())
        ? rawItem.fallbackSpeaker.trim()
        : null

    const one = addMemoryV2(characterId, {
      tier: rawItem.tier,
      subCategory: rawItem.subCategory,
      content,
      source: (rawItem.source || 'auto') === 'auto' ? 'chat' : (rawItem.source || 'chat'),
      confidence: rawItem.confidence,
      importance: rawItem.importance,
      relatedMessageId: rawItem.relatedMessageId,
      importSessionId: rawItem.importSessionId,
      isTemporary: Boolean(rawItem.isTemporary),
      expiresAt: rawItem.expiresAt,
      tags: Array.isArray(rawItem.tags) ? rawItem.tags : [],
      topic: rawItem.topic || null,
      // ===== V2：多人归属（M5/M6）=====
      owner: rawItem.owner || null,
      participants:
        Array.isArray(rawItem.participants) && rawItem.participants.length
          ? rawItem.participants
          : ['User'],
      // ===== 守卫参数 =====
      multiActive,
      strictWriteGuard,
      fallbackSpeaker: perItemSpeaker || fallbackSpeakerGlobal,
      _writeGuardMeta: `${caller}[${i}]`,
    })
    if (one) added++
    else discarded++
  }

  saveMemoriesV2(characterId, memories)
  return { added, discarded, total: (items || []).length }
}

function isOfficialConflict(content) {
  const lower = content.toLowerCase()
  const allChars = getAllCharacters().characters
  for (const c of allChars) {
    if (!c.identity) continue
    const idLower = c.identity.toLowerCase()
    // 检查是否声称了与官方不同的身份
    if (lower.includes('身份') || lower.includes('是') || lower.includes('变成') || lower.includes('成为')) {
      for (const other of allChars) {
        if (other.name !== c.name && other.identity && lower.includes(other.identity.toLowerCase())) {
          // 声称了其他角色的身份，可能是冲突
          return true
        }
      }
    }
    // 检查是否否定了官方身份
    const negations = [`不是${idLower}`, `不${idLower}`, `不再${idLower}`]
    if (negations.some((n) => lower.includes(n))) return true
  }
  return false
}

// ============= 日常琐事归档 =============

/**
 * 归档超过保留天数的日常琐事
 * 将旧日常记忆压缩为月度摘要，原始条目删除
 */
export function archiveOldDailyMemories(characterId, cleanupDays) {
  const days = cleanupDays || getCleanupDays()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const memories = getMemoriesV2(characterId)
  const toArchive = memories.filter((m) => m.tier === 'daily' && !m.archived && m.createdAt < cutoff)

  if (toArchive.length === 0) return { archived: 0 }

  // 按月分组
  const groups = {}
  for (const m of toArchive) {
    const d = new Date(m.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!groups[key]) groups[key] = []
    groups[key].push(m)
  }

  // 生成月度摘要并归档
  const archives = getArchives(characterId)
  for (const [month, items] of Object.entries(groups)) {
    const summary = generateMonthlySummary(items)
    archives.push({
      month,
      itemCount: items.length,
      summary,
      createdAt: Date.now(),
    })
    // 标记原始条目为已归档
    for (const m of items) {
      m.archived = true
      m.archivedAt = Date.now()
    }
  }

  saveMemoriesV2(characterId, memories)
  saveArchives(characterId, archives)
  return { archived: toArchive.length, months: Object.keys(groups).length }
}

/**
 * 生成月度摘要（本地规则，不调用 AI）
 */
function generateMonthlySummary(items) {
  const topics = new Set()
  const keywords = ['聊天', '问候', '吃饭', '睡觉', '工作', '学习', '游戏', '天气', '心情', '吐槽', '分享', '讨论', '打架', '战斗', '冒险', '旅行', '日常', '关心', '鼓励', '玩笑']
  for (const item of items) {
    for (const kw of keywords) {
      if (item.content.includes(kw)) topics.add(kw)
    }
  }
  const topicList = [...topics].slice(0, 5).join('、')
  return topicList ? `本月日常涉及：${topicList}等话题，共${items.length}条对话。` : `本月共${items.length}条日常对话。`
}

/**
 * 清理所有日常琐事（需确认）
 */
export function clearAllDailyMemories(characterId) {
  const memories = getMemoriesV2(characterId).filter((m) => m.tier !== 'daily')
  saveMemoriesV2(characterId, memories)
}

// ============= 记忆注入策略（V2.1 优化：按可信度+热度注入） =============

/**
 * 检查记忆是否可注入（可信度 >= 0.5 且未过期）
 */
function isInjectable(mem) {
  // 已过期的临时记忆不注入
  if (mem.expiresAt && Date.now() > mem.expiresAt) return false
  // 可信度检查（兼容旧字符串格式）
  const conf = typeof mem.confidence === 'number'
    ? mem.confidence
    : mem.confidence === 'high' ? 1.0 : mem.confidence === 'medium' ? 0.7 : mem.confidence === 'low' ? 0.3 : 1.0
  return conf >= 0.5
}

/**
 * 日常闲聊模式：核心档案摘要 + 最近5条情感精华（按热度排序）
 */
export function getDailyChatInjection(characterId) {
  const core = getCoreMemories(characterId).filter(isInjectable)
  const emotional = getEmotionalMemories(characterId).filter(isInjectable).slice(0, 5)

  const parts = []
  if (core.length > 0) {
    parts.push('【核心档案摘要】')
    parts.push(core.map((m) => {
      const lockIcon = m.locked ? '🔒 ' : ''
      return `- ${lockIcon}${m.content}`
    }).join('\n'))
  }
  if (emotional.length > 0) {
    parts.push('')
    parts.push('【重要回忆】')
    parts.push(emotional.map((m) => {
      const lockIcon = m.locked ? '🔒 ' : ''
      return `- ${lockIcon}${m.content}`
    }).join('\n'))
  }
  return parts.join('\n')
}

/**
 * 深度聊天模式：核心档案完整版 + 高可信情感精华 + 最近7天且有热度的日常
 */
export function getDeepChatInjection(characterId) {
  const core = getCoreMemories(characterId).filter(isInjectable)
  const emotional = getEmotionalMemories(characterId).filter(isInjectable)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const daily = getMemoriesV2(characterId).filter(
    (m) => m.tier === 'daily' && !m.archived && m.createdAt >= sevenDaysAgo && isInjectable(m) && (m.heat || 0) > 0
  )

  const parts = []
  if (core.length > 0) {
    parts.push('【核心档案】')
    parts.push(core.map((m) => {
      const lockIcon = m.locked ? '🔒 ' : ''
      return `- ${lockIcon}${m.content}`
    }).join('\n'))
  }
  if (emotional.length > 0) {
    parts.push('')
    parts.push('【情感精华】')
    parts.push(emotional.map((m) => {
      const sub = EMOTIONAL_SUB_CATEGORIES[m.subCategory]
      const lockIcon = m.locked ? '🔒 ' : ''
      return `- ${lockIcon}${sub ? sub.icon + ' ' : ''}${m.content}`
    }).join('\n'))
  }
  if (daily.length > 0) {
    parts.push('')
    parts.push('【最近日常】')
    parts.push(daily.slice(0, 20).map((m) => `- ${m.content}`).join('\n'))
  }
  return parts.join('\n')
}

// ============= 导入分析辅助 =============

/**
 * 对导入记忆进行三层分类
 * 返回 { core: [], emotional: [], daily: [], discarded: 0 }
 */
export function classifyImportMemories(items) {
  const result = { core: [], emotional: [], daily: [], discarded: 0 }

  const coreKeywords = [
    '名字', '姓名', '昵称', '称呼', '叫', '年龄', '生日', '职业', '是', '工作',
    'MBTI', '性格', '喜欢', '不喜欢', '讨厌', '过敏', '忌口',
    '房子', '宠物', '养了', '猫', '狗', '资产', '关系', '恋人', '朋友', '家人',
    '身份', '星核猎手', '流萤', '萨姆', '星穹列车', '仙舟', '匹诺康尼',
  ]

  const emotionalKeywords = [
    '第一次', '初次', '首次', '见面', '牵手', '表白', '旅行', '约会',
    '最幸福', '最开心', '最感动', '最害羞', '最困难', '最难过',
    '鼓励', '陪伴', '支持', '承诺', '约定', '答应', '保证',
    '最喜欢', '最爱', '最想去', '最常去', '一起',
  ]

  for (const item of items) {
    const content = (item.content || '').trim()
    if (!content || content.length < 2) {
      result.discarded++
      continue
    }

    // 检查核心档案关键词
    const isCore = coreKeywords.some((kw) => content.includes(kw))
    // 检查情感精华关键词
    const isEmotional = emotionalKeywords.some((kw) => content.includes(kw))

    if (isCore) {
      // 核心档案中角色信息需检查冲突
      if (content.includes('身份') || content.includes('是') || content.includes('星核猎手') || content.includes('流萤')) {
        if (isOfficialConflict(content)) {
          result.discarded++
          continue
        }
      }
      result.core.push({ ...item, tier: 'core', subCategory: null, confidence: 'high' })
    } else if (isEmotional) {
      let subCategory = null
      if (content.includes('第一次') || content.includes('初次') || content.includes('首次') || content.includes('见面') || content.includes('牵手') || content.includes('表白')) {
        subCategory = 'first_time'
      } else if (content.includes('最幸福') || content.includes('最开心') || content.includes('最感动') || content.includes('最害羞') || content.includes('最困难') || content.includes('最难过')) {
        subCategory = 'best_moment'
      } else if (content.includes('鼓励') || content.includes('陪伴') || content.includes('支持') || content.includes('困难')) {
        subCategory = 'hardship'
      } else if (content.includes('最喜欢') || content.includes('最爱') || content.includes('最想去') || content.includes('最常去')) {
        subCategory = 'favorite'
      }
      result.emotional.push({ ...item, tier: 'emotional', subCategory, confidence: 'high' })
    } else {
      result.daily.push({ ...item, tier: 'daily', subCategory: null, confidence: 'medium' })
    }
  }

  return result
}

// ============= 搜索 =============

export function searchMemoriesV2(characterId, keyword, filters = {}) {
  const { tier, subCategory, dateFrom, dateTo } = filters
  const lower = keyword.toLowerCase()
  let memories = getAllMemoriesV2(characterId)

  if (tier && tier !== 'all') {
    memories = memories.filter((m) => m.tier === tier)
  }
  if (tier === 'daily' && subCategory === 'scene_event') {
    memories = memories.filter((m) => m.subCategory === 'scene_event')
  }
  if (dateFrom) {
    memories = memories.filter((m) => m.createdAt >= new Date(dateFrom).getTime())
  }
  if (dateTo) {
    memories = memories.filter((m) => m.createdAt <= new Date(dateTo).getTime() + 86400000)
  }
  if (keyword) {
    memories = memories.filter((m) => m.content.toLowerCase().includes(lower))
  }

  return memories
}

// ============= 导出 =============

export function exportMemoriesV2(characterId) {
  const core = getCoreMemories(characterId)
  const emotional = getEmotionalMemories(characterId)
  const daily = getDailyMemories(characterId)
  const archives = getArchives(characterId)

  return {
    exportedAt: new Date().toISOString(),
    summary: {
      core: core.length,
      emotional: emotional.length,
      daily: daily.length,
      archivedMonths: archives.length,
    },
    core,
    emotional: emotional.map((m) => ({
      ...m,
      subCategoryLabel: EMOTIONAL_SUB_CATEGORIES[m.subCategory]?.label || '',
    })),
    daily,
    archives,
  }
}

// ============= 迁移工具 =============

/**
 * 从旧记忆系统迁移到 V2
 * 旧记忆的 category 映射到新 tier
 */
export function migrateOldMemories(characterId, oldMemories) {
  if (!oldMemories || oldMemories.length === 0) return { migrated: 0 }

  const existingV2 = getMemoriesV2(characterId)
  if (existingV2.length > 0) return { migrated: 0, skipped: true }

  const items = []
  for (const m of oldMemories) {
    const category = m.category || 'other'
    let tier = 'daily'
    let subCategory = null

    if (category === 'personal_info' || category === 'preferences' || category === 'shared_property') {
      tier = 'core'
    } else if (category === 'relationship' || category === 'promise' || category === 'shared_experience') {
      tier = 'emotional'
      if (m.content.includes('第一次') || m.content.includes('初次')) subCategory = 'first_time'
      else if (m.content.includes('最')) subCategory = 'best_moment'
      else if (m.content.includes('鼓励') || m.content.includes('陪伴') || m.content.includes('困难')) subCategory = 'hardship'
      else if (m.content.includes('最喜欢') || m.content.includes('最爱')) subCategory = 'favorite'
    } else if (category === 'scene_event') {
      tier = 'daily'
      subCategory = 'scene_event'
    }

    items.push({
      tier,
      subCategory,
      content: m.content,
      source: m.source || 'auto',
      confidence: m.confidence || 'high',
    })
  }

  const result = addMemoriesV2(characterId, items)
  return { migrated: result.added, discarded: result.discarded }
}

// ============= 记忆仪表盘统计 =============

/**
 * 获取记忆仪表盘统计数据
 * 返回核心档案/情感精华/日常记忆数量、重复数、冲突数、健康度
 */
export function getMemoryDashboardStats(characterId) {
  const memories = getMemoriesV2(characterId)

  const coreCount = memories.filter((m) => m.tier === 'core').length
  const emotionalCount = memories.filter((m) => m.tier === 'emotional').length
  const dailyCount = memories.filter((m) => m.tier === 'daily' && !m.archived).length
  const archivedCount = memories.filter((m) => m.tier === 'daily' && m.archived).length

  // 锁定/已确认
  const lockedCount = memories.filter((m) => m.locked).length
  const confirmedCount = memories.filter((m) => m.confirmed).length

  // 低可信度
  const lowConfidenceCount = memories.filter(
    (m) => (typeof m.confidence === 'number' ? m.confidence : 0) < 0.5
  ).length

  // 重复组
  const duplicateGroups = countDuplicateGroups(memories)

  // 冲突
  const conflicts = detectConflicts(characterId)
  const unresolvedConflicts = conflicts.filter((c) => !c.resolved).length

  // 健康度
  const health = calculateHealthScore(characterId)

  // 时间轴统计
  const timelineStats = getTimelineStats(characterId)

  return {
    totalCount: memories.length,
    breakdown: {
      core: coreCount,
      emotional: emotionalCount,
      daily: dailyCount,
      archived: archivedCount,
    },
    lockedCount,
    confirmedCount,
    lowConfidenceCount,
    duplicateGroups,
    unresolvedConflicts,
    healthScore: health.score,
    healthIssues: health.issues,
    timeline: timelineStats,
    // 来源分布
    bySource: countBySource(memories),
    // 最近更新时间
    lastUpdated: getLastUpdateTime(memories),
  }
}

function countDuplicateGroups(memories) {
  let groups = 0
  const checked = new Set()
  for (let i = 0; i < memories.length; i++) {
    if (checked.has(i)) continue
    for (let j = i + 1; j < memories.length; j++) {
      if (checked.has(j)) continue
      if (isSimilarEnough(memories[i], memories[j])) {
        groups++
        checked.add(i)
        checked.add(j)
        break
      }
    }
  }
  return groups
}

function isSimilarEnough(a, b) {
  if (a.tier !== b.tier) return false
  if (!a.content || !b.content) return false
  const la = a.content.toLowerCase()
  const lb = b.content.toLowerCase()
  if (la === lb) return true
  if (la.includes(lb) || lb.includes(la)) return true
  return false
}

function countBySource(memories) {
  const bySource = {}
  for (const m of memories) {
    const src = m.source || 'unknown'
    bySource[src] = (bySource[src] || 0) + 1
  }
  return bySource
}

function getLastUpdateTime(memories) {
  if (memories.length === 0) return null
  let max = 0
  for (const m of memories) {
    const t = m.updatedAt || m.lastMention || m.createdAt || 0
    if (t > max) max = t
  }
  return max > 0 ? max : null
}

// ============= Prompt 注入 V2（增强版） =============

/**
 * 完整的记忆注入文本 V2
 * 组合：关系摘要 + 核心档案 Top10 + 情感精华 Top5 + 当前话题相关 Top10 + 最近聊天摘要 Top3 + 时间轴
 */
export function getFullMemoryInjection(characterId, currentMessage = '') {
  const parts = []

  // 1. 关系摘要（优先注入）
  const relation = getRelationshipPrompt(characterId)
  if (relation) {
    parts.push(relation)
  }

  // 2. 记忆时间轴（精简版）
  const timeline = getTimelinePrompt(characterId)
  if (timeline) {
    parts.push(timeline)
  }

  // 3. 核心档案 Top10
  const core = getCoreMemories(characterId)
    .filter((m) => (typeof m.confidence === 'number' ? m.confidence : 1) >= 0.5)
    .slice(0, 10)
  if (core.length > 0) {
    parts.push('【核心档案】')
    for (const m of core) {
      const lock = m.locked ? '🔒 ' : ''
      parts.push(`- ${lock}${m.content}`)
    }
  }

  // 4. 情感精华 Top5（按热度排序）
  const emotional = getEmotionalMemories(characterId)
    .filter((m) => (typeof m.confidence === 'number' ? m.confidence : 1) >= 0.5)
    .sort((a, b) => (b.heat || 0) - (a.heat || 0))
    .slice(0, 5)
  if (emotional.length > 0) {
    parts.push('')
    parts.push('【情感精华】')
    for (const m of emotional) {
      const sub = EMOTIONAL_SUB_CATEGORIES[m.subCategory]
      const lock = m.locked ? '🔒 ' : ''
      parts.push(`- ${lock}${sub ? sub.icon + ' ' : ''}${m.content}`)
    }
  }

  // 5. 当前话题相关 Top10
  if (currentMessage) {
    const relevant = findRelevantForInjection(characterId, currentMessage)
    if (relevant.length > 0) {
      parts.push('')
      parts.push('【相关记忆】')
      for (const m of relevant.slice(0, 10)) {
        parts.push(`- ${m.content}`)
      }
    }
  }

  // 6. 最近日常 Top3（按 lastMention 排序）
  const recentDaily = getDailyMemories(characterId)
    .filter((m) => (typeof m.confidence === 'number' ? m.confidence : 1) >= 0.5)
    .sort((a, b) => (b.lastMention || b.createdAt || 0) - (a.lastMention || a.createdAt || 0))
    .slice(0, 3)
  if (recentDaily.length > 0) {
    parts.push('')
    parts.push('【最近日常】')
    for (const m of recentDaily) {
      parts.push(`- ${m.content}`)
    }
  }

  return parts.join('\n')
}

function findRelevantForInjection(characterId, message) {
  const memories = getAllMemoriesV2(characterId)
  const keywords = message
    .toLowerCase()
    .split(/[，,。.!！？?\s、；;：:（）()\[\]【】"'']/)
    .filter((w) => w.length >= 2)

  if (keywords.length === 0) return []

  const scored = memories
    .filter((m) => (typeof m.confidence === 'number' ? m.confidence : 1) >= 0.5)
    .map((m) => {
      let score = 0
      const contentLower = (m.content || '').toLowerCase()
      for (const kw of keywords) {
        if (contentLower.includes(kw)) score += 10
      }
      score += (m.heat || 0) * 0.5
      if (m.lastMention) {
        const age = Date.now() - m.lastMention
        if (age < 24 * 60 * 60 * 1000) score += 5
      }
      return { m, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m)

  return scored
}