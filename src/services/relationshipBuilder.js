/**
 * RelationshipBuilder — 关系重建模块（Memory Engine V2）
 *
 * 从聊天记录与记忆中自动生成"关系摘要"，在新聊天开始时优先注入，
 * 让 AI 真正"记住你们之间发生过什么"。
 */

import { getMemoriesV2, saveMemoriesV2 } from './memoriesV2Service'
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from './storage'

// ============= 关系阶段定义 =============

export const RELATION_STAGES = {
  STRANGER: { key: 'stranger', label: '陌生交流', desc: '初次相遇，保持礼貌与距离', icon: '👋', minDays: 0, minInteractions: 0 },
  ACQUAINTANCE: { key: 'acquaintance', label: '初识阶段', desc: '开始认识，交换基本信息', icon: '🌱', minDays: 3, minInteractions: 5 },
  FAMILIAR: { key: 'familiar', label: '熟悉阶段', desc: '分享日常与兴趣，建立好感', icon: '🌸', minDays: 14, minInteractions: 15 },
  TRUSTING: { key: 'trusting', label: '信任阶段', desc: '互相倾诉与安慰，形成情感依赖', icon: '💗', minDays: 30, minInteractions: 30 },
  STABLE: { key: 'stable', label: '稳定陪伴', desc: '关系稳固，成为彼此的重要存在', icon: '💞', minDays: 90, minInteractions: 60 },
  INTIMATE: { key: 'intimate', label: '深度亲密', desc: '经历过重要事件，彼此深度理解', icon: '💍', minDays: 180, minInteractions: 100 },
}

const STAGE_ORDER = ['stranger', 'acquaintance', 'familiar', 'trusting', 'stable', 'intimate']

const POSITIVE_EMOTIONS = [
  '喜欢', '爱', '开心', '幸福', '满足', '兴奋', '期待', '想念',
  '关心', '担心', '鼓励', '支持', '陪伴', '温柔', '甜蜜', '感动',
]

const NEGATIVE_EMOTIONS = [
  '难过', '焦虑', '压力', '累', '孤独', '沮丧', '生气', '失望',
  '痛苦', '紧张', '害怕', '担心', '委屈', '伤心',
]

const MILESTONE_KWS = [
  '第一次', '初次', '首次', '见面', '约会', '旅行', '牵手', '拥抱',
  '表白', '告白', '在一起', '纪念日', '周年', '认识', '相遇',
  '生日', '春节', '跨年', '情人节',
]

// ============= 关系构建器 =============

export class RelationshipBuilder {
  constructor(characterId) {
    this.characterId = characterId
  }

  build() {
    const memories = getMemoriesV2(this.characterId)
    const now = Date.now()
    const sorted = memories.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    const interactionData = this._analyzeInteractions(sorted, now)
    const stage = this._determineStage(interactionData, sorted)
    const emotionTone = this._analyzeEmotionTone(sorted)
    const milestones = this._extractMilestones(sorted)
    const features = this._identifyRelationshipFeatures(sorted, stage)
    const summary = this._generateSummary(stage, emotionTone, milestones, features, interactionData)
    return {
      characterId: this.characterId,
      stage,
      emotionTone,
      milestones,
      features,
      interactionData,
      summary,
      generatedAt: now,
      source: 'auto',
    }
  }

  buildFromMessages(messages) {
    const now = Date.now()
    const interactionData = this._analyzeMessages(messages, now)
    const stage = this._determineStage(interactionData, [])
    const emotionTone = this._analyzeMessageEmotions(messages)
    const milestones = this._extractMilestonesFromMessages(messages)
    const features = this._identifyFeaturesFromMessages(messages, stage)
    const summary = this._generateSummary(stage, emotionTone, milestones, features, interactionData)
    return {
      characterId: this.characterId,
      stage,
      emotionTone,
      milestones,
      features,
      interactionData,
      summary,
      generatedAt: now,
      source: 'import',
    }
  }

