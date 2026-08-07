/**
 * EventTypes — 事件类型定义（V5 事件驱动架构）
 *
 * 任何变化：先生成事件，再处理。
 * CharacterEnter / CharacterLeave / Move / Emotion / Outfit / Battle / Mention / Sleep / WakeUp
 */

export type EventType =
  | 'CharacterEnter'
  | 'CharacterLeave'
  | 'Move'
  | 'Emotion'
  | 'Outfit'
  | 'Battle'
  | 'Mention'
  | 'Sleep'
  | 'WakeUp'
  | 'TimeSkip'
  | 'SceneChange'
  | 'UserAction'
  | 'GeneralChat'

export interface GameEvent {
  id: string
  type: EventType
  targetName?: string
  value?: string
  summary: string
  createdAt: number
}

/** 严格本地事件（不走 AI 推理）匹配结果 */
export interface StrictLocalEventMatch {
  /** CharacterEnter = 召唤，CharacterLeave = 离场 */
  type: 'CharacterEnter' | 'CharacterLeave'
  /** 被召唤/离场的角色名（原文原始片段，未查档案） */
  rawTargetName: string
  /** 原始文本，方便诊断 */
  matchedPattern: string
}

/**
 * 多人聊天触发规则（严格本地识别 —— 命中后直接本地处理，绝不送入 AI 推理）。
 *
 * 对应需求：
 *  1) 「三月七来了」
 *  2) 「三月七加入聊天」
 *  3) 「叫三月七过来」
 *  4) 「再见了三月七」
 *  5) 「三月七离开吧」
 *  6) 「让三月七退场」
 */

// 常见"句首动作词"前缀：当 `(?:叫|喊|把|让) X 过来` 的 capture 里因为 `.{1,8}?` 太贪心而吃了前缀时，
// 我们在后处理里把这些前缀剥掉，保证只留下名字本身。
const LEADING_VERBS_STRIP = /^(?:叫|喊|把|让|请|麻烦|快|赶紧|帮我|帮我把|帮我叫|帮我喊|喂[\s，,]*)/

// 常见"句尾动词/副词"残留：由于 `.{1,N}?` 的非贪婪在特定位置会多吃 1 个字（如「把希儿叫过来」→ capture 为「希儿叫」），
// 这里把名字尾部残留的动作字去掉。
const TRAILING_VERB_RESIDUE_STRIP = /(叫|喊|让|把|请|过|来|走|离|去|撤|回)$/

// 常见"句尾修饰/后缀"：`三月七先回去吧` 里 capture 可能捕获 `三月七先`，
// 这里把尾部的「先」等方向词剥离掉。
const TRAILING_ADVERBS_STRIP = /(?:先|也|还|都|赶紧|马上|立刻|这就|就)$/

// 主语/人称代词 → 不应作为角色名的前缀，出现这些则把整句判定为"普通闲聊"。
const SUBJECT_PRONOUNS_BLACKLIST = new Set([
  '我', '你', '他', '她', '它', '我们', '咱们', '你们', '他们', '她们',
  '大家', '所有人', '有人', '没人', '谁', '这边', '那边',
  '他们俩', '我俩', '咱俩',
])

// 一句话里「前缀 + 名字 + 后缀」后，最终名字的最大/最小长度（一个合法星铁角色名一般 2-8 字）。
const MIN_NAME_LEN = 1
const MAX_NAME_LEN = 12

const STRICT_ENTER_PATTERNS: Array<{ re: RegExp; label: string; capture: number }> = [
  // 「三月七来了」 / 「三月七也来了」
  { re: /^\s*(.{1,10}?)\s*(也|还)?\s*来了\s*[吗啊哦呢吖~。.!！?？]*\s*$/, label: 'X来了', capture: 1 },
  // 「三月七加入聊天」 / 「三月七加入对话」
  { re: /^\s*(.{1,10}?)\s*加入\s*(聊天|对话|会话|群聊|我们)\s*[吗啊哦呢吖~。.!！?？]*\s*$/, label: 'X加入聊天', capture: 1 },
  // 「叫三月七过来」 / 「叫三月七来」 / 「把三月七叫过来」
  { re: /^\s*(?:叫|喊|把|让|请|麻烦)\s*(.{1,10}?)\s*(?:过?来|来一下|来这里|加进来|来)\s*[。.!！?？]*\s*$/, label: '叫X过来', capture: 1 },
]

