/**
 * MemoryPipeline — 统一记忆处理流程（Memory Engine V2）
 *
 * 无论是实时聊天还是导入聊天记录，统一走同一条流程：
 *   文本预处理 → 事实提取 → 情绪提取 → 关系提取 → 事件提取
 *   → 记忆去重 → 冲突检查 → 可信度评分 → 分类存储
 *
 * 避免导入和实时聊天使用不同逻辑。
 */

import {
  addMemoryV2,
  getMemoriesV2,
  saveMemoriesV2,
} from './memoriesV2Service'
import {
  assessConfidence,
  detectConflicts,
  mergeDuplicateMemories,
  autoLockMilestones,
  CONFIDENCE,
} from './memoryQualityManager'

// ============= 管道阶段定义 =============

export const PIPELINE_STAGES = {
  PREPROCESS: 'preprocess',
  FACT_EXTRACT: 'fact_extract',
  EMOTION_EXTRACT: 'emotion_extract',
  RELATION_EXTRACT: 'relation_extract',
  EVENT_EXTRACT: 'event_extract',
  DEDUP: 'dedup',
  CONFLICT_CHECK: 'conflict_check',
  CONFIDENCE_SCORE: 'confidence_score',
  CLASSIFY: 'classify',
}

// ============= 玩笑/比喻 识别器（修辞过滤）=============
/** 玩笑/讽刺类标记词，命中后该条句子不进入事实类记忆 */
const JOKE_MARKERS = [
  '开玩笑', '开个玩笑', '开玩笑的', '骗你的', '骗你啦', '骗你的啦',
  '哈哈只是', '哈哈，只是', '哈哈，我是说', '我瞎讲的', '我乱说的', '口嗨',
  '逗你玩', '逗你玩儿', '闹着玩', '闹着玩的', '闹着玩儿',
  '只是说着玩', '说着玩的', '说着玩儿', '编的', '我编的', '虚构的',
  '不要当真', '别当真', '别信', '别当真啊', '不是真的', '假的', '这是假的',
  '狗头', '🐶', '[doge]', '（doge）',
]

/** 比喻修辞特征句："X像/仿佛/好似Y" 这种修辞句不进入事实类记忆 */
const METAPHOR_PATTERN = /^(?!.*(?:长得|身高|年龄|体重|是\s*[0-9]|真的|确实|实际上|事实上|说实话)).{0,20}(?:就像|好像|仿佛|好似|如同|犹如|好比|宛若|跟……一样|跟…一样|似的|一般|有种……的感觉|的感觉像|像……一样|像…一样).{0,40}$/

/**
 * 判断一句话是否是玩笑/讽刺，若是不入库。
 * 判断一句话是否是比喻修辞，若是则降低可信度或不入库。
 */
function classifyRhetoric(sentence) {
  const s = (sentence || '').trim()
  const markers = []
  for (const m of JOKE_MARKERS) {
    if (s.includes(m)) markers.push(m)
  }
  if (markers.length > 0) return { kind: 'joke', markers }
  if (METAPHOR_PATTERN.test(s)) return { kind: 'metaphor' }
  // "好像/就像" 出现在口语中且不陈述事实 → 比喻
  if (/(?:就像|好像|仿佛|好似|如同|犹如)你.{0,10}(?:朋友|哥哥|妹妹|弟弟|姐姐|家人|宠物|对象)$/.test(s)) {
    return { kind: 'metaphor' }
  }
  return { kind: 'fact' }
}

// ============= 记忆分类器 =============

export const MEMORY_CATEGORIES = {
  USER_PROFILE: 'user_profile',
  RELATION_EVENT: 'relation_event',
  DAILY_CHAT: 'daily_chat',
  USER_VIEWPOINT: 'user_viewpoint',
  EMOTION_TREND: 'emotion_trend',
}

const CATEGORY_KEYWORDS = {
  [MEMORY_CATEGORIES.USER_PROFILE]: [
    '叫', '名字', '姓', '年龄', '生日', '星座', '职业', '工作', '身份',
    '喜欢', '爱好', '兴趣', '擅长', '过敏', '忌口', '讨厌', '偏好',
    '昵称', '称呼', '学历', '学校', '专业',
  ],
  [MEMORY_CATEGORIES.RELATION_EVENT]: [
    '第一次', '初次', '首次', '见面', '约会', '旅行', '牵手', '拥抱',
    '表白', '告白', '在一起', '纪念日', '周年', '认识', '相遇',
    '一起', '陪伴', '安慰', '鼓励', '支持', '照顾',
  ],
  [MEMORY_CATEGORIES.DAILY_CHAT]: [
    '吃', '喝', '睡', '买', '逛', '考试', '工作', '学习', '看', '玩',
    '天气', '心情', '吐槽', '分享', '讨论', '打架', '战斗', '冒险',
    '日常', '关心', '玩笑', '游戏', '电影', '音乐',
  ],
  [MEMORY_CATEGORIES.USER_VIEWPOINT]: [
    '梦想', '理想', '目标', '打算', '计划', '价值观', '人生观', '相信',
    '认为', '觉得', '坚持', '反对', '支持', '想成为', '想做',
  ],
  [MEMORY_CATEGORIES.EMOTION_TREND]: [
    '开心', '难过', '生气', '焦虑', '压力', '累', '孤独', '兴奋',
    '紧张', '满足', '沮丧', '期待', '疲惫', '痛苦', '幸福',
  ],
}

