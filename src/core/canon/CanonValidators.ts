/**
 * CanonValidators — 按维度的校验器集合（Official Canon Engine）
 *
 * 每个 Validator 独立实现：
 *   Weapon / Ability / Appearance / Hair / Personality / Speaking / Knowledge / Relationship / Scene / World
 *
 * 统一返回：{ passed, score(0~100), violations[] }
 * 所有校验在本地完成，不消耗 API Token。
 */

import type { CanonCharacterRecord } from './CanonDatabase'

export interface ValidationViolation {
  level: 'error' | 'warning'
  type: string
  message: string
  /** 原文片段（便于调试） */
  snippet?: string
}

export interface ValidationResult {
  passed: boolean
  /** 本维度得分（0~100） */
  score: number
  violations: ValidationViolation[]
}

/** 通用校验上下文 */
export interface ValidatorContext {
  reply: string
  record: CanonCharacterRecord
  /** 当前场景信息 */
  sceneInfo?: { location?: string; area?: string; position?: string }
  /** 在场其他角色名 */
  otherPresentNames?: string[]
  /** 用户最新消息 */
  userMessage?: string
  /** V5 多人聊天：Runtime 状态 */
  runtime?: {
    activeCharacters: string[]
    characterRuntime: Record<string, {
      characterName: string
      state: string
      position: string
      action: string
      costume: string
      weapon: string
    }>
  }
  /** V5 多人聊天：回复计划 */
  replyPlan?: {
    mustReply: string[]
    optionalReply: string[]
    silent: string[]
  }
  /** V5：角色 ID → CanonCharacterRecord 映射 */
  characterMap?: Record<string, CanonCharacterRecord>
}

// ===== 通用工具 =====

function makeResult(score: number, violations: ValidationViolation[]): ValidationResult {
  return {
    passed: violations.filter((v) => v.level === 'error').length === 0,
    score: Math.max(0, Math.min(100, score)),
    violations,
  }
}

function findSnippet(reply: string, word: string, contextLen = 15): string {
  const idx = reply.indexOf(word)
  if (idx < 0) return word
  const start = Math.max(0, idx - contextLen)
  const end = Math.min(reply.length, idx + word.length + contextLen)
  return reply.slice(start, end)
}

// ===== Weapon Validator =====

/** 禁止武器关键词（相对于每个角色） */
const WEAPON_PROHIBITIONS: Record<string, string[]> = {
  刃: ['枪', '狙击', '手枪', '步枪', '弓', '法杖', '魔法', '火球', '雷电', '火焰'],
  丹恒: ['枪以外的武器', '拳击'],
  银狼: ['剑', '刀', '巨剑', '长枪'],
  卡芙卡: ['剑', '刀', '巨剑', '法杖', '长弓'],
  流萤: ['刀', '剑', '弓'],
  希儿: ['枪', '刀', '剑'],
  布洛妮娅: ['刀', '剑', '法杖'],
  三月七: ['刀', '剑', '法杖'],
  花火: ['刀', '剑', '长枪'],
  知更鸟: ['刀', '剑', '枪'],
}

export function validateWeapon(ctx: ValidatorContext): ValidationResult {
  const { reply, record } = ctx
  const prohibitions = WEAPON_PROHIBITIONS[record.name] || []
  const violations: ValidationViolation[] = []

  for (const word of prohibitions) {
    if (reply.includes(word)) {
      violations.push({
        level: 'error',
        type: 'weapon_prohibition',
        message: `${record.name} 不应使用 "${word}"（官方武器：${record.weaponType}）`,
        snippet: findSnippet(reply, word),
      })
    }
  }

  // 加分：正确使用官方武器 → 奖励
  let score = 100
  score -= violations.length * 30
  return makeResult(score, violations)
}

// ===== Ability Validator =====

/** 禁止能力关键词 */
const ABILITY_PROHIBITIONS: Record<string, string[]> = {
  银狼: ['火焰', '火球', '冰锥', '冰霜', '雷电召唤'],
  刃: ['魔法', '法术', '火球', '治疗', '回复', '护盾召唤'],
  卡芙卡: ['冰锥', '冰霜', '召唤兽', '火球'],
  流萤: ['召唤', '分身', '冰系'],
  知更鸟: ['武器', '刀', '剑', '直接攻击'],
  花火: ['治疗', '回复', '盾牌', '冰锥'],
  希儿: ['治疗', '召唤', '护盾'],
}