const STRICT_LEAVE_PATTERNS: Array<{ re: RegExp; label: string; capture: number }> = [
  // 「再见了三月七」 / 「拜拜三月七」 / 「再见，三月七」
  { re: /^\s*(再[会见]|拜拜|88|byebye|bye)\s*(?:了|啦|啊)?\s*[,，、:：]?\s*(.{1,10}?)\s*[。.!！?？]*\s*$/, label: '再见了X', capture: 2 },
  // 「三月七离开吧」 / 「三月七走吧」 / 「三月七先回去吧」
  { re: /^\s*(.{1,10}?)\s*(?:离开|走|先回去|回去)\s*(?:吧|哦|啦|啊|呗)?\s*[。.!！?？]*\s*$/, label: 'X离开吧', capture: 1 },
  // 「让三月七退场」 / 「叫三月七退场」 / 「让三月七回去」
  { re: /^\s*(?:让|叫|喊|把|请|麻烦)\s*(.{1,10}?)\s*(?:退场|离开|先回去|回去|撤了|走人|先走)\s*(?:吧|哦|啦|啊|呗)?\s*[。.!！?？]*\s*$/, label: '让X退场', capture: 1 },
]

/**
 * 把 capture 组里的脏字符串后处理成尽可能干净的角色名，同时排除明显不是名字的情况。
 * 返回 null 表示"这一句其实不是合法召唤/离场"。
 */