// ============= 管道处理器 =============

export class MemoryPipeline {
  constructor(characterId) {
    this.characterId = characterId
    this.history = []
  }

  process(messages, source = 'chat') {
    const startTs = Date.now()
    const result = {
      characterId: this.characterId,
      source,
      inputCount: messages.length,
      output: [],
      stages: [],
      duration: 0,
    }

    const preprocessed = this._stagePreprocess(messages, result)
    const facts = this._stageFactExtract(preprocessed, result)
    const emotions = this._stageEmotionExtract(preprocessed, result)
    const relations = this._stageRelationExtract(preprocessed, result)
    const events = this._stageEventExtract(preprocessed, result)
    const deduplicated = this._stageDedup([...facts, ...emotions, ...relations, ...events], result)
    const conflictResult = this._stageConflictCheck(deduplicated, result)
    const scored = this._stageConfidenceScore(conflictResult.items, result, source)
    const stored = this._stageClassify(scored, result)

    result.output = stored
    result.duration = Date.now() - startTs
    return result
  }

  _stagePreprocess(messages, result) {
    const step = { stage: PIPELINE_STAGES.PREPROCESS, input: messages.length, output: 0, status: 'pending' }
    const processed = messages.map((msg) => {
      let content = (msg.content || '').trim()
      content = content.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      content = content.replace(/\s+/g, ' ').trim()
      const sentences = content.split(/[。！？.!?；;]/).filter((s) => s.trim().length >= 2)
      return { ...msg, cleaned: content, sentences }
    }).filter((m) => m.cleaned.length >= 2)
    step.output = processed.length
    step.status = 'completed'
    result.stages.push(step)
    return processed
  }

  _stageFactExtract(messages, result) {
    const step = { stage: PIPELINE_STAGES.FACT_EXTRACT, input: messages.length, output: 0, status: 'pending' }
    const items = []
    for (const msg of messages) {
      if (msg.role !== 'user') continue
      for (const sentence of msg.sentences) {
        // Item 40: 区分事实/玩笑/比喻 — 玩笑句直接跳过不进入事实类；比喻句可信度降级
        const rhetoric = classifyRhetoric(sentence)
        if (rhetoric.kind === 'joke') {
          // 玩笑不入库，跳过
          if (!result.rhetoricSkipped) result.rhetoricSkipped = []
          result.rhetoricSkipped.push({ type: 'joke', markers: rhetoric.markers, sentence })
          continue
        }
        const cat = this._classifySentence(sentence)
        if (cat === MEMORY_CATEGORIES.USER_PROFILE) {
          let conf = this._estimateConfidence(sentence, 'direct_statement')
          let imp = this._estimateImportance(sentence, cat)
          const extraMeta = {}
          if (rhetoric.kind === 'metaphor') {
            // 比喻句保留但可信度 ×0.5，重要性 ×0.4，并打标签
            conf = Math.round(conf * 50) / 100
            imp = Math.round(imp * 0.4)
            extraMeta.rhetoric = 'metaphor'
            if (!result.rhetoricSkipped) result.rhetoricSkipped = []
            result.rhetoricSkipped.push({ type: 'metaphor_downgraded', sentence })
          }
          items.push({
            type: 'fact',
            category: cat,
            content: sentence,
            confidence: conf,
            importance: imp,
            source: 'chat',
            timestamp: msg.timestamp || Date.now(),
            metadata: { speaker: 'user', msgId: msg.id, ...extraMeta },
          })
        }
      }
    }
    step.output = items.length
    step.status = 'completed'
    result.stages.push(step)
    return items
  }

