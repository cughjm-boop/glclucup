/**
 * SharedSceneMemory — 多人共享场景记忆 (Multi Character Engine V4)
 *
 * 每个角色独立维护自己的记忆（Core/Emotion/Daily），
 * 同时维护 Shared Scene Memory：在场所有角色共享的事件流。
 * - 流萤单独聊天的内容只有流萤知道（私有）
 * - 多人对话中发生的事件所有在场角色共享
 */

export interface SceneMemoryEvent {
  id: string
  type: 'user_action' | 'character_action' | 'scene_event' | 'system'
  /** 涉及的角色 ID 列表 */
  involvedCharacterIds: string[]
  summary: string
  timestamp: number
  /** 是否为私密事件（仅特定角色知晓） */
  isPrivate: boolean
  /** 知晓该事件的角色 ID 列表 */
  knownBy: string[]
}

export interface SharedSceneMemorySnapshot {
  events: SceneMemoryEvent[]
  /** 每个角色的最近共享摘要 */
  characterSharedSummary: Record<string, string>
  lastUpdated: number
}

const STORAGE_PREFIX = 'mce_v4_scene_memory_'

export class SharedSceneMemory {
  private conversationId: string
  private events: SceneMemoryEvent[] = []
  private characterSummaries: Record<string, string> = {}
  private listeners: Set<() => void> = new Set()

  constructor(conversationId: string) {
    this.conversationId = conversationId
    this.load()
  }

  /** 添加一个共享事件 */
  addEvent(event: Omit<SceneMemoryEvent, 'id' | 'timestamp' | 'knownBy'>): SceneMemoryEvent {
    const full: SceneMemoryEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      knownBy: event.isPrivate ? event.involvedCharacterIds : [],
    }
    // 非私密事件 → 所有在场角色都知晓
    this.events.push(full)
    if (!event.isPrivate) {
      // 在调用处注入 present character 列表
    }
    this.notify()
    this.persist()
    return full
  }

  /** 追加知晓者（用于非私密事件） */
  addKnownBy(eventId: string, characterIds: string[]): void {
    const evt = this.events.find((e) => e.id === eventId)
    if (evt && !evt.isPrivate) {
      for (const id of characterIds) {
        if (!evt.knownBy.includes(id)) evt.knownBy.push(id)
      }
      this.notify()
      this.persist()
    }
  }

  /** 获取角色可见的事件列表 */
  getVisibleEvents(characterId: string, limit = 20): SceneMemoryEvent[] {
    return this.events
      .filter((e) => e.isPrivate ? e.knownBy.includes(characterId) : true)
      .slice(-limit)
  }

  /** 获取角色可见的事件摘要文本 */
  getContextText(characterId: string, limit = 5): string {
    const visible = this.getVisibleEvents(characterId, limit)
    if (!visible.length) return ''
    return visible.map((e) => {
      const timeLabel = formatTime(e.timestamp)
      return `[${timeLabel}] ${e.summary}`
    }).join('\n')
  }

  /** 更新角色共享摘要 */
  updateCharacterSummary(characterId: string, summary: string): void {
    this.characterSummaries[characterId] = summary
    this.persist()
  }

  /** 获取角色的共享摘要 */
  getCharacterSummary(characterId: string): string {
    return this.characterSummaries[characterId] || ''
  }

  /** 获取最近 N 条事件 */
  getRecentEvents(n = 10): SceneMemoryEvent[] {
    return this.events.slice(-n)
  }

  /** 清空所有记忆 */
  clear(): void {
    this.events = []
    this.characterSummaries = {}
    this.notify()
    this.persist()
  }

  /** 订阅变更 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 导出快照 */
  exportSnapshot(): SharedSceneMemorySnapshot {
    return {
      events: [...this.events],
      characterSharedSummary: { ...this.characterSummaries },
      lastUpdated: Date.now(),
    }
  }

  private notify(): void {
    this.listeners.forEach((l) => { try { l() } catch { /* ignore */ } })
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_PREFIX + this.conversationId,
        JSON.stringify(this.exportSnapshot()),
      )
    } catch { /* ignore */ }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + this.conversationId)
      if (raw) {
        const snap: SharedSceneMemorySnapshot = JSON.parse(raw)
        this.events = snap.events || []
        this.characterSummaries = snap.characterSharedSummary || {}
      }
    } catch { /* ignore */ }
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** 实例缓存 */
const instances = new Map<string, SharedSceneMemory>()

export function getSharedSceneMemory(conversationId: string): SharedSceneMemory {
  if (!instances.has(conversationId)) {
    instances.set(conversationId, new SharedSceneMemory(conversationId))
  }
  return instances.get(conversationId)!
}

export function disposeSharedSceneMemory(conversationId: string): void {
  const inst = instances.get(conversationId)
  if (inst) {
    inst.clear()
    instances.delete(conversationId)
  }
}
