/**
 * CharacterRuntimeV4 — V4 角色运行时状态
 *
 * 增强版：在 V2 基础上增加 Presence、Initiative、服装/武器/持有物等字段。
 * 运行时数据不修改官方数据库。
 */

export type Emotion =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'curious'
  | 'shy' | 'serious' | 'playful' | 'tired' | 'surprised'

export interface RelationshipCache {
  score: number
  stage: 'stranger' | 'acquaintance' | 'friend' | 'close_friend'
  updatedAt: number
  source: 'local_memory' | 'import' | 'user_override'
}

export interface InitiativeMap {
  [characterName: string]: number
}

/** 官方主动性表（固定人格参数） */
export const OFFICIAL_INITIATIVE: InitiativeMap = {
  '三月七': 95, '花火': 90, '知更鸟': 70, '流萤': 60,
  '银狼': 45, '刃': 15, '卡芙卡': 55, '希儿': 50,
  '布洛妮娅': 40, '符玄': 35, '镜流': 25, '罗刹': 30,
  '白露': 65, '娜塔莎': 50, '杰帕德': 30, '景元': 25,
  '黑塔': 40, '黑天鹅': 35, '黄泉': 30, '寒鸦': 45,
  '丹恒': 35, '迪斯科': 40, '虎克': 70, '艾丝妲': 55,
}

export interface CharacterRuntimeV4Options {
  characterId: string
  characterName: string
  profile?: Record<string, unknown>
  emotion?: Emotion
  position?: string
  action?: string
  /** 官方主动性覆盖 */
  initiative?: number
  /** 当前服装（运行时） */
  costume?: string
  /** 当前发型（运行时覆盖） */
  hairstyle?: string
  /** 当前武器（运行时覆盖） */
  weapon?: string
  /** 当前持有物 */
  holding?: string
}

export class CharacterRuntimeV4 {
  readonly characterId: string
  readonly characterName: string
  readonly profile: Record<string, unknown>

  emotion: Emotion
  position: string
  action: string
  facing: string = '面向用户'
  isSpeaking = false
  lastSpokeAt = 0
  cooldown = 0
  relationship: RelationshipCache

  /** Presence 存在感 0-100 */
  presence = 50
  /** Initiative 主动性 0-100（固定人格参数） */
  initiative: number
  /** 当前服装（可运行时换装） */
  costume: string
  /** 当前发型 */
  hairstyle: string
  /** 当前武器 */
  weapon: string
  /** 当前持有物 */
  holding: string = ''

  witnessedEventIds: string[] = []
  lastChatSummary: string = ''
  enteredAt: number
  /** 本次会话中发言次数 */
  speakCount = 0

  constructor(opts: CharacterRuntimeV4Options) {
    this.characterId = opts.characterId
    this.characterName = opts.characterName
    this.profile = opts.profile || {}
    this.emotion = opts.emotion || 'neutral'
    this.position = opts.position || '默认位置'
    this.action = opts.action || '站着'
    this.enteredAt = Date.now()
    this.initiative = opts.initiative ?? OFFICIAL_INITIATIVE[opts.characterName] ?? 50
    this.costume = opts.costume || '官方默认'
    this.hairstyle = opts.hairstyle || '官方设定'
    this.weapon = opts.weapon || '官方武器'
    this.relationship = {
      score: 0, stage: 'stranger', updatedAt: Date.now(), source: 'local_memory',
    }
  }

  markSpoke(): void {
    this.lastSpokeAt = Date.now()
    this.isSpeaking = true
    this.cooldown = 2
    this.speakCount++
  }

  endSpeaking(): void { this.isSpeaking = false }
  tickCooldown(): void { if (this.cooldown > 0) this.cooldown-- }
  isCoolingDown(): boolean { return this.cooldown > 0 }

  /** 更新存在感（每次发言 +3，被动 -1） */
  bumpPresence(delta = 3): void {
    this.presence = Math.max(0, Math.min(100, this.presence + delta))
  }

  decayPresence(delta = 1): void {
    this.presence = Math.max(0, this.presence - delta)
  }

  setEmotion(e: Emotion): void { this.emotion = e }