  _stageEmotionExtract(messages, result) {
    const step = { stage: PIPELINE_STAGES.EMOTION_EXTRACT, input: messages.length, output: 0, status: 'pending' }
    const items = []
    const emotionSequence = []
    const emotionKeywords = CATEGORY_KEYWORDS[MEMORY_CATEGORIES.EMOTION_TREND]
    for (const msg of messages) {
      for (const sentence of msg.sentences) {
        for (const kw of emotionKeywords) {
          if (sentence.includes(kw)) { emotionSequence.push(kw); break }
        }
      }
    }
    if (emotionSequence.length >= 3) {
      const trend = this._detectEmotionTrend(emotionSequence)
      if (trend) {
        items.push({
          type: 'emotion_trend',
          category: MEMORY_CATEGORIES.EMOTION_TREND,
          content: trend,
          confidence: 0.6,
          importance: 40,
          source: 'chat',
          timestamp: Date.now(),
          metadata: { emotionSequence, isTrend: true },
        })
      }
    }
    step.output = items.length
    step.status = 'completed'
    result.stages.push(step)
    return items
  }

  _stageRelationExtract(messages, result) {
    const step = { stage: PIPELINE_STAGES.RELATION_EXTRACT, input: messages.length, output: 0, status: 'pending' }
    const items = []
    let firstMention = null
    let lastMention = null
    let interactionCount = 0
    for (const msg of messages) {
      if (msg.role === 'user') {
        interactionCount++
        if (!firstMention) firstMention = msg.timestamp || Date.now()
        lastMention = msg.timestamp || Date.now()
        for (const sentence of msg.sentences) {
          if (this._isRelationEvent(sentence)) {
            items.push({
              type: 'relation_event',
              category: MEMORY_CATEGORIES.RELATION_EVENT,
              content: sentence,
              confidence: 1.0,
              importance: 90,
              source: 'chat',
              timestamp: msg.timestamp || Date.now(),
              metadata: { isMilestone: true, relationshipType: 'milestone' },
            })
          }
        }
      } else if (msg.role === 'assistant') {
        for (const sentence of msg.sentences) {
          if (/我(?:喜欢|爱|想|想念|担心|关心)/.test(sentence)) {
            items.push({
              type: 'relation_response',
              category: MEMORY_CATEGORIES.RELATION_EVENT,
              content: sentence,
              confidence: 0.7,
              importance: 50,
              source: 'chat',
              timestamp: msg.timestamp || Date.now(),
              metadata: { speaker: 'assistant' },
            })
          }
        }
      }
    }
    if (firstMention && lastMention) {
      result.relationMeta = {
        firstMention,
        lastMention,
        interactionCount,
        duration: lastMention - firstMention,
      }
    }
    step.output = items.length
    step.status = 'completed'
    result.stages.push(step)
    return items
  }

  _stageEventExtract(messages, result) {
    const step = { stage: PIPELINE_STAGES.EVENT_EXTRACT, input: messages.length, output: 0, status: 'pending' }
    const items = []
    for (const msg of messages) {
      if (msg.role !== 'user') continue
      for (const sentence of msg.sentences) {
        const cat = this._classifySentence(sentence)
        if (cat === MEMORY_CATEGORIES.DAILY_CHAT || cat === MEMORY_CATEGORIES.USER_VIEWPOINT) {
          items.push({
            type: 'event',
            category: cat,
            content: sentence,
            confidence: this._estimateConfidence(sentence, 'direct_statement'),
            importance: this._estimateImportance(sentence, cat),
            source: 'chat',
            timestamp: msg.timestamp || Date.now(),
            metadata: { speaker: 'user', msgId: msg.id },
          })
        }
      }
    }
    step.output = items.length
    step.status = 'completed'
    result.stages.push(step)
    return items
  }

  _stageDedup(items, result) {
    const step = { stage: PIPELINE_STAGES.DEDUP, input: items.length, output: 0, status: 'pending' }
    const seen = new Map()
    let duplicates = 0
    for (const item of items) {
      const key = this._normalizeContent(item.content)
      const existing = seen.get(key)
      if (existing) {
        existing.confidence = Math.max(existing.confidence, item.confidence)
        existing.heat = (existing.heat || 0) + 1
        duplicates++
      } else {
        let isDup = false
        for (const [, seenItem] of seen) {
          if (this._isSimilar(item.content, seenItem.content)) {
            seenItem.confidence = Math.max(seenItem.confidence, item.confidence)
            seenItem.heat = (seenItem.heat || 0) + 1
            seenItem.lastMention = Date.now()
            duplicates++
            isDup = true
            break
          }
        }
        if (!isDup) {
          seen.set(key, { ...item, heat: 1, lastMention: Date.now() })
        }
      }
    }
    step.output = seen.size
    step.duplicatesFound = duplicates
    step.status = 'completed'
    result.stages.push(step)
    result.duplicates = duplicates
    return [...seen.values()]
  }

