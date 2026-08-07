/**
 * MemoryTimeline — 记忆时间轴（Memory Engine V2）
 *
 * 将所有重要事件按时间轴保存，AI 讲故事时更自然流畅。
 * 格式：2026/01 第一次见面 → 2026/03 第一次旅行 → 2026/05 第一次告白
 */

import { getMemoriesV2 } from './memoriesV2Service'

export const TIMELINE_EVENT_TYPES = {
  MILESTONE: 'milestone',
  RELATION: 'relation',
  ACHIEVEMENT: 'achievement',
  CHALLENGE: 'challenge',
  DAILY: 'daily',
}

export const TIMELINE_EVENT_ICONS = {
  [TIMELINE_EVENT_TYPES.MILESTONE]: '✨',
  [TIMELINE_EVENT_TYPES.RELATION]: '❤️',
  [TIMELINE_EVENT_TYPES.ACHIEVEMENT]: '🏆',
  [TIMELINE_EVENT_TYPES.CHALLENGE]: '💪',
  [TIMELINE_EVENT_TYPES.DAILY]: '📝',
}

export class MemoryTimeline {
  constructor(characterId) {
    this.characterId = characterId
  }

  build() {
    const memories = getMemoriesV2(this.characterId)
    const events = []
    for (const mem of memories) {
      const event = this._memoryToEvent(mem)
      if (event) events.push(event)
    }
    return events.sort((a, b) => a.timestamp - b.timestamp)
  }

  getMilestones() {
    return this.build().filter((e) => e.type === TIMELINE_EVENT_TYPES.MILESTONE)
  }

  getRelationEvents() {
    return this.build().filter((e) => e.type === TIMELINE_EVENT_TYPES.RELATION)
  }

  getByTimeRange(start, end) {
    return this.build().filter((e) => e.timestamp >= start && e.timestamp <= end)
  }

  toPromptText() {
    const events = this.build()
    if (events.length === 0) return ''
    const groups = new Map()
    for (const event of events) {
      const d = new Date(event.timestamp)
      const key = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(event)
    }
    const lines = ['【记忆时间轴】']
    for (const [period, periodEvents] of groups) {
      const eventDescs = periodEvents
        .filter((e) => e.type !== TIMELINE_EVENT_TYPES.DAILY)
        .slice(0, 5)
        .map((e) => `${TIMELINE_EVENT_ICONS[e.type] || '•'} ${e.description}`)
        .join(' → ')
      if (eventDescs) lines.push(`${period} ${eventDescs}`)
    }
    return lines.join('\n')
  }

  getStats() {
    const events = this.build()
    const byType = {}
    for (const event of events) byType[event.type] = (byType[event.type] || 0) + 1
    let firstTs = Infinity; let lastTs = -Infinity
    for (const event of events) {
      if (event.timestamp < firstTs) firstTs = event.timestamp
      if (event.timestamp > lastTs) lastTs = event.timestamp
    }
    const durationDays = firstTs === Infinity ? 0 : Math.floor((lastTs - firstTs) / (24 * 60 * 60 * 1000))
    return {
      totalEvents: events.length,
      byType,
      firstEventDate: firstTs === Infinity ? null : new Date(firstTs).toLocaleDateString('zh-CN'),
      lastEventDate: lastTs === -Infinity ? null : new Date(lastTs).toLocaleDateString('zh-CN'),
      durationDays,
    }
  }

  _memoryToEvent(mem) {
    const type = this._classifyEvent(mem)
    const timestamp = mem.lastMention || mem.createdAt || Date.now()
    const timeLabel = this._formatTimeLabel(timestamp)
    return {
      id: mem.id,
      type,
      description: mem.content,
      timestamp,
      timeLabel,
      importance: mem.importance || this._calcImportance(mem),
      source: mem.source,
      tags: mem.tags || [],
    }
  }

  _classifyEvent(mem) {
    const content = mem.content || ''
    const subCat = mem.subCategory
    if (subCat === 'first_time' || /第一次|初次|首次|纪念|周年|表白|告白/.test(content)) {
      return TIMELINE_EVENT_TYPES.MILESTONE
    }
    if (subCat === 'first_time' || /见面|约会|旅行|牵手|拥抱|在一起|认识|相遇/.test(content)) {
      return TIMELINE_EVENT_TYPES.RELATION
    }
    if (/毕业|工作|升职|获奖|考试|成功|完成|达成/.test(content)) return TIMELINE_EVENT_TYPES.ACHIEVEMENT
    if (/困难|挫折|失败|难过|沮丧|焦虑|压力|生病/.test(content)) return TIMELINE_EVENT_TYPES.CHALLENGE
    return TIMELINE_EVENT_TYPES.DAILY
  }

  _formatTimeLabel(timestamp) {
    const now = new Date()
    const diffMs = now.getTime() - timestamp
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays}天前`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`
    const d = new Date(timestamp)
    return `${d.getFullYear()}/${d.getMonth() + 1}`
  }

  _calcImportance(mem) {
    let score = 0
    if (mem.tier === 'core') score += 50
    else if (mem.tier === 'emotional') score += 30
    else score += 10
    score += (mem.confidence || 0.5) * 20
    score += Math.min((mem.heat || 0) * 5, 30)
    if (mem.locked) score += 20
    return Math.min(100, Math.round(score))
  }
}

// ============= 便捷函数 =============

export function buildTimeline(characterId) {
  const timeline = new MemoryTimeline(characterId)
  return timeline.build()
}

export function getTimelinePrompt(characterId) {
  const timeline = new MemoryTimeline(characterId)
  return timeline.toPromptText()
}

export function getTimelineStats(characterId) {
  const timeline = new MemoryTimeline(characterId)
  return timeline.getStats()
}

export function getMilestoneChain(characterId) {
  const timeline = new MemoryTimeline(characterId)
  return timeline.getMilestones().map((e) => e.description)
}