export function validateAbility(ctx: ValidatorContext): ValidationResult {
  const { reply, record } = ctx
  const prohibitions = ABILITY_PROHIBITIONS[record.name] || []
  const violations: ValidationViolation[] = []

  for (const word of prohibitions) {
    if (reply.includes(word)) {
      violations.push({
        level: 'error',
        type: 'ability_prohibition',
        message: `${record.name} 不应使用 "${word}"（官方能力：${record.abilities.slice(0, 3).join('、')}）`,
        snippet: findSnippet(reply, word),
      })
    }
  }

  // 检查回复是否声称使用了不存在的能力
  if (record.abilities.length) {
    const officialText = record.abilities.join('')
    if (!officialText) {
      // 无官方能力声明 → 宽松
    }
  }

  let score = 100
  score -= violations.length * 30
  return makeResult(score, violations)
}

// ===== Appearance Validator =====

/** 官方外观关键词（按角色） */
const APPEARANCE_BAN: Record<string, string[]> = {
  流萤: ['白色西装', '黑色短发女式', '长发及腰'],
  银狼: ['紫色长裙', '红色长裙', '白色连衣裙'],
  卡芙卡: ['短裙', '黑色T恤', '牛仔'],
  刃: ['西装', '燕尾服', '长发散发女式'],
  知更鸟: ['黑衣', '铠甲', '武士服'],
  花火: ['黑色长风衣', '军装'],
}

export function validateAppearance(ctx: ValidatorContext): ValidationResult {
  const { reply, record } = ctx
  const bans = APPEARANCE_BAN[record.name] || []
  const violations: ValidationViolation[] = []

  for (const phrase of bans) {
    if (reply.includes(phrase)) {
      violations.push({
        level: 'error',
        type: 'appearance_prohibition',
        message: `${record.name} 不应穿着 "${phrase}"（官方默认服装：${record.defaultCostume}）`,
        snippet: findSnippet(reply, phrase),
      })
    }
  }

  let score = 100
  score -= violations.length * 30
  return makeResult(score, violations)
}

// ===== Hair Validator =====

const HAIR_BAN: Record<string, string[]> = {
  流萤: ['剪成短发', '留长发', '染成红色', '染成金色'],
  银狼: ['剪了短发', '染了黑发', '扎了马尾'],
  卡芙卡: ['黑发', '金发', '短发'],
  刃: ['剪短', '染烫', '散发女'],
  知更鸟: ['黑发', '直发'],
}

export function validateHair(ctx: ValidatorContext): ValidationResult {
  const { reply, record } = ctx
  const bans = HAIR_BAN[record.name] || []
  const violations: ValidationViolation[] = []

  for (const phrase of bans) {
    if (reply.includes(phrase)) {
      violations.push({
        level: 'error',
        type: 'hair_prohibition',
        message: `${record.name} 发型变更："${phrase}"（官方：${record.officialHair}）`,
        snippet: findSnippet(reply, phrase),
      })
    }
  }

  let score = 100
  score -= violations.length * 30
  return makeResult(score, violations)
}

// ===== Personality Validator =====

/** 违反人格表达 */
const PERSONALITY_VIOLATIONS: Record<string, Array<{ word: string; reason: string }>> = {
  刃: [
    { word: '哈哈哈哈', reason: '刃的官方设定为严肃寡言' },
    { word: '好开心', reason: '刃不轻易表露情绪' },
    { word: '嘻嘻', reason: '刃不使用撒娇语气' },
    { word: '撒娇', reason: '刃不会撒娇' },
    { word: '抱抱', reason: '刃不会主动求抱' },
  ],
  卡芙卡: [
    { word: '害羞', reason: '卡芙卡不会害羞' },
    { word: '怯懦', reason: '卡芙卡不会怯懦' },
    { word: '我好怕', reason: '卡芙卡不会害怕' },
  ],
  流萤: [
    { word: '哈哈大笑', reason: '流萤官方设定较为安静内敛' },
    { word: '太好玩了', reason: '流萤不会太外放' },
    { word: '撒娇', reason: '流萤不常撒娇' },
  ],
  知更鸟: [
    { word: '沉默', reason: '知更鸟应阳光开朗' },
    { word: '冷漠', reason: '知更鸟热情' },
  ],
  银狼: [
    { word: '热情', reason: '银狼较为冷酷理性' },
    { word: '撒娇', reason: '银狼不会撒娇' },
  ],
  花火: [
    { word: '严肃', reason: '花火活泼跳脱' },
    { word: '冷漠', reason: '花火热情外向' },
  ],
}

