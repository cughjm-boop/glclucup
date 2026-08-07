/**
 * ConversationRuntime — 统一运行状态（V5 最终架构）
 *
 * 整个聊天只维护这一份状态。所有模块只读写这一个对象。
 *
 * {
 *   scene, time, weather, activeCharacters, characterRuntime, pendingEvents, messages
 * }
 */

export type CharacterState = 'active' | 'idle' | 'sleeping' | 'away'
export type EmotionLevel = 0 | 1 | 2 | 3

/**
 * CharacterRuntime V2 — 每个角色独立身份（不共享）
 *
 * 必须独立维护：
 *   id / name / avatar / emotion / action / position / costume /
 *   memory / relationship / speakingStyle / currentTarget / lastSpeakTime
 *
 * 所有人共享一份 ConversationRuntime（场景/消息/事件）。
 */
export interface CharacterRuntime {
  characterId: string
  characterName: string

  /** 角色头像（UI 回退，UI 设置里可覆盖） */
  avatar?: string

  /** 位置 —— 每个人独立（如：流萤:客厅 / 三月七:厨房 / 知更鸟:阳台） */
  position: string
  /** 姿态（五维 Pose） */
  pose: string
  /** 动作 */
  action: string
  /** 情绪 */
  emotion: string
  /** 情绪强度 0~3 */
  emotionLevel: EmotionLevel
  /** 表情（五维 Expression） */
  expression: string
  /** 关系：对用户的关系值/描述 */
  relationship: string
  /** 说话风格（如：软萌 / 俏皮 / 温柔 / 沉稳） */
  speakingStyle: string
  /** 当前说话目标：__user__ / 另一个 characterId */
  currentTarget: string

  /** 服装 ID（独立，春日手信/默认/演出服...） */
  costumeId: string
  /** 服装名字（兼容原 costume） */
  costume: string
  /** 发型 */
  hairstyle: string
  /** 武器 */
  weapon: string
  /** 持有物 */
  holding: string

  /** 身体状态 */
  state: CharacterState
  /** 存在感 0-100 */
  presence: number
  /** 主动性 0-100 */
  initiative: number
  /** 上次发言时间（防刷屏 & 调度用） */
  lastSpokeAt: number
  /** 冷却（连发言惩罚） */
  cooldown: number
  /** 本次会话发言次数 */
  speakCount: number
  /** 入场时间 */
  enteredAt: number

  /** 记忆桶 ID：同一个角色的记忆只读这里（不允许读别人的） */
  memoryOwnerId: string
  /** 参与记忆的人：User + 在场角色们 */
  memoryParticipants: string[]
}

export interface SceneState {
  location: string
  area: string
  description: string
  time: string
  weather: string
}

export interface RuntimeMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  /** 发送者：用户=__user__ ，否则 characterId */
  speakerId?: string
  /** 显示用的名字（兼容老字段，不做主键） */
  speakerName?: string
  /** 消息的直接目标：__user__ / characterId / __all__ */
  targetId?: string
  content: string
  timestamp: number
  systemType?: 'enter' | 'leave' | 'move' | 'event'
}

export interface PendingEvent {
  id: string
  type: string
  targetName?: string
  summary: string
  createdAt: number
}

export interface ReplyPlan {
  mustReply: string[]
  optionalReply: string[]
  silent: string[]
  /** 串行回复顺序：避免全部一起答（A→B→C→用户） */
  order: string[]
}

export interface ConversationRuntime {
  scene: SceneState
  activeCharacters: string[]
  characterRuntime: Record<string, CharacterRuntime>
  pendingEvents: PendingEvent[]
  messages: RuntimeMessage[]
  /** 上次回复计划 */
  lastReplyPlan: ReplyPlan | null
  /** 最后一条用户消息时间戳（给「自动旁听 3 分钟」调度用） */
  lastUserMessageAt: number
  /** 最后一次 AI 回复时间戳（给「自动旁听 3 分钟」调度用） */
  lastAiReplyAt: number
  /** 版本号（供 UI 精确更新） */
  version: number
}

/** 创建初始 Runtime */
export function createRuntime(initial?: Partial<ConversationRuntime>): ConversationRuntime {
  return {
    scene: {
      location: '默认场景',
      area: '主区域',
      description: '',
      time: '',
      weather: '晴朗',
      ...(initial?.scene || {}),
    },
    activeCharacters: initial?.activeCharacters || [],
    characterRuntime: initial?.characterRuntime || {},
    pendingEvents: [],
    messages: [],
    lastReplyPlan: null,
    lastUserMessageAt: 0,
    lastAiReplyAt: 0,
    version: 0,
  }
}