  _stageConflictCheck(items, result) {
    const step = { stage: PIPELINE_STAGES.CONFLICT_CHECK, input: items.length, output: items.length, status: 'pending' }
    const conflicts = []
    const positives = new Map()
    const negatives = new Map()
    const POSITIVE_KWS = ['喜欢', '爱', '偏爱', '爱吃', '想去']
    const NEGATIVE_KWS = ['讨厌', '不喜欢', '反感', '不爱吃', '忌口', '不想去']
    for (const item of items) {
      for (const kw of POSITIVE_KWS) {
        if (item.content.includes(kw)) { positives.set(item.content, item); break }
      }
      for (const kw of NEGATIVE_KWS) {
        if (item.content.includes(kw)) { negatives.set(item.content, item); break }
      }
    }
    for (const [posContent, posItem] of positives) {
      for (const [negContent, negItem] of negatives) {
        const commonWords = this._findCommonWords(posContent, negContent)
        if (commonWords.length >= 1) {
          conflicts.push({
            id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            itemA: { id: posContent, content: posContent, direction: 'positive' },
            itemB: { id: negContent, content: negContent, direction: 'negative' },
            commonTopic: commonWords[0],
            resolved: false,
          })
        }
      }
    }
    step.conflictsFound = conflicts.length
    step.status = 'completed'
    result.stages.push(step)
    result.conflicts = conflicts
    return { items, conflicts }
  }

  _stageConfidenceScore(items, result, source) {
    const step = { stage: PIPELINE_STAGES.CONFIDENCE_SCORE, input: items.length, output: items.length, status: 'pending' }
    for (const item of items) {
      if (item.confidence && item.confidence > 0) continue
      item.confidence = this._estimateConfidence(item.content, source === 'import' ? 'direct_statement' : 'direct_statement')
      if (item.confidence < CONFIDENCE.MIN_INJECTION) {
        item.lowConfidence = true
      }
    }
    step.status = 'completed'
    result.stages.push(step)
    return items
  }

  _stageClassify(items, result) {
    const step = { stage: PIPELINE_STAGES.CLASSIFY, input: items.length, output: 0, status: 'pending' }
    const stored = []
    const now = Date.now()
    for (const item of items) {
      const tier = this._mapCategoryToTier(item.category)
      const subCategory = this._mapCategoryToSubCategory(item.category)
      const effectiveTier = (item.confidence < CONFIDENCE.MIN_INJECTION && tier === 'core') ? 'daily' : tier
      stored.push({
        id: `mem_${now}_${Math.random().toString(36).slice(2, 8)}`,
        tier: effectiveTier,
        subCategory,
        content: item.content,
        source: item.source === 'chat' ? 'chat' : item.source,
        confidence: item.confidence,
        importance: item.importance || 50,
        heat: item.heat || 1,
        lastMention: now,
        createdAt: now,
        updatedAt: now,
        confirmed: (item.confidence || 0) >= 0.7,
        locked: effectiveTier !== 'daily' ? this._isMilestone(item.content) : false,
        expiresAt: null,
        isTemporary: false,
        tags: this._extractTags(item.content),
        topic: item.category,
        vectorId: null,
        embeddingVersion: null,
        metadata: item.metadata || {},
      })
    }
    if (stored.length > 0) {
      const memories = getMemoriesV2(this.characterId)
      const existingKeys = new Set(memories.map((m) => m.content.toLowerCase()))
      for (const item of stored) {
        if (!existingKeys.has(item.content.toLowerCase())) {
          memories.push(item)
        }
      }
      saveMemoriesV2(this.characterId, memories)
    }
    step.output = stored.length
    step.status = 'completed'
    result.stages.push(step)
    return stored
  }

