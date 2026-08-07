/**
 * CanonConstraintSplitter — 角色约束拆分（Official Canon Engine）
 *
 * 将角色官方约束拆为独立模块，每个模块单独验证：
 * 身份 / 性格 / 外观 / 服装 / 头发 / 武器 / 能力
 * 关系 / 说话风格 / 知识 / 世界观
 *
 * 每个模块可独立生成 Prompt 片段 / 独立校验 / 独立打分。
 */

import type { CanonDimension, CanonCharacterRecord } from './CanonDatabase'

export interface CanonConstraintBlock {
  /** 维度 */
  dimension: CanonDimension
  /** 约束标题（中文） */
  title: string
  /** 约束文本（简洁，用于 Prompt） */
  text: string
  /** 是否为硬性禁止（违反直接判 error） */
  hard: boolean
  /** 权重（用于 Canon Score 计算，0~1） */
  weight: number
}

const DIMENSION_META: Record<CanonDimension, { title: string; weight: number; hard: boolean }> = {
  worldview:   { title: '世界观', weight: 1.0, hard: true },
  identity:    { title: '身份', weight: 0.9, hard: true },
  weapon:      { title: '武器', weight: 0.9, hard: true },
  ability:     { title: '能力', weight: 0.9, hard: true },
  personality: { title: '性格', weight: 0.85, hard: false },
  speaking:    { title: '说话风格', weight: 0.75, hard: false },
  costume:     { title: '服装', weight: 0.7, hard: true },
  hair:        { title: '头发', weight: 0.6, hard: false },
  appearance:  { title: '外观', weight: 0.7, hard: true },
  relationship:{ title: '关系', weight: 0.6, hard: false },
  knowledge:   { title: '知识', weight: 0.6, hard: true },
}

/** 按维度生成约束块 */
export function buildConstraintBlock(record: CanonCharacterRecord, dimension: CanonDimension): CanonConstraintBlock {
  const meta = DIMENSION_META[dimension]
  const text = buildDimensionText(record, dimension)
  return {
    dimension,
    title: meta.title,
    text,
    hard: meta.hard,
    weight: meta.weight,
  }
}

/** 为指定角色生成全维度约束块（按权重从高到低） */
export function buildAllConstraintBlocks(record: CanonCharacterRecord, dimensions?: CanonDimension[]): CanonConstraintBlock[] {
  const dims = dimensions || getDefaultDimensions()
  const blocks = dims.map((d) => buildConstraintBlock(record, d))
  blocks.sort((a, b) => b.weight - a.weight)
  return blocks
}

/** 生成极简 Prompt 约束串（一行搞定） */
export function buildCanonOneLiner(record: CanonCharacterRecord, mode: 'all' | 'battle' | 'costume' | 'relationship' | 'daily' = 'all'): string {
  const parts: string[] = []
  parts.push(`姓名：${record.name}`)
  parts.push(`身份：${record.identity}`)

  if (mode === 'all' || mode === 'battle') {
    parts.push(`武器：${record.weaponType}`)
    if (record.abilities.length) parts.push(`能力：${record.abilities.slice(0, 3).join('、')}`)
  }
  if (mode === 'all' || mode === 'costume') {
    parts.push(`服装：当前${record.defaultCostume}服装`)
    parts.push(`发型：${record.officialHair}`)
  }
  if (mode === 'all' || mode === 'battle' || mode === 'daily') {
    if (record.personality.length) parts.push(`性格：${record.personality.slice(0, 3).join('、')}`)
  }
  if (mode === 'all' || mode === 'relationship') {
    const relKeys = Object.keys(record.relationships)
    if (relKeys.length) parts.push(`关系：${relKeys.slice(0, 3).join('、')}`)
  }
  if (mode === 'all' || mode === 'daily') {
    if (record.speakingStyle) {
      const styleShort = record.speakingStyle.slice(0, 60).replace(/\s+/g, '')
      parts.push(`说话风格：${styleShort}`)
    }
  }

  parts.push('禁止使用不存在的武器和设定，保持官方人格')
  return parts.join(' | ')
}

/** 默认维度集合（用于全量 Prompt） */
export function getDefaultDimensions(): CanonDimension[] {
  return ['worldview', 'identity', 'weapon', 'ability', 'personality', 'speaking', 'costume', 'hair', 'relationship', 'knowledge']
}

// ===== 内部：按维度生成文本 =====

function buildDimensionText(record: CanonCharacterRecord, dimension: CanonDimension): string {
  switch (dimension) {
    case 'worldview':
      return `世界观：${record.worldviewId}。禁止引入其他 IP 设定。`
    case 'identity':
      return `身份：${record.identity}${record.faction ? '，所属 ' + record.faction : ''}。`
    case 'personality':
      return `核心性格：${record.personality.slice(0, 5).join('、') || '保持官方人格'}。`
    case 'weapon':
      return `武器：仅可使用 ${record.weaponType}。禁止其他武器。`
    case 'ability':
      return `能力：仅可使用 ${record.abilities.slice(0, 3).join('、') || '官方命途能力'}。`
    case 'costume':
      return `服装：当前默认 ${record.defaultCostume} 服装。不得自定义。`
    case 'hair':
      return `发型：${record.officialHair}。`
    case 'appearance':
      return `外观：发型 ${record.officialHair}，服装 ${record.defaultCostume}。`
    case 'relationship': {
      const rels = Object.entries(record.relationships).slice(0, 5)
      return rels.length
        ? `关系：${rels.map(([k, v]) => `${k}=${v}`).join('；')}。`
        : '关系：按当前场景互动。'
    }
    case 'speaking':
      return `说话风格：${(record.speakingStyle || '').slice(0, 150) || '符合官方设定，不使用网络用语或粗话。'}`
    case 'knowledge':
      return `背景：${(record.background || '').slice(0, 120) || '遵循官方背景。'}`
    default:
      return ''
  }
}
