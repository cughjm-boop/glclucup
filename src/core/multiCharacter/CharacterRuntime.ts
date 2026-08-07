/**
 * CharacterRuntime — 角色运行时状态（Multi Character Engine V2）
 *
 * 每个在场角色维护独立运行时状态：
 *  - 情绪、位置、动作、是否正在发言、上次发言时间、与用户关系度等
 * 这是运行时数据，不修改角色数据库。多人切换时不残留状态。
 */

/** 情绪枚举（轻量，便于 Prompt 序列化） */
export type Emotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'curious'
  | 'shy'
  | 'serious'
  | 'playful'
  | 'tired'
  | 'surprised'

/** 关系度元数据（本地缓存，不每轮重算） */
export interface RelationshipCache {
  /** 关系分数 0~100 */
  score: number
  /** 阶段：初识/熟悉/好友/挚友 */
  stage: 'stranger' | 'acquaintance' | 'friend' | 'close_friend'
  /** 最近更新时间 */
  updatedAt: number
  /** 来源：local_memory / import / user_override */
  source: 'local_memory' | 'import' | 'user_override'
}

/** 角色运行时配置 */
export interface CharacterRuntimeOptions {
  characterId: string
  characterName: string
  /** 角色数据快照（来自 characterDataService，只读） */
  profile?: Record<string, unknown>
  /** 初始情绪 */
  emotion?: Emotion
  /** 初始位置描述 */
  position?: string
  /** 初始动作 */
  action?: string
  /** 关系度缓存 */
  relationship?: RelationshipCache
}

/** 角色运行时实例 */
export class CharacterRuntime {
  readonly characterId: string
  readonly characterName: string
  readonly profile: Record<string, unknown>

  /** 运行时情绪 */
  emotion: Emotion
  /** 位置（如 "沙发"、"窗边"） */
  position: string
  /** 动作（如 "坐着"、"站着"、"双手抱胸"） */
  action: string
  /** 朝向 */
  facing: string = '面向用户'
  /** 是否正在发言（用于 UI 高亮） */
  isSpeaking = false
  /** 上次发言时间戳 */
  lastSpokeAt = 0
  /** 发言冷却计数（-1 = 刚发言过，冷却中；>=0 冷却递减） */
  cooldown = 0
  /** 与用户关系度本地缓存 */
  relationship: RelationshipCache
  /** 最近看见过的 scene event 列表（角色不在场时无法获取） */
  witnessedEventIds: string[] = []
  /** 最近聊天摘要（用于离开后恢复） */
  lastChatSummary: string = ''
  /** 入场时间 */
  enteredAt: number

  constructor(opts: CharacterRuntimeOptions) {
    this.characterId = opts.characterId
    this.characterName = opts.characterName
    this.profile = opts.profile || {}
    this.emotion = opts.emotion || 'neutral'
    this.position = opts.position || '默认位置'
    this.action = opts.action || '站着'
    this.enteredAt = Date.now()
    this.relationship = opts.relationship || {
      score: 0,
      stage: 'stranger',
      updatedAt: Date.now(),
      source: 'local_memory',
    }
  }

  /** 重置发言冷却（新用户消息到来时调用） */
  tickCooldown(): void {
    if (this.cooldown > 0) this.cooldown--
  }

  /** 记录一次发言 */
  markSpoke(): void {
    this.lastSpokeAt = Date.now()
    this.isSpeaking = true
    this.cooldown = 2 // 冷却 2-3 轮
  }

  /** 结束发言 */
  endSpeaking(): void {
    this.isSpeaking = false
  }

  /** 判断是否在冷却中（冷却 > 0 不建议发言） */
  isCoolingDown(): boolean {
    return this.cooldown > 0
  }

  /** 更新情绪（可选：带半衰期） */
  setEmotion(e: Emotion): void {
    this.emotion = e
  }

  /** 更新关系度（带阶段自动换算） */
  updateRelationship(delta: number, source: RelationshipCache['source'] = 'local_memory'): RelationshipCache {
    const score = Math.max(0, Math.min(100, this.relationship.score + delta))
    const stage: RelationshipCache['stage'] =
      score >= 75 ? 'close_friend' : score >= 50 ? 'friend' : score >= 25 ? 'acquaintance' : 'stranger'
    this.relationship = {
      ...this.relationship,
      score,
      stage,
      updatedAt: Date.now(),
      source,
    }
    return this.relationship
  }