function cleanseCandidateName(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null

  // 去前后标点/空白
  s = s.replace(/^[\s，。,.!！?？:："'"'、（）()【】\[\]《》]+|[\s，。,.!！?？:："'"'、（）()【】\[\]《》]+$/g, '')
  if (!s) return null
  // 前缀剥离：`把希儿叫过来` → capture 可能是 `把希儿叫`
  while (LEADING_VERBS_STRIP.test(s)) {
    const before = s
    s = s.replace(LEADING_VERBS_STRIP, '')
    if (s === before) break
  }
  // 后缀剥离：`叫三月七先走` → capture 可能是 `三月七先`；`把希儿叫过来` → capture 可能是 `希儿叫`
  while (TRAILING_ADVERBS_STRIP.test(s) || TRAILING_VERB_RESIDUE_STRIP.test(s)) {
    const before = s
    s = s.replace(TRAILING_ADVERBS_STRIP, '').replace(TRAILING_VERB_RESIDUE_STRIP, '')
    if (s === before) break
  }
  // 再去一次首尾标点/空白
  s = s.replace(/^[\s，。,.!！?？:："'"'、（）()【】\[\]《》]+|[\s，。,.!！?？:："'"'、（）()【】\[\]《》]+$/g, '').trim()
  if (!s) return null

  // 长度合理性
  if (s.length < MIN_NAME_LEN || s.length > MAX_NAME_LEN) return null

  // 整句是代词（「你终于来了」/「他们都来了」）→ 不是角色名
  if (SUBJECT_PRONOUNS_BLACKLIST.has(s)) return null

  // 含明显的代词前缀（如「你终于」「我们都」）→ 拒绝
  const pronounPrefixRe = /^(我|你|他|她|它|我们|咱们|你们|他们|她们|大家|所有人|有人|没人|这边|那边|这边的|那边的|大家都|我们都|你们都|他们都|她们都|我也|你也|他也|她也|我们也|你们也|他们也|她们也)/
  if (pronounPrefixRe.test(s)) return null

  // 剩余字符串含非名字字符（动词/助词/形容词/数字）→ 过滤一部分常见误判
  // 原则：允许「·」（用于「阮·梅」「托帕&帐帐」）、字母数字、常规汉字
  const badChunks = [
    '刚刚', '刚才', '之前', '现在', '今天', '昨天', '明天',
    '一起', '一块', '一路', '一同', '终于', '听说',
    '打算', '准备', '可能', '好像', '应该', '需要',
  ]
  for (const chunk of badChunks) if (s.includes(chunk)) return null

  return s
}

export function strictMatchLocalMultiEvent(
  message: string,
): StrictLocalEventMatch | null {
  if (!message) return null
  const clean = message.trim()
  if (!clean) return null

  for (const p of STRICT_ENTER_PATTERNS) {
    const m = clean.match(p.re)
    if (m) {
      const raw = (m[p.capture] || '').trim()
      const name = cleanseCandidateName(raw)
      if (!name) continue
      return { type: 'CharacterEnter', rawTargetName: name, matchedPattern: p.label }
    }
  }
  for (const p of STRICT_LEAVE_PATTERNS) {
    const m = clean.match(p.re)
    if (m) {
      const raw = (m[p.capture] || '').trim()
      const name = cleanseCandidateName(raw)
      if (!name) continue
      return { type: 'CharacterLeave', rawTargetName: name, matchedPattern: p.label }
    }
  }
  return null
}

/** 事件分析器：从用户消息中识别事件类型 */
export function analyzeUserEvent(message: string): GameEvent {
  if (!message) return makeEvent('GeneralChat', message, '')

  const clean = message.trim()

  // 0) 严格本地事件优先：6 种召唤 / 离场句式
  const strict = strictMatchLocalMultiEvent(clean)
  if (strict) {
    const type = strict.type
    const name = strict.rawTargetName
    return makeEvent(type, name, type === 'CharacterEnter' ? `${name} 加入了聊天（本地路由）` : `${name} 离开了（本地路由）`)
  }

  // 1) CharacterEnter
  const enterMatch = clean.match(/^(.{1,6})(?:来了|走了过来|也来了|加入了|过来了|来了啊)/) ||
                     clean.match(/召唤\s*(.{1,6})/) ||
                     clean.match(/叫\s*(.{1,6})\s*(?:过来|来)/)
  if (enterMatch) {
    const name = enterMatch[1].trim()
    return makeEvent('CharacterEnter', name, `${name}进入了场景`)
  }

  // 2) CharacterLeave
  const leaveMatch = clean.match(/(.{1,6})(?:离开了|走了|退出了|回去了|先走了|不在了|退场)/) ||
                    clean.match(/遣散\s*(.{1,6})/)
  if (leaveMatch) {
    const name = leaveMatch[1].trim()
    return makeEvent('CharacterLeave', name, `${name}离开了`)
  }

  // 3) Mention
  const mentionMatch = clean.match(/@\s*([^\s@，。,！？!?]+)/)
  if (mentionMatch) {
    return makeEvent('Mention', mentionMatch[1].trim(), `点名了 ${mentionMatch[1]}`)
  }

  // 4) Move
  if (/(?:走|去|到|回|前往|移步)(.{1,10})/.test(clean)) {
    const m = clean.match(/(?:走|去|到|回|前往|移步)(.{1,10})/)
    return makeEvent('Move', m?.[1]?.trim() || '', `移动到 ${m?.[1]?.trim() || '未知地点'}`)
  }

  // 5) Battle
  if (/(?:打|攻击|战斗|对战|挑战|武器|技能|大招|必杀)/.test(clean)) {
    return makeEvent('Battle', '', `战斗相关：${clean.slice(0, 50)}`)
  }

  // 6) Outfit
  if (/(?:穿|换|戴|服装|衣服|造型|打扮|发型|头发)/.test(clean)) {
    return makeEvent('Outfit', '', `换装相关：${clean.slice(0, 50)}`)
  }

  // 7) Sleep / WakeUp
  if (/(?:睡|困|累|休息|晚安)/.test(clean)) return makeEvent('Sleep', '', `想睡觉`)
  if (/(?:醒|起床|起来|早安)/.test(clean)) return makeEvent('WakeUp', '', `起床了`)

  // 8) Emotion
  if (/(?:开心|难过|生气|害怕|紧张|害羞|惊讶|感动|失望|伤心)/.test(clean)) {
    return makeEvent('Emotion', '', `情绪变化：${clean.slice(0, 30)}`)
  }

  // 9) TimeSkip
  if (/(?:过了|后来|之后|第二天|过了一会|几分钟后|几小时后)/.test(clean)) {
    return makeEvent('TimeSkip', '', `时间跳跃`)
  }

  // 10) SceneChange
  if (/(?:场景(?:切换|变化|改变)|换地方|换个地方)/.test(clean)) {
    return makeEvent('SceneChange', '', `场景变化`)
  }

  return makeEvent('GeneralChat', '', clean)
}

function makeEvent(type: EventType, targetName: string, summary: string): GameEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    targetName: targetName || undefined,
    summary,
    createdAt: Date.now(),
  }
}

/** 事件类型 → 系统展示文案 */
export function getSystemMessageForEvent(evt: GameEvent): string {
  switch (evt.type) {
    case 'CharacterEnter': return `📢 ${evt.targetName} 加入了聊天`
    case 'CharacterLeave': return `🚪 ${evt.targetName} 离开了`
    case 'Move': return `📍 ${evt.summary}`
    case 'Outfit': return `👗 ${evt.summary}`
    case 'Battle': return `⚔️ ${evt.summary}`
    case 'Sleep': return `😴 ${evt.summary}`
    case 'WakeUp': return `☀️ ${evt.summary}`
    case 'TimeSkip': return `⏰ 时间流逝`
    case 'SceneChange': return `🎬 场景切换`
    default: return ''
  }
}

/** 事件类型是否需要系统展示 */
export function isSystemEvent(type: EventType): boolean {
  return ['CharacterEnter', 'CharacterLeave', 'Move', 'Outfit', 'Battle', 'Sleep', 'WakeUp', 'TimeSkip', 'SceneChange'].includes(type)
}
