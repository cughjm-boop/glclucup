/**
 * EventAnalyzer — 事件分析器 (Multi Character Engine V4)
 *
 * 先识别消息类型，不直接发给模型。
 * 支持事件类型：
 *  - CharacterEnter / CharacterLeave
 *  - Mention / Move / Battle / DressChange
 *  - Emotion / Item / GeneralChat
 */

export type EventType =
  | 'CharacterEnter'
  | 'CharacterLeave'
  | 'Mention'
  | 'Move'
  | 'Battle'
  | 'DressChange'
  | 'Emotion'
  | 'Item'
  | 'GeneralChat'

export interface AnalyzedEvent {
  type: EventType
  /** 事件目标角色名（如有） */
  targetName?: string
  /** 被 @ 的角色名 */
  mentionName?: string
  /** 移动目标 */
  moveTarget?: string
  /** 情绪 */
  emotion?: string
  /** 物品 */
  item?: string
  /** 事件是否需要系统展示 */
  needsSystemMessage: boolean
  /** 原始消息 */
  rawMessage: string
  /** 提取到的参数 */
  params: Record<string, string>
}

/** 识别规则：每种事件的正则 + 优先级 */
interface EventRule {
  type: EventType
  patterns: RegExp[]
  extract?: (match: RegExpExecArray) => Partial<AnalyzedEvent>
}

const KNOWN_CHAR_NAMES = [
  '流萤', '银狼', '卡芙卡', '知更鸟', '刃', '花火', '三月七', '丹恒',
  '丹恒·饮月', '希儿', '布洛妮娅', '希露瓦', '黑塔', '符玄', '镜流',
  '罗刹', '白露', '娜塔莎', '杰帕德', '景元', '阿兰', '黑天鹅',
  '黄泉', '寒鸦', '虎克', '艾丝妲', '桂乃芬', '桑博', '螺丝咕姆',
  '玲可', '卢卡', '黛西', '翠雀', '米沙', '砂金', '翡翠', '托帕',
  '波提欧', '貘泽', '素裳', '飞霄', '驭空', '萨姆', '霍霍',
  '佩拉', '停云', '克拉拉', '加拉赫', '冥火大公', '尾巴',
  '三月七', '瓦尔特·杨', '开拓者', '星', '穹',
]

const EVENT_RULES: EventRule[] = [
  {
    type: 'CharacterEnter',
    patterns: [
      /(.{1,6})(?:走了过来|也加入了聊天|推门进来|出现了|走来了|过来了|加入了聊天|来了)/,
      /召唤(.{1,6})/,
      /叫(.{1,6})(?:过来|一下|来)/,
      /(.{1,6})(?:来|过来|来了)(?:聊天|一起|陪)/,
    ],
    extract: (m) => ({ targetName: m[1]?.trim() || m[2]?.trim() || m[3]?.trim() || '' }),
  },
  {
    type: 'CharacterLeave',
    patterns: [
      /(.{1,6})(?:离开了|走了|退出了|回去了|消失了|退场|先走了|不在了)/,
      /遣散(.{1,6})/,
      /(.{1,6})(?:离开|走|退下|回去)(?:吧|了|一下)/,
    ],
    extract: (m) => ({ targetName: m[1]?.trim() || '' }),
  },
  {
    type: 'Mention',
    patterns: [
      /@\s*([^\s@，。,！？!?\s]+)/,
      /^(.{1,6})[，,]?\s*(?:你|您)(?:怎么|什么|为什么|觉得|说|看)/,
    ],
    extract: (m) => ({ mentionName: m[1]?.trim() || '' }),
  },
  {
    type: 'Battle',
    patterns: [
      /(?:打|战斗|攻击|打|对|对战|挑战|消灭|击败)(.{1,6})/,
      /来(?:一场|局)?(?:战斗|战斗|对决|决斗)/,
      /(?:武器|能力|大招|必杀|技能|攻击)/,
    ],
  },
  {
    type: 'Move',
    patterns: [
      /(?:我们|我|你)(?:走|去|到|回|前往|移步)(.{1,8})/,
      /(?:场景(?:切换|转移|变更|改为))/,
      /(.{1,8})(?:见|吧|一下)/,
    ],
    extract: (m) => ({ moveTarget: m[1]?.trim() || '' }),
  },
  {
    type: 'DressChange',
    patterns: [
      /(?:穿|换|戴|搭|穿上|换上|换装)(.{1,10})/,
      /(?:衣服|服装|裙子|外套|发型|头发|打扮|造型)/,
    ],
  },
  {
    type: 'Emotion',
    patterns: [
      /(?:我|你|大家)(?:开心|难过|生气|害怕|紧张|害羞|惊讶|生气|感动|失望|伤心)/,
      /(?:好|真|太|很|特别)(?:开心|难过|生气|紧张|感动|失望|伤心)/,
    ],
    extract: (m) => ({ emotion: m[1]?.trim() || '' }),
  },
  {
    type: 'Item',
    patterns: [
      /(?:拿|给|递|要|取)(.{1,6})(?:东西|杯|个|件|下)?/,
      /(?:喝|吃|用|看)(.{1,6})/,
    ],
    extract: (m) => ({ item: m[1]?.trim() || '' }),
  },
]