  /** 记录看见过的事件 */
  witnessEvent(eventId: string): void {
    if (!this.witnessedEventIds.includes(eventId)) {
      this.witnessedEventIds.push(eventId)
      // 限制长度
      if (this.witnessedEventIds.length > 50) {
        this.witnessedEventIds = this.witnessedEventIds.slice(-50)
      }
    }
  }

  /** 更新最近聊天摘要（离开前调用） */
  setLastChatSummary(summary: string): void {
    this.lastChatSummary = summary
  }

  /**
   * 生成"当前状态"摘要（一行文本，用于其他角色 Prompt 引用）
   * 仅精简信息，不注入完整设定
   */
  buildStatusSummary(): string {
    const parts: string[] = [this.characterName]
    const emotionMap: Record<Emotion, string> = {
      neutral: '平静',
      happy: '开心',
      sad: '难过',
      angry: '生气',
      curious: '好奇',
      shy: '害羞',
      serious: '严肃',
      playful: '俏皮',
      tired: '疲惫',
      surprised: '惊讶',
    }
    parts.push(`情绪${emotionMap[this.emotion]}`)
    if (this.position) parts.push(`在${this.position}`)
    if (this.action) parts.push(this.action)
    return parts.join('，')
  }

  /**
   * 生成角色入场动作文本（用于 AI 第一次说话之前的"入场描述"）
   */
  buildEntryAction(): string {
    const parts: string[] = []
    const entryActions = ['走了过来', '推门进来', '出现在门口', '从旁边走来', '停下脚步', '看了过来']
    const pick = entryActions[Math.floor(Math.random() * entryActions.length)]
    parts.push(`${this.characterName}${pick}。`)
    if (this.action) parts.push(`${this.action}。`)
    if (this.position) parts.push(`在${this.position}停下。`)
    return parts.join('')
  }

  /**
   * 导出为可序列化的快照（离开时保存）
   */
  toSnapshot(): CharacterRuntimeSnapshot {
    return {
      characterId: this.characterId,
      characterName: this.characterName,
      emotion: this.emotion,
      position: this.position,
      action: this.action,
      facing: this.facing,
      lastSpokeAt: this.lastSpokeAt,
      relationship: this.relationship,
      witnessedEventIds: [...this.witnessedEventIds],
      lastChatSummary: this.lastChatSummary,
      enteredAt: this.enteredAt,
    }
  }

  /**
   * 从快照恢复
   */
  static fromSnapshot(snap: CharacterRuntimeSnapshot, profile?: Record<string, unknown>): CharacterRuntime {
    const rt = new CharacterRuntime({
      characterId: snap.characterId,
      characterName: snap.characterName,
      profile,
      emotion: snap.emotion,
      position: snap.position,
      action: snap.action,
      relationship: snap.relationship,
    })
    rt.facing = snap.facing
    rt.lastSpokeAt = snap.lastSpokeAt
    rt.witnessedEventIds = [...snap.witnessedEventIds]
    rt.lastChatSummary = snap.lastChatSummary
    rt.enteredAt = snap.enteredAt || Date.now()
    return rt
  }
}

/** 可序列化快照 */
export interface CharacterRuntimeSnapshot {
  characterId: string
  characterName: string
  emotion: Emotion
  position: string
  action: string
  facing: string
  lastSpokeAt: number
  relationship: RelationshipCache
  witnessedEventIds: string[]
  lastChatSummary: string
  enteredAt: number
}

/** 本地持久化（localStorage 友好） */
const RUNTIME_STORAGE_KEY = 'mce_v2_runtime_v1'

export function loadAllRuntimeSnapshots(): Record<string, CharacterRuntimeSnapshot> {
  try {
    const raw = localStorage.getItem(RUNTIME_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveRuntimeSnapshot(convId: string, snap: CharacterRuntimeSnapshot): void {
  try {
    const all = loadAllRuntimeSnapshots()
    const key = `${convId}:${snap.characterId}`
    all[key] = snap
    localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* quota 忽略 */
  }
}

export function loadRuntimeSnapshot(convId: string, characterId: string): CharacterRuntimeSnapshot | null {
  const all = loadAllRuntimeSnapshots()
  const key = `${convId}:${characterId}`
  return all[key] || null
}

export function deleteRuntimeSnapshot(convId: string, characterId: string): void {
  try {
    const all = loadAllRuntimeSnapshots()
    const key = `${convId}:${characterId}`
    delete all[key]
    localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function clearAllRuntimeSnapshots(): void {
  try {
    localStorage.removeItem(RUNTIME_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
