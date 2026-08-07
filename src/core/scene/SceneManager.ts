/**
 * SceneManager — 场景状态管理器（Chat Scene Engine V3）
 *
 * 将"场景"升级为独立状态模块，由程序管理，AI 只负责表演。
 * 解决场景跳跃、地点瞬移、天气突变、多角色位置混乱等问题。
 *
 * 所有场景变化必须经过 SceneManager，禁止 AI 直接修改场景。
 */

// ===== 类型定义 =====

/** 角色位置（独立存储） */
export interface CharacterPosition {
  characterId: string
  /** 位置描述，如 "沙发"、"窗边" */
  position: string
  /** 当前动作，如 "坐着"、"站着" */
  action: string
  /** 朝向，如 "面向用户"、"面向窗外" */
  facing: string
}

/** 可交互物体 */
export interface InteractableObject {
  name: string
  description?: string
  addedBy: 'user' | 'system' | 'ai'
  addedAt: number
}

/** 场景状态 */
export interface SceneState {
  /** 世界观 ID，如 "star_rail" */
  worldId: string
  /** 地点，如 "流萤家" */
  location: string
  /** 区域，如 "客厅" */
  area: string
  /** 具体位置，如 "沙发" */
  position: string
  /** 天气 */
  weather: string
  /** 时段 */
  timePeriod: string
  /** 场景简述 */
  sceneDescription: string
  /** 角色位置数组 */
  characters: CharacterPosition[]
  /** 可交互物体列表 */
  interactableObjects: InteractableObject[]
  /** 版本号（每次更新递增） */
  version: number
  /** 是否锁定（锁定后 AI 不可修改） */
  locked: boolean
  /** 最后更新时间戳 */
  updatedAt: number
}

/** 场景变化记录 */
export interface SceneChangeEntry {
  version: number
  timestamp: number
  /** 变化来源 */
  source: 'user' | 'system' | 'story_event'
  /** 变化前状态快照（精简版） */
  previous: {
    location: string
    area: string
    position: string
  }
  /** 变化后状态 */
  current: {
    location: string
    area: string
    position: string
  }
  /** 变化描述 */
  description: string
}

/** 场景更新指令 */
export interface SceneUpdateCommand {
  type: 'location' | 'area' | 'position' | 'weather' | 'timePeriod' | 'action' | 'facing' | 'addObject' | 'removeObject' | 'lock' | 'unlock'
  characterId?: string
  value: string
  source: 'user' | 'system' | 'story_event'
}

/** 校验结果 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  /** 是否可自动修正 */
  autoFixable: boolean
  /** 自动修正后的文本（如果可以） */
  fixedText?: string
}

export interface ValidationError {
  type: 'location_conflict' | 'character_not_present' | 'weather_conflict' | 'time_conflict' | 'object_not_found' | 'scene_locked'
  message: string
  detail: string
}

export interface ValidationWarning {
  type: 'minor_time_mismatch' | 'minor_weather_variance' | 'ambiguous_location'
  message: string
}

// ===== 默认场景 =====

export const DEFAULT_SCENE: SceneState = {
  worldId: 'star_rail',
  location: '未知地点',
  area: '',
  position: '',
  weather: '晴',
  timePeriod: '',
  sceneDescription: '',
  characters: [],
  interactableObjects: [],
  version: 0,
  locked: false,
  updatedAt: 0,
}

// ===== SceneManager 类 =====

export type SceneChangeListener = (state: SceneState) => void

export class SceneManager {
  private scene: SceneState
  private history: SceneChangeEntry[] = []
  private readonly maxHistorySize = 20
  private listeners: Set<SceneChangeListener> = new Set()

  constructor(initialScene?: Partial<SceneState>) {
    this.scene = { ...DEFAULT_SCENE, ...initialScene, updatedAt: Date.now() }
  }

  /** 订阅场景变化（用于 UI 实时刷新） */
  subscribe(listener: SceneChangeListener): () => void {
    this.listeners.add(listener)
    // 立即推送一次当前状态，确保订阅者立刻得到渲染数据
    try {
      listener(this.scene)
    } catch (e) {
      console.error('[SceneManager] 订阅者首次推送异常:', e)
    }
    return () => this.listeners.delete(listener)
  }