export function validatePersonality(ctx: ValidatorContext): ValidationResult {
  const { reply, record } = ctx
  const violations: ValidationViolation[] = []
  const rules = PERSONALITY_VIOLATIONS[record.name] || []

  for (const rule of rules) {
    if (reply.includes(rule.word)) {
      violations.push({
        level: 'warning',
        type: 'personality_violation',
        message: `${record.name} 出现 "${rule.word}"：${rule.reason}`,
        snippet: findSnippet(reply, rule.word),
      })
    }
  }

  let score = 100
  score -= violations.length * 20
  return makeResult(score, violations)
}

// ===== Speaking Validator =====

/** 说话风格违规词 */
const SPEAKING_BAN: Record<string, string[]> = {
  卡芙卡: ['卧槽', '牛逼', '草', '卧槽你', '离谱', '666', '绝了'],
  流萤: ['卧槽', '牛逼', '草', 'yyds'],
  银狼: ['哈哈哈哈哈', '嘻嘻', '嘿嘿嘿', '啦啦啦'],
  刃: ['卧槽', '哈哈哈', '嘻嘻', '哦耶', '耶'],
  知更鸟: ['卧槽', '草泥马', '可恶'],
  花火: ['无聊', '真烦', '切'],
}

export function validateSpeaking(ctx: ValidatorContext): ValidationResult {
  const { reply, record } = ctx
  const bans = SPEAKING_BAN[record.name] || []
  const violations: ValidationViolation[] = []

  for (const word of bans) {
    if (reply.includes(word)) {
      violations.push({
        level: 'warning',
        type: 'speaking_prohibition',
        message: `${record.name} 不应使用 "${word}"（违反官方说话风格）`,
        snippet: findSnippet(reply, word),
      })
    }
  }

  let score = 100
  score -= violations.length * 25
  return makeResult(score, violations)
}

// ===== Knowledge Validator =====

/** 禁止角色知道的信息前缀（第三人称描述） */
const THIRD_PERSON_PATTERNS = [
  /根据官方设定/,
  /根据游戏设定/,
  /根据原著/,
  /她的服装/,
  /他的武器/,
  /这个角色/,
  /那位角色/,
  /在官方设定里/,
  /我查了一下/,
  /根据剧情/,
]

export function validateKnowledge(ctx: ValidatorContext): ValidationResult {
  const { reply, record, otherPresentNames = [] } = ctx
  const violations: ValidationViolation[] = []

  // 1) 禁止百科模式
  for (const re of THIRD_PERSON_PATTERNS) {
    if (re.test(reply)) {
      violations.push({
        level: 'error',
        type: 'knowledge_third_person',
        message: `回复使用了第三人称百科描述（"${re}" 一类）。请以第一人称回答。`,
      })
    }
  }

  // 2) 提及不在场角色的细节（默认越权）
  if (otherPresentNames.length === 0) {
    const knownOthers = ['银狼', '卡芙卡', '流萤', '刃', '知更鸟', '花火', '三月七', '丹恒', '希儿', '布洛妮娅']
    for (const name of knownOthers) {
      if (name === record.name) continue
      if (reply.includes(name)) {
        violations.push({
          level: 'warning',
          type: 'knowledge_nonpresent',
          message: `角色「${record.name}」提及了不在场的「${name}」的信息`,
          snippet: findSnippet(reply, name),
        })
      }
    }
  }

  let score = 100
  score -= violations.filter((v) => v.level === 'error').length * 30
  score -= violations.filter((v) => v.level === 'warning').length * 15
  return makeResult(score, violations)
}

// ===== Relationship Validator =====

export function validateRelationship(ctx: ValidatorContext): ValidationResult {
  const { reply, record } = ctx
  const violations: ValidationViolation[] = []
  const rels = record.relationships || {}

  // 检查是否自称认识某人但官方关系为陌生人
  const relEntries = Object.entries(rels)
  if (relEntries.length === 0) {
    // 无关系数据 → 禁止自称"认识很久""十年好友"
    if (/(认识.{2,10}年|十年.{0,4}好友|多年.{0,4}朋友)/.test(reply)) {
      violations.push({
        level: 'warning',
        type: 'relationship_overclaim',
        message: `${record.name} 不应自称有多年好友关系（官方关系记录为空）`,
      })
    }
  }

  let score = 100
  score -= violations.length * 25
  return makeResult(score, violations)
}

// ===== Scene Validator =====

const SCENE_CONTRADICTIONS: Array<{ keywords: RegExp; scene: RegExp; message: string }> = [
  { keywords: /沙滩|海浪|海边|晒太阳/, scene: /家|客厅|卧室|房间/, message: '当前场景与描述动作矛盾' },
  { keywords: /在家里|在家中|在客厅/, scene: /沙滩|海边|公园|森林/, message: '当前场景与描述地点矛盾' },
  { keywords: /在学校|在教室/, scene: /家|卧室|海边/, message: '当前场景与描述地点矛盾' },
]

