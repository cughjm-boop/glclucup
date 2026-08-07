/**
 * CanonPromptCompiler — 官方设定 Prompt 编译器
 *
 * 不再直接注入完整 JSON，改为程序生成简洁约束文本。
 * 支持动态加载策略：按需加载不同维度的设定。
 */

import { getCanonCharacter, getCanonWorld, type CanonCharacterRecord } from './CanonDatabase'
import { buildCanonOneLiner, type CanonConstraintBlock } from './CanonConstraintSplitter'
import { buildCostumeSnapshot, buildSelfSnapshot, buildOtherCharacterSnapshot } from './SnapshotGenerators'

/** 动态加载模式 */
export type PromptMode = 'all' | 'battle' | 'costume' | 'relationship' | 'daily' | 'question_other'

export interface CanonPromptContext {
  /** 当前发言角色名/ID */
  speakerName: string
  /** 在场的其他角色名列表（用于按需加载） */
  otherPresentNames?: string[]
  /** 用户最新消息（用于识别意图） */
  userMessage?: string
  /** 当前模式 */
  mode?: PromptMode
  /** 当前场景信息 */
  sceneInfo?: { location?: string; area?: string; position?: string }
  /** 当前情绪 */
  emotion?: string
  /** 当前关系度 */
  relationshipScore?: number
  /** 当前服装覆盖（可选，若有自定义换装） */
  customCostume?: string
}

export interface CanonPromptResult {
  systemPrompt: string
  selfSnapshot: string
  constraintBlocks: CanonConstraintBlock[]
  /** 动态加载的维度 */
  loadedDimensions: string[]
  /** 预估 token */
  estimatedTokens: number
}

/** 主入口：编译 Prompt */
export function compileCanonPrompt(ctx: CanonPromptContext): CanonPromptResult {
  const record = getCanonCharacter(ctx.speakerName)
  const world = getCanonWorld('star_rail')
  const mode: PromptMode = ctx.mode || detectModeFromMessage(ctx.userMessage || '')

  const lines: string[] = []
  const loadedDimensions: string[] = []

  // 1) 世界观约束
  lines.push('【官方设定 — 最高优先级约束】')
  lines.push('你必须严格遵循以下官方设定。任何回复不得违反。')
  lines.push('')
  lines.push(`世界观：${world.name}`)
  lines.push(`规则：${world.rules.join('；')}`)
  loadedDimensions.push('worldview')

  if (!record) {
    lines.push('')
    lines.push('（当前角色无官方设定，仅遵循世界观约束）')
    return {
      systemPrompt: lines.join('\n'),
      selfSnapshot: '',
      constraintBlocks: [],
      loadedDimensions,
      estimatedTokens: lines.join(' ').length * 2,
    }
  }

  // 2) Self Snapshot（让 AI 真正知道自己是谁）
  const selfSnapshot = buildSelfSnapshot(record, {
    sceneInfo: ctx.sceneInfo,
    emotion: ctx.emotion,
    customCostume: ctx.customCostume,
  })
  lines.push('')
  lines.push('【自我认知 Self Snapshot】')
  lines.push(selfSnapshot)
  loadedDimensions.push('identity')

  // 3) 按模式动态加载
  lines.push('')
  lines.push('【官方约束（精简版）】')
  lines.push(buildCanonOneLiner(record, mode))
  loadedDimensions.push(...getDimensionsForMode(mode))

  // 4) 说话风格（所有模式都必须加载）
  if (record.speakingStyle) {
    lines.push('')
    lines.push('【说话风格】')
    lines.push(record.speakingStyle.slice(0, 200))
    loadedDimensions.push('speaking')
  }

  // 5) 关系与情绪
  if (ctx.relationshipScore !== undefined) {
    lines.push('')
    lines.push(`【关系度】与用户关系：${ctx.relationshipScore}/100`)
  }

  // 6) 当前情绪
  if (ctx.emotion) {
    lines.push('')
    lines.push(`【当前情绪】${ctx.emotion}`)
  }

  // 7) 动态加载：当用户问"其他角色"时
  if (mode === 'question_other' && ctx.otherPresentNames && ctx.otherPresentNames.length) {
    lines.push('')
    lines.push('【其他在场角色（仅当前外观摘要）】')
    for (const otherName of ctx.otherPresentNames.slice(0, 3)) {
      const other = getCanonCharacter(otherName)
      if (!other) continue
      const snap = buildOtherCharacterSnapshot(other, { customCostume: undefined })
      lines.push(`- ${snap}`)
    }
    lines.push('注：只描述你"当前看到"的内容，不要引用百科或"根据官方设定"。')
  }

  // 8) 禁止事项（重要！）
  lines.push('')
  lines.push('【禁止事项】')
  lines.push('- 使用第一人称"我"回答自身问题，不要用第三人称百科描述自己。')
  lines.push('- 禁止说"根据官方设定"、"她的服装"、"这个角色"等词条。')
  lines.push('- 不得提及不在场角色的外观/武器/能力，除非对方当前场景有表现。')
  lines.push('- 不得使用不属于你的武器、能力、身份。')
  lines.push('- 不得违反世界观铁律（如出现其他 IP 元素）。')

  // 9) 组装约束块（供 CanonValidator 引用）
  const constraintBlocks = buildBlocksForMode(record, mode)

  const systemPrompt = lines.join('\n')
  // token 估算
  const chineseMatch = systemPrompt.match(/[\u4e00-\u9fa5]/g) || []
  const estimatedTokens = chineseMatch.length * 2 + Math.ceil(systemPrompt.length / 10)

  return {
    systemPrompt,
    selfSnapshot,
    constraintBlocks,
    loadedDimensions,
    estimatedTokens,
  }
}

