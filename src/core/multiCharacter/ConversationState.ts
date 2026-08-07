/**
 * ConversationState — 统一对话状态（Multi Character Engine V2）
 *
 * 所有模块（Prompt/Scene/Memory/UI）只读取这一份状态，
 * 避免状态不同步。通过 EventEmitter 风格的订阅机制避免整页重渲染。
 */

import type { CharacterRuntime } from './CharacterRuntime'

/** 会话级别事件类型 */
export type ConversationEventType =
  | 'character.enter'
  | 'character.leave'
  | 'speaker.change'
  | 'scene.change'
  | 'message.append'
  | 'message.revoke'
  | 'event.broadcast'
  | 'state.reset'

/** 会话级事件 */
export interface ConversationEvent {
  type: ConversationEventType
  at: number
  payload?: unknown
}

/** 单条消息（会话内统一结构） */
export interface ConversationMessage {
  id: string
  index: number
  role: 'user' | 'assistant' | 'system'
  speakerId?: string | null
  speakerName?: string | null
  content: string
  timestamp: number
  /** 本条消息能被哪些在场角色"感知" */
  witnessedBy: string[]
  /** 本条消息关联的 scene event */
  eventId?: string | null
}

/** 统一对话状态 */
export interface ConversationState {
  /** 当前世界观 */
  worldId: string
  /** 当前场景 ID（由 SceneManager 维护，这里做镜像引用） */
  sceneId: string
  /** 在场角色（运行时实例引用） */
  present: CharacterRuntime[]
  /** 当前发言者角色 ID（null = 等待调度） */
  currentSpeakerId: string | null
  /** 消息序号（严格单调递增） */
  messageSequence: number
  /** 消息表（按 index 排序） */
  messages: ConversationMessage[]
  /** 最近一次用户 @ 的目标角色名 */
  lastMentionTarget: string | null
  /** 最近一次 Scene Event（由系统广播，所有在场角色共享） */
  lastSceneEvent: SceneEvent | null
  /** 版本号（每次 state 变更 +1，供 UI 做精确更新） */
  version: number
  /** 订阅者集合 */
  private: {
    subscribers: Set<(snapshot: ConversationState) => void>
  }
}

/** Scene 广播事件 */
export interface SceneEvent {
  id: string
  type: 'weather' | 'time' | 'location' | 'user_action' | 'story'
  summary: string
  at: number
  /** 在场角色是否都"在场"见证此事件（由 PerceptionFilter 决定） */
  witnesses: string[]
}

/** 会话配置 */
export interface ConversationStateOptions {
  worldId?: string
  sceneId?: string
}

/** 会话单例（按 conversationId 隔离，支持多会话） */
const instances = new Map<string, ConversationStateImpl>()

/** 会话实现（不暴露 private 字段的真实类型） */
class ConversationStateImpl {
  worldId: string
  sceneId: string
  present: CharacterRuntime[] = []
  currentSpeakerId: string | null = null
  messageSequence = 0
  messages: ConversationMessage[] = []
  lastMentionTarget: string | null = null
  lastSceneEvent: SceneEvent | null = null
  version = 0
  private subscribers = new Set<(snapshot: ConversationState) => void>()

  constructor(opts: ConversationStateOptions = {}) {
    this.worldId = opts.worldId || 'star_rail'
    this.sceneId = opts.sceneId || ''
  }

  /** 获取只读快照（浅层复制，避免外部直接改引用） */
  getSnapshot(): ConversationState {
    return {
      worldId: this.worldId,
      sceneId: this.sceneId,
      present: [...this.present],
      currentSpeakerId: this.currentSpeakerId,
      messageSequence: this.messageSequence,
      messages: [...this.messages],
      lastMentionTarget: this.lastMentionTarget,
      lastSceneEvent: this.lastSceneEvent,
      version: this.version,
      // @ts-expect-error 内部字段只读
      private: undefined,
    }
  }

  /** 订阅状态变更（返回 unsubscribe 函数） */
  subscribe(listener: (snapshot: ConversationState) => void): () => void {
    this.subscribers.add(listener)
    return () => {
      this.subscribers.delete(listener)
    }
  }

  /** 触发通知 */
  private emit(): void {
    this.version++
    const snap = this.getSnapshot()
    // 异步通知，避免同步死锁
    queueMicrotask(() => {
      this.subscribers.forEach((fn) => {
        try {
          fn(snap)
        } catch (e) {
          console.error('[ConversationState] subscriber error:', e)
        }
      })
    })
  }

  /** 添加在场角色 */
  addCharacter(runtime: CharacterRuntime): void {
    if (this.present.some((r) => r.characterId === runtime.characterId)) return
    this.present.push(runtime)
    this.emit()
  }

  /** 移除在场角色 */
  removeCharacter(characterId: string): void {
    this.present = this.present.filter((r) => r.characterId !== characterId)
    if (this.currentSpeakerId === characterId) {
      this.currentSpeakerId = null
    }
    this.emit()
  }

  /** 查询角色 */
  getCharacter(characterId: string): CharacterRuntime | undefined {
    return this.present.find((r) => r.characterId === characterId)
  }

  /** 设置当前发言者 */
  setSpeaker(characterId: string | null): void {
    if (this.currentSpeakerId === characterId) return
    this.currentSpeakerId = characterId
    this.emit()
  }

  /** 追加一条消息（自动分配序号） */
  appendMessage(msg: Omit<ConversationMessage, 'index'>): ConversationMessage {
    const full: ConversationMessage = {
      ...msg,
      index: ++this.messageSequence,
    }
    this.messages.push(full)
    this.emit()
    return full
  }

  /** 撤回消息 */
  revokeMessage(messageId: string): void {
    this.messages = this.messages.filter((m) => m.id !== messageId)
    // 重新编号（保持 index 单调连续）
    this.messages.forEach((m, i) => (m.index = i + 1))
    this.messageSequence = this.messages.length
    this.emit()
  }

  /** 更新用户 @ 目标 */
  setMentionTarget(name: string | null): void {
    this.lastMentionTarget = name
  }

  /** 广播 Scene Event */
  broadcastEvent(event: SceneEvent): void {
    this.lastSceneEvent = event
    this.emit()
  }

  /** 重置（切换多人模式时清理调用） */
  reset(): void {
    this.present = []
    this.currentSpeakerId = null
    this.messageSequence = 0
    this.messages = []
    this.lastMentionTarget = null
    this.lastSceneEvent = null
    this.emit()
  }
}

/** 获取或创建会话实例 */
export function getConversationState(conversationId: string, opts?: ConversationStateOptions): ConversationStateImpl {
  if (!instances.has(conversationId)) {
    instances.set(conversationId, new ConversationStateImpl(opts))
  }
  return instances.get(conversationId)!
}

/** 销毁会话实例（切换多人模式或登出时） */
export function disposeConversationState(conversationId: string): void {
  const inst = instances.get(conversationId)
  if (inst) {
    inst.reset()
    instances.delete(conversationId)
  }
}

/** 工具：从用户消息中解析 @ 目标 */
export function parseMentionTarget(content: string, knownNames: string[]): string | null {
  if (!content) return null
  // 支持 "@角色名" 和 "at 角色名" 两种
  const atMatch = content.match(/@\s*([^\s@，。,！？!?"'“”‘’]+)/)
  if (atMatch) {
    const raw = atMatch[1].trim()
    const hit = knownNames.find((n) => raw.includes(n) || n.includes(raw))
    return hit || raw
  }
  return null
}

export type ConversationStateImplPublic = ConversationStateImpl