/** 添加角色 */
export function addCharacter(
  runtime: ConversationRuntime,
  data: { characterId: string; characterName: string } & Partial<CharacterRuntime>,
): ConversationRuntime {
  const cr: CharacterRuntime = {
    characterId: data.characterId,
    characterName: data.characterName,
    avatar: data.avatar || '',
    position: data.position || runtime.scene.location,
    pose: data.pose || '站立',
    action: data.action || '站着',
    emotion: data.emotion || 'calm',
    emotionLevel: (data.emotionLevel ?? 1) as EmotionLevel,
    expression: data.expression || '微笑',
    relationship: data.relationship || '朋友',
    speakingStyle: data.speakingStyle || '自然',
    currentTarget: data.currentTarget || '__user__',
    costumeId: data.costumeId || 'default',
    costume: data.costume || '默认服装',
    hairstyle: data.hairstyle || '官方设定',
    weapon: data.weapon || '官方武器',
    holding: data.holding || '',
    state: 'active',
    presence: data.presence ?? 70,
    initiative: data.initiative ?? 50,
    lastSpokeAt: 0,
    cooldown: 0,
    speakCount: 0,
    enteredAt: Date.now(),
    memoryOwnerId: data.memoryOwnerId || data.characterId,
    memoryParticipants: Array.isArray(data.memoryParticipants)
      ? data.memoryParticipants
      : ['User', data.characterId],
  }
  runtime.characterRuntime[data.characterId] = cr
  if (!runtime.activeCharacters.includes(data.characterId)) {
    runtime.activeCharacters.push(data.characterId)
  }
  runtime.version++
  return runtime
}

/** 移除角色 */
export function removeCharacter(runtime: ConversationRuntime, characterId: string): ConversationRuntime {
  runtime.activeCharacters = runtime.activeCharacters.filter((id) => id !== characterId)
  delete runtime.characterRuntime[characterId]
  runtime.version++
  return runtime
}

/** 更新角色运行时字段 */
export function updateCharacter(
  runtime: ConversationRuntime,
  characterId: string,
  patch: Partial<CharacterRuntime>,
): ConversationRuntime {
  const cr = runtime.characterRuntime[characterId]
  if (!cr) return runtime
  Object.assign(cr, patch)
  runtime.version++
  return runtime
}

/** 更新场景 */
export function updateScene(
  runtime: ConversationRuntime,
  patch: Partial<SceneState>,
): ConversationRuntime {
  Object.assign(runtime.scene, patch)
  runtime.version++
  return runtime
}

/** 入队事件 */
export function enqueueEvent(runtime: ConversationRuntime, evt: Omit<PendingEvent, 'id' | 'createdAt'>): ConversationRuntime {
  runtime.pendingEvents.push({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    ...evt,
  })
  runtime.version++
  return runtime
}

/** 清空事件队列 */
export function clearEvents(runtime: ConversationRuntime): ConversationRuntime {
  runtime.pendingEvents = []
  runtime.version++
  return runtime
}

/** 追加消息 */
export function appendMessage(runtime: ConversationRuntime, msg: Omit<RuntimeMessage, 'id' | 'timestamp'>): ConversationRuntime {
  const full: RuntimeMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...msg,
  }
  runtime.messages.push(full)
  // 限制历史长度
  if (runtime.messages.length > 100) {
    runtime.messages = runtime.messages.slice(-80)
  }
  runtime.version++
  return runtime
}

/** 更新回复计划 */
export function setReplyPlan(runtime: ConversationRuntime, plan: ReplyPlan): ConversationRuntime {
  runtime.lastReplyPlan = plan
  runtime.version++
  return runtime
}

/** 获取角色运行时 */
export function getCharRuntime(runtime: ConversationRuntime, characterId: string): CharacterRuntime | null {
  return runtime.characterRuntime[characterId] || null
}

/** 推进冷却 */
export function tickCooldowns(runtime: ConversationRuntime): ConversationRuntime {
  for (const cr of Object.values(runtime.characterRuntime)) {
    if (cr.cooldown > 0) cr.cooldown--
  }
  return runtime
}

/** 标记用户消息时间（给自动旁听用） */
export function touchUserMessageTime(runtime: ConversationRuntime, ts = Date.now()): ConversationRuntime {
  runtime.lastUserMessageAt = ts
  runtime.version++
  return runtime
}

/** 标记 AI 回复时间（给自动旁听用） */
export function touchAiReplyTime(runtime: ConversationRuntime, ts = Date.now()): ConversationRuntime {
  runtime.lastAiReplyAt = ts
  runtime.version++
  return runtime
}