  /** 通知所有订阅者场景已更新 */
  private notify() {
    for (const fn of this.listeners) {
      try {
        fn(this.scene)
      } catch (e) {
        console.error('[SceneManager] 订阅者异常:', e)
      }
    }
  }

  /** 获取当前场景状态（只读） */
  getState(): Readonly<SceneState> {
    return this.scene
  }

  /** 获取场景快照（用于 Prompt 注入） */
  getSnapshot(): Readonly<SceneState> {
    return { ...this.scene }
  }

  /** 获取场景历史（最近 N 条） */
  getHistory(): readonly SceneChangeEntry[] {
    return this.history
  }

  /** 获取最近一次场景变化 */
  getLastChange(): SceneChangeEntry | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null
  }

  /**
   * 处理场景更新指令
   * 分层更新：location > area > position > action
   */
  applyCommand(command: SceneUpdateCommand): boolean {
    if (this.scene.locked && command.source !== 'system') {
      console.warn('[SceneManager] 场景已锁定，忽略非系统指令:', command)
      return false
    }

    const previous = {
      location: this.scene.location,
      area: this.scene.area,
      position: this.scene.position,
    }

    let changed = false

    switch (command.type) {
      case 'location':
        if (this.scene.location !== command.value) {
          this.scene.location = command.value
          // 切换地点时重置区域和位置
          this.scene.area = ''
          this.scene.position = ''
          changed = true
        }
        break

      case 'area':
        if (this.scene.area !== command.value) {
          this.scene.area = command.value
          // 切换区域时重置位置
          this.scene.position = ''
          changed = true
        }
        break

      case 'position':
        if (this.scene.position !== command.value) {
          this.scene.position = command.value
          changed = true
        }
        break

      case 'weather':
        if (this.scene.weather !== command.value) {
          this.scene.weather = command.value
          changed = true
        }
        break

      case 'timePeriod':
        if (this.scene.timePeriod !== command.value) {
          this.scene.timePeriod = command.value
          changed = true
        }
        break

      case 'action':
        // 仅更新角色 action，不改位置
        if (command.characterId) {
          const char = this.scene.characters.find((c) => c.characterId === command.characterId)
          if (char) {
            char.action = command.value
            changed = true
          }
        }
        break

      case 'facing':
        if (command.characterId) {
          const char = this.scene.characters.find((c) => c.characterId === command.characterId)
          if (char) {
            char.facing = command.value
            changed = true
          }
        }
        break

      case 'addObject':
        if (!this.scene.interactableObjects.some((o) => o.name === command.value)) {
          this.scene.interactableObjects.push({
            name: command.value,
            addedBy: command.source === 'user' ? 'user' : 'system',
            addedAt: Date.now(),
          })
          changed = true
        }
        break

      case 'removeObject':
        this.scene.interactableObjects = this.scene.interactableObjects.filter(
          (o) => o.name !== command.value
        )
        changed = true
        break

      case 'lock':
        this.scene.locked = true
        changed = true
        break

      case 'unlock':
        this.scene.locked = false
        changed = true
        break
    }

    if (changed) {
      this.scene.version++
      this.scene.updatedAt = Date.now()

      // 记录到场景历史
      const entry: SceneChangeEntry = {
        version: this.scene.version,
        timestamp: Date.now(),
        source: command.source,
        previous,
        current: {
          location: this.scene.location,
          area: this.scene.area,
          position: this.scene.position,
        },
        description: this.buildChangeDescription(command, previous),
      }
      this.history.push(entry)
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(-this.maxHistorySize)
      }

      this.notify()
    }

    return changed
  }

  /** 更新角色位置 */
  updateCharacterPosition(characterId: string, position: string, action?: string, facing?: string): void {
    let char = this.scene.characters.find((c) => c.characterId === characterId)
    let changed = false
    if (!char) {
      char = {
        characterId,
        position: position || '',
        action: action || '',
        facing: facing || '',
      }
      this.scene.characters.push(char)
      changed = true
    } else {
      if (position && char.position !== position) { char.position = position; changed = true }
      if (action !== undefined && char.action !== action) { char.action = action; changed = true }
      if (facing !== undefined && char.facing !== facing) { char.facing = facing; changed = true }
    }
    if (changed) {
      this.scene.version++
      this.scene.updatedAt = Date.now()
      this.notify()
    }
  }

  /** 移除角色 */
  removeCharacter(characterId: string): void {
    const before = this.scene.characters.length
    this.scene.characters = this.scene.characters.filter((c) => c.characterId !== characterId)
    if (this.scene.characters.length !== before) {
      this.scene.version++
      this.scene.updatedAt = Date.now()
      this.notify()
    }
  }

  /** 获取角色当前位置 */
  getCharacterPosition(characterId: string): CharacterPosition | undefined {
    return this.scene.characters.find((c) => c.characterId === characterId)
  }

  /** 重置场景为默认 */
  reset(): void {
    this.scene = { ...DEFAULT_SCENE, updatedAt: Date.now() }
    this.history = []
    this.notify()
  }

  /** 从快照恢复场景 */
  restore(snapshot: SceneState): void {
    this.scene = { ...snapshot, updatedAt: Date.now() }
    this.notify()
  }

  /**
   * 生成场景快照提示词（极简版，几 Token 即可）
   */
  buildSnapshotPrompt(): string {
    const parts: string[] = []
    const s = this.scene

    parts.push('Scene Snapshot:')

    const locationParts: string[] = []
    if (s.location) locationParts.push(`地点-${s.location}`)
    if (s.area) locationParts.push(`区域-${s.area}`)
    if (s.position) locationParts.push(`位置-${s.position}`)
    parts.push(locationParts.join(' | '))

    if (s.weather) parts.push(`天气-${s.weather}`)
    if (s.timePeriod) parts.push(`时段-${s.timePeriod}`)

    // 角色位置
    if (s.characters.length > 0) {
      const charDescs = s.characters.map((c) => {
        const actionText = c.action ? `（${c.action}）` : ''
        return `${c.characterId}在${c.position}${actionText}`
      })
      parts.push(`角色：${charDescs.join('；')}`)
    }

    // 可交互物体
    if (s.interactableObjects.length > 0) {
      const objNames = s.interactableObjects.map((o) => o.name).join('、')
      parts.push(`物品：${objNames}`)
    }

    if (s.locked) {
      parts.push('场景已锁定。')
    } else {
      parts.push('场景未变化，不得主动修改地点。移动须由用户指令或系统事件触发。')
    }

    return parts.join(' | ')
  }

  /** 构建变化描述 */
  private buildChangeDescription(command: SceneUpdateCommand, previous: { location: string; area: string; position: string }): string {
    const source = command.source === 'user' ? '用户发起' : command.source === 'story_event' ? '剧情事件' : '系统触发'

    switch (command.type) {
      case 'location':
        return `${source}：${previous.location} → ${command.value}`
      case 'area':
        return `${source}：${previous.area || '（无）'} → ${command.value}`
      case 'position':
        return `${source}：${previous.position || '（无）'} → ${command.value}`
      case 'weather':
        return `${source}：天气变为 ${command.value}`
      case 'timePeriod':
        return `${source}：时段变为 ${command.value}`
      case 'action':
        return `${source}：${command.characterId} 动作为 ${command.value}`
      default:
        return `${source}：${command.type} = ${command.value}`
    }
  }
}

/** 全局 SceneManager 实例存储（按角色 ID 隔离） */
const sceneManagers: Map<string, SceneManager> = new Map()

export function getSceneManager(characterId: string): SceneManager {
  if (!sceneManagers.has(characterId)) {
    sceneManagers.set(characterId, new SceneManager())
  }
  return sceneManagers.get(characterId)!
}

export function initSceneManager(characterId: string, initialScene?: Partial<SceneState>): SceneManager {
  const manager = new SceneManager(initialScene)
  sceneManagers.set(characterId, manager)
  return manager
}

export function disposeSceneManager(characterId: string): void {
  sceneManagers.delete(characterId)
}