  /** 主动性影响发言概率 */
  getSpeakProbability(baseScore: number): number {
    const initiativeBoost = (this.initiative - 50) / 50 // -1 ~ +1
    const presenceBoost = (this.presence - 50) / 100 // -0.5 ~ +0.5
    return baseScore * (1 + initiativeBoost * 0.3 + presenceBoost * 0.15)
  }

  updateRelationship(delta: number): RelationshipCache {
    const score = Math.max(0, Math.min(100, this.relationship.score + delta))
    const stage: RelationshipCache['stage'] =
      score >= 75 ? 'close_friend' : score >= 50 ? 'friend' : score >= 25 ? 'acquaintance' : 'stranger'
    this.relationship = { ...this.relationship, score, stage, updatedAt: Date.now() }
    return this.relationship
  }

  witnessEvent(eventId: string): void {
    if (!this.witnessedEventIds.includes(eventId)) {
      this.witnessedEventIds.push(eventId)
      if (this.witnessedEventIds.length > 50) this.witnessedEventIds = this.witnessedEventIds.slice(-50)
    }
  }

  buildStatusSummary(): string {
    const emotionMap: Record<Emotion, string> = {
      neutral: '平静', happy: '开心', sad: '难过', angry: '生气', curious: '好奇',
      shy: '害羞', serious: '严肃', playful: '俏皮', tired: '疲惫', surprised: '惊讶',
    }
    return [
      this.characterName,
      `情绪${emotionMap[this.emotion]}`,
      `在${this.position}`,
      this.action,
      `存在感${Math.round(this.presence)}`,
      `主动性${this.initiative}`,
    ].join('，')
  }

  buildEntryAction(): string {
    const actions = ['走了过来', '推门进来', '出现在门口', '从旁边走来', '停下脚步', '看了过来']
    const pick = actions[Math.floor(Math.random() * actions.length)]
    return `${this.characterName}${pick}。${this.action}。在${this.position}停下。`
  }

  toSnapshot(): CharacterRuntimeV4Snapshot {
    return {
      characterId: this.characterId, characterName: this.characterName,
      emotion: this.emotion, position: this.position, action: this.action, facing: this.facing,
      lastSpokeAt: this.lastSpokeAt, relationship: this.relationship,
      witnessedEventIds: [...this.witnessedEventIds], lastChatSummary: this.lastChatSummary,
      enteredAt: this.enteredAt, presence: this.presence, initiative: this.initiative,
      costume: this.costume, hairstyle: this.hairstyle, weapon: this.weapon, holding: this.holding,
      speakCount: this.speakCount,
    }
  }

  static fromSnapshot(snap: CharacterRuntimeV4Snapshot, profile?: Record<string, unknown>): CharacterRuntimeV4 {
    const rt = new CharacterRuntimeV4({
      characterId: snap.characterId, characterName: snap.characterName, profile,
      emotion: snap.emotion, position: snap.position, action: snap.action,
      initiative: snap.initiative, costume: snap.costume, hairstyle: snap.hairstyle,
      weapon: snap.weapon, holding: snap.holding,
    })
    rt.facing = snap.facing
    rt.lastSpokeAt = snap.lastSpokeAt
    rt.witnessedEventIds = [...snap.witnessedEventIds]
    rt.lastChatSummary = snap.lastChatSummary
    rt.enteredAt = snap.enteredAt || Date.now()
    rt.presence = snap.presence ?? 50
    rt.speakCount = snap.speakCount ?? 0
    return rt
  }
}

export interface CharacterRuntimeV4Snapshot {
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
  presence: number
  initiative: number
  costume: string
  hairstyle: string
  weapon: string
  holding: string
  speakCount: number
}

const STORAGE_KEY = 'mce_v4_runtime_v1'

export function loadAllV4Snapshots(): Record<string, CharacterRuntimeV4Snapshot> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
export function saveV4Snapshot(convId: string, snap: CharacterRuntimeV4Snapshot): void {
  try {
    const all = loadAllV4Snapshots()
    all[`${convId}:${snap.characterId}`] = snap
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}
export function loadV4Snapshot(convId: string, characterId: string): CharacterRuntimeV4Snapshot | null {
  return loadAllV4Snapshots()[`${convId}:${characterId}`] || null
}
export function deleteV4Snapshot(convId: string, characterId: string): void {
  try {
    const all = loadAllV4Snapshots()
    delete all[`${convId}:${characterId}`]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}