  save(analysis) {
    const all = loadFromStorage(STORAGE_KEYS.RELATIONSHIP_SUMMARY) || {}
    all[this.characterId] = analysis
    saveToStorage(STORAGE_KEYS.RELATIONSHIP_SUMMARY, all)
  }

  static load(characterId) {
    const all = loadFromStorage(STORAGE_KEYS.RELATIONSHIP_SUMMARY) || {}
    return all[characterId] || null
  }

  getPromptSummary() {
    const saved = RelationshipBuilder.load(this.characterId)
    if (!saved) return ''
    const parts = []
    const stageInfo = Object.values(RELATION_STAGES).find((s) => s.key === saved.stage.key)
    if (stageInfo) {
      parts.push(`【关系背景】你们目前处于「${stageInfo.label}」阶段（${stageInfo.desc}）。`)
    }
    if (saved.milestones.length > 0) {
      const ms = saved.milestones.slice(0, 3).map((m) => m.description).join('、')
      parts.push(`共同重要时刻：${ms}。`)
    }
    if (saved.features.length > 0) {
      parts.push(`关系特征：${saved.features.join('、')}。`)
    }
    return parts.join(' ')
  }

  _analyzeInteractions(memories, now) {
    if (memories.length === 0) {
      return { totalCount: 0, userMessages: 0, firstTime: null, lastTime: null, durationDays: 0, dailyAvg: 0 }
    }
    const userMsgs = memories.filter((m) => m.source === 'chat' || m.source === 'import')
    const first = memories[0]
    const last = memories[memories.length - 1]
    const durationMs = (last.createdAt || now) - (first.createdAt || now)
    const durationDays = Math.max(1, Math.floor(durationMs / (24 * 60 * 60 * 1000)))
    return {
      totalCount: memories.length,
      userMessages: userMsgs.length,
      firstTime: first.createdAt || now,
      lastTime: last.createdAt || now,
      durationDays,
      dailyAvg: Math.round((userMsgs.length / durationDays) * 10) / 10,
    }
  }

  _analyzeMessages(messages, now) {
    if (messages.length === 0) {
      return { totalCount: 0, userMessages: 0, firstTime: null, lastTime: null, durationDays: 0, dailyAvg: 0 }
    }
    const userMsgs = messages.filter((m) => m.role === 'user')
    const first = messages[0]
    const last = messages[messages.length - 1]
    const durationMs = (last.timestamp || now) - (first.timestamp || now)
    const durationDays = Math.max(1, Math.floor(durationMs / (24 * 60 * 60 * 1000)))
    return {
      totalCount: messages.length,
      userMessages: userMsgs.length,
      firstTime: first.timestamp || now,
      lastTime: last.timestamp || now,
      durationDays,
      dailyAvg: Math.round((userMsgs.length / durationDays) * 10) / 10,
    }
  }