  _classifySentence(sentence) {
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => sentence.includes(kw))) return cat
    }
    return MEMORY_CATEGORIES.DAILY_CHAT
  }

  _estimateConfidence(content, context) {
    if (/可能|也许|大概|好像|似乎|不确定/.test(content)) return CONFIDENCE.USER_VAGUE
    if (context === 'ai_inference') return CONFIDENCE.AI_INFERRED
    return CONFIDENCE.USER_DIRECT
  }

  _estimateImportance(content, category) {
    if (category === MEMORY_CATEGORIES.USER_PROFILE) return 80
    if (category === MEMORY_CATEGORIES.RELATION_EVENT) return 90
    if (category === MEMORY_CATEGORIES.USER_VIEWPOINT) return 70
    if (category === MEMORY_CATEGORIES.EMOTION_TREND) return 40
    return 30
  }

  _isRelationEvent(sentence) {
    const relationKws = CATEGORY_KEYWORDS[MEMORY_CATEGORIES.RELATION_EVENT]
    return relationKws.some((kw) => sentence.includes(kw))
  }

  _detectEmotionTrend(sequence) {
    if (sequence.length < 3) return null
    const positiveKws = ['开心', '兴奋', '幸福', '满足', '期待']
    const negativeKws = ['难过', '焦虑', '压力', '累', '孤独', '沮丧']
    let posCount = 0; let negCount = 0
    for (const kw of sequence) {
      if (positiveKws.includes(kw)) posCount++
      if (negativeKws.includes(kw)) negCount++
    }
    if (posCount >= 3) return '用户在此期间持续处于积极情绪状态'
    if (negCount >= 3) return '用户在此期间持续处于消极情绪状态'
    return null
  }

  _normalizeContent(content) {
    return content.toLowerCase().replace(/[，,。.!！？?\s]/g, '')
  }

  _isSimilar(a, b) {
    const wa = new Set(a.split(/[，,。.!！？?\s、；;]+/).filter((w) => w.length >= 1))
    const wb = new Set(b.split(/[，,。.!！？?\s、；;]+/).filter((w) => w.length >= 1))
    if (wa.size === 0 || wb.size === 0) return false
    let overlap = 0
    for (const w of wa) { if (wb.has(w)) overlap++ }
    const similarity = overlap / Math.min(wa.size, wb.size)
    return similarity > 0.8
  }

  _findCommonWords(a, b) {
    const wa = new Set(a.split(/[，,。.!！？?\s、；;]+/).filter((w) => w.length >= 1))
    const wb = new Set(b.split(/[，,。.!！？?\s、；;]+/).filter((w) => w.length >= 1))
    const common = []
    for (const w of wa) { if (wb.has(w) && w.length >= 2) common.push(w) }
    return common
  }

  _mapCategoryToTier(category) {
    if (category === MEMORY_CATEGORIES.USER_PROFILE) return 'core'
    if (category === MEMORY_CATEGORIES.RELATION_EVENT) return 'emotional'
    if (category === MEMORY_CATEGORIES.USER_VIEWPOINT) return 'core'
    if (category === MEMORY_CATEGORIES.EMOTION_TREND) return 'emotional'
    return 'daily'
  }

  _mapCategoryToSubCategory(category) {
    if (category === MEMORY_CATEGORIES.RELATION_EVENT) return 'first_time'
    if (category === MEMORY_CATEGORIES.EMOTION_TREND) return 'hardship'
    if (category === MEMORY_CATEGORIES.USER_VIEWPOINT) return 'favorite'
    return null
  }

  _isMilestone(content) {
    const milestones = ['第一次', '初次', '首次', '见面', '约会', '旅行', '表白', '告白', '在一起', '纪念日', '周年', '生日']
    return milestones.some((m) => content.includes(m))
  }

  _extractTags(content) {
    const tags = []
    const tagKeywords = {
      '人物': ['你', '他', '她', '名字'],
      '情感': ['喜欢', '爱', '想念', '担心', '关心'],
      '事件': ['去', '做', '看', '吃', '玩', '旅行'],
      '观点': ['觉得', '认为', '梦想', '理想', '打算'],
      '情绪': ['开心', '难过', '生气', '焦虑', '压力'],
    }
    for (const [tag, kws] of Object.entries(tagKeywords)) {
      if (kws.some((kw) => content.includes(kw))) tags.push(tag)
    }
    return tags
  }
}

// ============= 导出工具函数 =============

export function processSingleMessage(characterId, content, role = 'user') {
  const pipeline = new MemoryPipeline(characterId)
  return pipeline.process([{ role, content, timestamp: Date.now() }], 'chat')
}

export function processImportedMessages(characterId, messages) {
  const pipeline = new MemoryPipeline(characterId)
  return pipeline.process(messages, 'import')
}

export function generateImportReport(result) {
  const stats = { core: 0, emotional: 0, daily: 0 }
  for (const item of result.output) {
    if (stats[item.tier] !== undefined) stats[item.tier]++
  }
  return {
    totalInput: result.inputCount,
    totalOutput: result.output.length,
    coreCount: stats.core,
    emotionalCount: stats.emotional,
    dailyCount: stats.daily,
    duplicatesMerged: result.duplicates || 0,
    conflictsFound: result.conflicts?.length || 0,
    lowConfidenceItems: result.output.filter((i) => i.confidence < CONFIDENCE.MIN_INJECTION).length,
    durationMs: result.duration,
    stages: result.stages.map((s) => ({ stage: s.stage, input: s.input, output: s.output })),
  }
}