/** 根据用户消息识别当前模式 */
export function detectModeFromMessage(msg: string): PromptMode {
  if (!msg) return 'all'
  const m = msg.toLowerCase()
  if (/(武器|攻击|战斗|技能|能力|大招|必杀|打|杀|战)/.test(msg)) return 'battle'
  if (/(衣服|服装|穿|穿的|打扮|造型|好看|裙子|头发|发型|鞋|外套)/.test(msg)) return 'costume'
  if (/(喜欢|爱|关系|认识|谁|介绍|名字|是谁|熟悉|朋友|敌人)/.test(msg)) return 'relationship'
  if (msg.includes('你') && /(你是|你叫|你在|你喜欢|你的|你会|你能)/.test(msg)) {
    // 如果用户问的是"你自己"的情况 → daily
    if (/(他|她|别人|其他人|大家|他们|那个)/.test(msg)) return 'question_other'
    return 'daily'
  }
  if (/(他|她|别人|其他人|大家|他们|那个)/.test(msg) && /(穿|长|武器|能力|是谁|介绍)/.test(msg)) return 'question_other'
  return 'daily'
}

function getDimensionsForMode(mode: PromptMode): string[] {
  switch (mode) {
    case 'battle': return ['weapon', 'ability', 'personality']
    case 'costume': return ['costume', 'hair', 'appearance']
    case 'relationship': return ['relationship', 'knowledge']
    case 'question_other': return ['costume', 'hair']
    case 'daily': return ['personality', 'speaking']
    default: return ['identity', 'personality', 'weapon', 'ability', 'costume']
  }
}

function buildBlocksForMode(record: CanonCharacterRecord, mode: PromptMode): CanonConstraintBlock[] {
  const { buildConstraintBlock } = require('./CanonConstraintSplitter')
  const dims = getDimensionsForMode(mode) as any[]
  return dims.map((d) => buildConstraintBlock(record, d))
}

/** 暴露 Snapshot 生成器，便于外部调用 */
export { buildCostumeSnapshot, buildSelfSnapshot, buildOtherCharacterSnapshot } from './SnapshotGenerators'