  _determineStage(interactionData) {
    const days = interactionData.durationDays
    const interactions = interactionData.userMessages
    for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
      const stageKey = STAGE_ORDER[i]
      const stage = Object.values(RELATION_STAGES).find((s) => s.key === stageKey)
      if (!stage) continue
      if (days >= stage.minDays && interactions >= stage.minInteractions) {
        return {
          key: stage.key,
          label: stage.label,
          desc: stage.desc,
          icon: stage.icon,
          progress: this._calculateProgress(stage, days, interactions),
        }
      }
    }
    const stranger = RELATION_STAGES.STRANGER
    return { key: stranger.key, label: stranger.label, desc: stranger.desc, icon: stranger.icon, progress: 0 }
  }

  _calculateProgress(currentStage, days, interactions) {
    const nextIndex = STAGE_ORDER.indexOf(currentStage.key) + 1
    if (nextIndex >= STAGE_ORDER.length) return 100
    const nextStage = Object.values(RELATION_STAGES).find((s) => s.key === STAGE_ORDER[nextIndex])
    if (!nextStage) return 100
    const dayProgress = Math.min(1, days / nextStage.minDays)
    const interactionProgress = Math.min(1, interactions / nextStage.minInteractions)
    return Math.round(Math.min(100, (dayProgress + interactionProgress) / 2 * 100))
  }

  _analyzeEmotionTone(memories) {
    let posCount = 0; let negCount = 0
    for (const m of memories) {
      const content = m.content || ''
      for (const kw of POSITIVE_EMOTIONS) { if (content.includes(kw)) { posCount++; break } }
      for (const kw of NEGATIVE_EMOTIONS) { if (content.includes(kw)) { negCount++; break } }
    }
    const total = posCount + negCount
    if (total === 0) return { type: 'neutral', label: '平稳', positiveRatio: 0.5, details: '情感表达较少，互动相对克制。' }
    const positiveRatio = posCount / total
    if (positiveRatio >= 0.7) return { type: 'positive', label: '积极温馨', positiveRatio, details: '互动中积极情感占主导，氛围温馨愉悦。' }
    if (positiveRatio >= 0.5) return { type: 'mixed_positive', label: '积极混合', positiveRatio, details: '情感基调积极，偶尔有负面情绪但总体向好。' }
    if (positiveRatio >= 0.3) return { type: 'mixed', label: '情感交织', positiveRatio, details: '情感波动较大，有甜蜜也有困扰，体现关系深度。' }
    return { type: 'negative', label: '压力较大', positiveRatio, details: '近期负面情绪较多，需要更多关心与陪伴。' }
  }

  _analyzeMessageEmotions(messages) {
    let posCount = 0; let negCount = 0
    for (const msg of messages) {
      const content = (msg.content || '').trim()
      for (const kw of POSITIVE_EMOTIONS) { if (content.includes(kw)) { posCount++; break } }
      for (const kw of NEGATIVE_EMOTIONS) { if (content.includes(kw)) { negCount++; break } }
    }
    const total = posCount + negCount
    if (total === 0) return { type: 'neutral', label: '平稳', positiveRatio: 0.5, details: '情感表达较少，互动相对克制。' }
    const positiveRatio = posCount / total
    if (positiveRatio >= 0.7) return { type: 'positive', label: '积极温馨', positiveRatio, details: '互动中积极情感占主导。' }
    if (positiveRatio >= 0.5) return { type: 'mixed_positive', label: '积极混合', positiveRatio, details: '情感基调积极。' }
    if (positiveRatio >= 0.3) return { type: 'mixed', label: '情感交织', positiveRatio, details: '情感波动较大。' }
    return { type: 'negative', label: '压力较大', positiveRatio, details: '近期负面情绪较多。' }
  }

  _extractMilestones(memories) {
    const milestones = []
    const seen = new Set()
    for (const m of memories) {
      const content = m.content || ''
      for (const kw of MILESTONE_KWS) {
        if (content.includes(kw) && !seen.has(content)) {
          seen.add(content)
          milestones.push({
            id: m.id,
            description: content.length > 40 ? content.slice(0, 40) + '…' : content,
            timestamp: m.createdAt || Date.now(),
            type: this._classifyMilestoneType(content),
            source: m.source,
          })
          break
        }
      }
    }
    return milestones.sort((a, b) => a.timestamp - b.timestamp).slice(0, 10)
  }

  _extractMilestonesFromMessages(messages) {
    const milestones = []
    const seen = new Set()
    for (const msg of messages) {
      const content = (msg.content || '').trim()
      for (const kw of MILESTONE_KWS) {
        if (content.includes(kw) && !seen.has(content)) {
          seen.add(content)
          milestones.push({
            id: `ms_${msg.timestamp || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            description: content.length > 40 ? content.slice(0, 40) + '…' : content,
            timestamp: msg.timestamp || Date.now(),
            type: this._classifyMilestoneType(content),
            source: 'import',
          })
          break
        }
      }
    }
    return milestones.sort((a, b) => a.timestamp - b.timestamp).slice(0, 10)
  }

  _classifyMilestoneType(content) {
    if (/表白|告白|在一起/.test(content)) return 'confession'
    if (/约会|旅行|牵手|拥抱/.test(content)) return 'relationship'
    if (/见面|相遇|认识|第一次/.test(content)) return 'first_meeting'
    if (/纪念日|周年|生日|跨年|情人节/.test(content)) return 'anniversary'
    return 'event'
  }

  _identifyRelationshipFeatures(memories, stage) {
    const features = []
    const contents = memories.map((m) => m.content || '').join(' ')
    if (/安慰|难过|伤心|陪伴/.test(contents)) features.push('互相安慰与陪伴')
    if (/吃|喝|玩|看|听|逛|买/.test(contents)) features.push('日常分享')
    if (/一起|共同|陪伴/.test(contents)) features.push('共同经历')
    if (/梦想|理想|未来|计划|价值观/.test(contents)) features.push('深度交流')
    if (/鼓励|支持|加油|相信/.test(contents)) features.push('情感支持')
    if (/哈哈|嘻嘻|笑|玩笑|逗/.test(contents)) features.push('幽默互动')
    if (['trusting', 'stable', 'intimate'].includes(stage.key)) {
      features.push('情感依赖')
      if (stage.key === 'intimate') features.push('深度联结')
    }
    return features.slice(0, 5)
  }

  _identifyFeaturesFromMessages(messages, stage) {
    const contents = messages.map((m) => m.content || '').join(' ')
    const fakeMem = [{ content: contents }]
    return this._identifyRelationshipFeatures(fakeMem, stage)
  }

  _generateSummary(stage, emotionTone, milestones, features, interactionData) {
    const parts = []
    const stageInfo = Object.values(RELATION_STAGES).find((s) => s.key === stage.key)
    if (stageInfo) {
      parts.push(
        `用户与角色从最初的${RELATION_STAGES.STRANGER.label}，经过${interactionData.durationDays}天${interactionData.userMessages}次互动，` +
        `逐渐发展到「${stageInfo.label}」阶段。${stageInfo.desc}。`
      )
    }
    parts.push(`互动中情感基调为「${emotionTone.label}」，${emotionTone.details}`)
    if (milestones.length > 0) {
      const msDesc = milestones.slice(0, 3).map((m) => m.description).join('、')
      parts.push(`期间共同经历了 ${msDesc} 等重要时刻。`)
    }
    if (features.length > 0) parts.push(`关系特征包括：${features.join('、')}。`)
    if (['stable', 'intimate'].includes(stage.key)) {
      parts.push('关系已发展为稳定且亲密的陪伴关系。')
    } else if (stage.key === 'trusting') {
      parts.push('双方已建立深厚的信任，继续发展将走向更稳定的阶段。')
    }
    return parts.join(' ')
  }
}

// ============= 便捷函数 =============

export function buildAndSaveRelationship(characterId) {
  const builder = new RelationshipBuilder(characterId)
  const analysis = builder.build()
  builder.save(analysis)
  return analysis
}

export function buildRelationshipFromImport(characterId, messages) {
  const builder = new RelationshipBuilder(characterId)
  const analysis = builder.buildFromMessages(messages)
  builder.save(analysis)
  return analysis
}

export function getRelationshipSummary(characterId) {
  const saved = RelationshipBuilder.load(characterId)
  if (saved) return saved
  return buildAndSaveRelationship(characterId)
}

export function getRelationshipPrompt(characterId) {
  const builder = new RelationshipBuilder(characterId)
  return builder.getPromptSummary()
}

export function getFormattedRelationshipSummary(characterId) {
  const analysis = getRelationshipSummary(characterId)
  return analysis ? analysis.summary : ''
}