/** 主分析入口 */
export function analyzeEvent(message: string): AnalyzedEvent {
  if (!message || !message.trim()) {
    return { type: 'GeneralChat', needsSystemMessage: false, rawMessage: message || '', params: {} }
  }

  // 括号指令优先
  const bracketMatch = message.match(/（([^）]+)）/)
  const cleanMessage = bracketMatch ? message.replace(/（[^）]+）/g, '').trim() : message

  // 按优先级匹配
  for (const rule of EVENT_RULES) {
    for (const pattern of rule.patterns) {
      const m = cleanMessage.match(pattern)
      if (m) {
        const extras = rule.extract ? rule.extract(m) : {}
        const event: AnalyzedEvent = {
          type: rule.type,
          needsSystemMessage: rule.type === 'CharacterEnter' || rule.type === 'CharacterLeave',
          rawMessage: message,
          params: {},
          ...extras,
        }
        // 确认目标是已知角色
        if (event.targetName) {
          event.targetName = resolveCharacterName(event.targetName)
        }
        if (event.mentionName) {
          event.mentionName = resolveCharacterName(event.mentionName)
        }
        return event
      }
    }
  }

  // 兜底：检查 @ 语法
  const mentionMatch = cleanMessage.match(/@\s*([^\s@，。,！？!?\s]+)/)
  if (mentionMatch) {
    const name = resolveCharacterName(mentionMatch[1])
    return {
      type: 'Mention',
      mentionName: name,
      needsSystemMessage: false,
      rawMessage: message,
      params: { mentionTarget: name },
    }
  }

  return { type: 'GeneralChat', needsSystemMessage: false, rawMessage: message, params: {} }
}

/** 从模糊名字解析到官方角色名 */
export function resolveCharacterName(fuzzy: string): string {
  if (!fuzzy) return ''
  // 精确匹配
  if (KNOWN_CHAR_NAMES.includes(fuzzy)) return fuzzy
  // 模糊包含
  for (const name of KNOWN_CHAR_NAMES) {
    if (name.includes(fuzzy) || fuzzy.includes(name)) return name
  }
  return fuzzy
}

/** 判断事件是否必须系统展示 */
export function requiresSystemMessage(type: EventType): boolean {
  return type === 'CharacterEnter' || type === 'CharacterLeave'
}

/** 获取事件的系统展示文案 */
export function getSystemEventMessage(event: AnalyzedEvent): string {
  switch (event.type) {
    case 'CharacterEnter':
      return `📢 ${event.targetName} 加入了聊天`
    case 'CharacterLeave':
      return `🚪 ${event.targetName} 离开了`
    case 'DressChange':
      return `👗 ${event.targetName || '有人'} 换了新造型`
    case 'Move':
      return `📍 场景变更：${event.moveTarget || ''}`
    default:
      return ''
  }
}

export { KNOWN_CHAR_NAMES }