export function validateScene(ctx: ValidatorContext): ValidationResult {
  const { reply, sceneInfo } = ctx
  if (!sceneInfo || !sceneInfo.location) return makeResult(100, [])
  const violations: ValidationViolation[] = []
  const loc = sceneInfo.location

  for (const c of SCENE_CONTRADICTIONS) {
    if (c.keywords.test(reply) && c.scene.test(loc)) {
      violations.push({
        level: 'warning',
        type: 'scene_contradiction',
        message: `${c.message}（当前场景：${loc}）`,
      })
    }
  }

  let score = 100
  score -= violations.length * 25
  return makeResult(score, violations)
}

// ===== Encyclopedia Mode Validator (Item 105: 独立百科模式校验器) =====

/** 更完整的禁止百科模式正则 — 比 validateKnowledge 更严格的独立校验器 */
const ENCYCLOPEDIA_FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /根据官方设定/, reason: '禁止使用"根据官方设定"开头，需直接第一人称陈述' },
  { pattern: /官方资料显示/, reason: '禁止引用"官方资料显示"，这是百科口吻' },
  { pattern: /官方设定称/, reason: '禁止使用"官方设定称"，不能第三人称引述设定' },
  { pattern: /根据游戏设定/, reason: '禁止引用"游戏设定"，你是活在设定中的角色' },
  { pattern: /根据原著/, reason: '禁止引用"原著"，你是真实的角色不是在读设定' },
  { pattern: /在官方设定里/, reason: '禁止出现"在官方设定里"的元叙述' },
  { pattern: /在游戏设定里/, reason: '禁止出现"在游戏设定里"的元叙述' },
  { pattern: /资料显示/, reason: '禁止使用"资料显示"类引文口吻' },
  { pattern: /我查了一下/, reason: '禁止"我查了一下"，设定是你的记忆不是资料库' },
  { pattern: /根据剧情/, reason: '禁止使用"根据剧情"类引文' },
  { pattern: /这个角色[^，。,.]{0,6}(?:的|是|叫|名字)/, reason: '禁止第三人称谈论"这个角色"' },
  { pattern: /那位角色[^，。,.]{0,6}(?:的|是|叫|名字)/, reason: '禁止第三人称谈论"那位角色"' },
  { pattern: /(?:她|他)的(?:服装|武器|性格|外观|能力|名字)[^，。,.]{0,8}是/, reason: '禁止第三人称"她的/他的XX是"方式描述自己' },
]

export function validateEncyclopediaMode(ctx: ValidatorContext): ValidationResult {
  const { reply } = ctx
  const violations: ValidationViolation[] = []

  for (const { pattern, reason } of ENCYCLOPEDIA_FORBIDDEN_PATTERNS) {
    if (pattern.test(reply)) {
      // 提取命中的原文片段用于调试
      const matched = reply.match(pattern)
      const snippet = matched ? (matched[0].length > 40 ? matched[0].slice(0, 40) + '…' : matched[0]) : pattern.toString()
      violations.push({
        level: 'error',
        type: 'encyclopedia_mode',
        message: `禁止百科模式：${reason}`,
        snippet,
      })
    }
  }

  // 命中任意 error → 直接拉到 60 分触发重新生成
  let score = 100
  score -= violations.filter((v) => v.level === 'error').length * 30
  score -= violations.filter((v) => v.level === 'warning').length * 15
  return makeResult(score, violations)
}

// ===== World Validator =====

const FORBIDDEN_ENTRIES = ['木叶村', '忍者', '查克拉', '海贼团', '草帽一伙', '死神', '虚圈', '尸魂界', '鬼杀队', '呼吸法']

export function validateWorld(_ctx: ValidatorContext, reply?: string): ValidationResult {
  const text = reply || ''
  const violations: ValidationViolation[] = []
  for (const word of FORBIDDEN_ENTRIES) {
    if (text.includes(word)) {
      violations.push({
        level: 'error',
        type: 'world_violation',
        message: `回复引入了非星穹铁道世界观元素："${word}"`,
        snippet: findSnippet(text, word),
      })
    }
  }
  let score = 100
  score -= violations.length * 50
  return makeResult(score, violations)
}

// ===== ReplyPlan Validator (V5 多人聊天) =====

/** 提取回复中的发言角色 */
function extractSpeakerNames(reply: string): string[] {
  const set = new Set<string>()
  const re = /([\u4e00-\u9fa5A-Za-z]{2,8})[：:]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(reply)) !== null) set.add(m[1])
  return Array.from(set)
}

/** V5：回复计划校验 — mustReply/silent 检查 */
export function validateReplyPlan(ctx: ValidatorContext): ValidationResult {
  const { reply, replyPlan, runtime } = ctx
  if (!replyPlan || !runtime) return makeResult(100, [])
  const violations: ValidationViolation[] = []

  // 1) 检查 mustReply 角色是否发言
  for (const id of replyPlan.mustReply) {
    const cr = runtime.characterRuntime[id]
    if (cr && !reply.includes(cr.characterName)) {
      violations.push({
        level: 'error',
        type: 'missing_speaker',
        message: `必须回复的角色「${cr.characterName}」未在回复中出现`,
      })
    }
  }

  // 2) 检查 silent 角色是否不该出现却出现了
  for (const id of replyPlan.silent) {
    const cr = runtime.characterRuntime[id]
    if (cr && reply.includes(`${cr.characterName}：`)) {
      violations.push({
        level: 'error',
        type: 'unauthorized_speaker',
        message: `应该保持沉默的「${cr.characterName}」在回复中发言了`,
      })
    }
  }

  let score = 100
  score -= violations.filter((v) => v.level === 'error').length * 30
  score -= violations.filter((v) => v.level === 'warning').length * 15
  return makeResult(score, violations)
}

// ===== RuntimeState Validator (V5 运行状态一致性) =====

/** V5：运行状态一致性校验 — 睡眠/离场角色不应发言 */
export function validateRuntimeState(ctx: ValidatorContext): ValidationResult {
  const { reply, runtime } = ctx
  if (!runtime) return makeResult(100, [])
  const violations: ValidationViolation[] = []

  for (const id of runtime.activeCharacters) {
    const cr = runtime.characterRuntime[id]
    if (!cr) continue
    if ((cr.state === 'sleeping' || cr.state === 'away') && reply.includes(`${cr.characterName}：`)) {
      violations.push({
        level: 'error',
        type: 'state_violation',
        message: `${cr.characterName} 处于「${cr.state}」状态，不应发言`,
      })
    }
  }

  // 检查角色使用的武器/服装是否与 Runtime 一致
  const speakerNames = extractSpeakerNames(reply)
  for (const name of speakerNames) {
    for (const cr of Object.values(runtime.characterRuntime)) {
      if (cr.characterName === name) {
        // 如果 Runtime 中标记未装备武器，不应出现武器描述
        if (cr.weapon === '未装备' || cr.weapon === '官方武器') {
          const weaponKeywords = ['拿着', '握着', '举起', '拔出', '挥舞', '武器', '长枪', '巨剑']
          for (const kw of weaponKeywords) {
            if (reply.includes(`${name}：`) && reply.includes(kw)) {
              // 仅 warning，可能是泛指
              violations.push({
                level: 'warning',
                type: 'runtime_weapon_mismatch',
                message: `${name} 在 Runtime 中武器为「${cr.weapon}」，回复中出现 "${kw}"`,
              })
              break
            }
          }
        }
        break
      }
    }
  }

  let score = 100
  score -= violations.filter((v) => v.level === 'error').length * 30
  score -= violations.filter((v) => v.level === 'warning').length * 15
  return makeResult(score, violations)
}

/** 一键执行全部校验 */
export function runAllValidators(ctx: ValidatorContext): {
  totalScore: number
  passed: boolean
  results: Record<string, ValidationResult>
} {
  const results: Record<string, ValidationResult> = {
    weapon: validateWeapon(ctx),
    ability: validateAbility(ctx),
    appearance: validateAppearance(ctx),
    hair: validateHair(ctx),
    personality: validatePersonality(ctx),
    speaking: validateSpeaking(ctx),
    knowledge: validateKnowledge(ctx),
    // Item 105: 独立的百科模式校验器（比 knowledge 更严格，覆盖更多禁用句式）
    encyclopediaMode: validateEncyclopediaMode(ctx),
    relationship: validateRelationship(ctx),
    scene: validateScene(ctx),
    world: validateWorld(ctx, ctx.reply),
    // V5 多人聊天校验（仅在有 runtime/replyPlan 时生效）
    replyPlan: validateReplyPlan(ctx),
    runtimeState: validateRuntimeState(ctx),
  }

  const allScores = Object.values(results).map((r) => r.score)
  const totalScore = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
  const passed = Object.values(results).every((r) => r.passed)

  return { totalScore, passed, results }
}
