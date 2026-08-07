/**
 * DynamicCanonLoader — 按需动态资源加载（Official Canon Engine）
 *
 * 不把完整官方设定一次性塞进 Prompt。按需加载：
 *  - 问服装 → 只加载 Costume + Appearance + Speaking
 *  - 问战斗 → 只加载 Weapon + Ability + Personality + Scene
 *  - 问关系 → 只加载 Relationship + Story + Knowledge
 *  - 问日常 → 只加载 Personality + Speaking + Current State
 *  - 未提及角色完全不加载（仅保留"其他角色精简"一行）
 */

import { getCanonCharacter, type CanonDimension } from './CanonDatabase'
import { buildCostumeSnapshot } from './SnapshotGenerators'

export type LoadMode = 'costume' | 'battle' | 'relationship' | 'daily' | 'all' | 'question_other'

export interface LoadedResource {
  mode: LoadMode
  dimensions: CanonDimension[]
  /** 精简的约束文本 */
  compactText: string
  /** 估计 token */
  estimatedTokens: number
}

/** 模式 → 维度映射 */
const MODE_DIMENSIONS: Record<LoadMode, CanonDimension[]> = {
  costume: ['costume', 'appearance', 'hair', 'speaking'],
  battle: ['weapon', 'ability', 'personality'],
  relationship: ['relationship', 'knowledge'],
  daily: ['personality', 'speaking'],
  question_other: ['costume', 'appearance'],
  all: ['identity', 'weapon', 'ability', 'personality', 'speaking', 'costume', 'hair', 'relationship'],
}

/** 模式 → Prompt 文案生成器 */
const MODE_TEXT_BUILDERS: Record<LoadMode, (charName: string) => string> = {
  costume: (n) => `${n}，当前默认服装，不可随意变更。`,
  battle: (n) => `${n} 使用官方武器与能力，保持官方人格。`,
  relationship: (n) => `${n} 的关系以当前场景互动为准，不得自称多年好友。`,
  daily: (n) => `${n} 保持官方性格与说话风格。`,
  question_other: (n) => `${n} 仅以当前观察描述他人外观。`,
  all: (n) => `${n} 严格遵循全部官方设定。`,
}

/** 主入口：按模式加载指定角色的精简资源 */
export function loadCanonResource(
  characterName: string,
  mode: LoadMode,
): LoadedResource {
  const record = getCanonCharacter(characterName)
  const dimensions = MODE_DIMENSIONS[mode]
  const parts: string[] = []

  if (record) {
    parts.push(`${record.name}（${record.identity}）`)
    if (mode === 'costume') {
      const snap = buildCostumeSnapshot(record)
      parts.push(snap.fullText)
    }
    if (mode === 'battle') {
      parts.push(`武器：${record.weaponType}；能力：${record.abilities.slice(0, 3).join('、')}`)
    }
    if (mode === 'relationship') {
      const rels = Object.entries(record.relationships).slice(0, 3)
      if (rels.length) parts.push(`关系：${rels.map(([k, v]) => `${k}=${v}`).join('；')}`)
      else parts.push('关系：按当前场景互动。')
    }
    if (mode === 'daily') {
      parts.push(`性格：${record.personality.slice(0, 3).join('、') || '官方人格'}`)
    }
  } else {
    parts.push(`${characterName}（无官方设定，仅遵循世界观约束）`)
  }

  parts.push('禁止使用不存在的武器和设定。')

  const compactText = parts.join(' | ')
  const estimatedTokens = Math.ceil(compactText.length / 2)
  return {
    mode,
    dimensions,
    compactText,
    estimatedTokens,
  }
}

/** 批量加载多个角色（未提及角色不加载） */
export function loadCanonResourcesBatch(
  targetCharacters: Array<{ name: string; mode: LoadMode }>,
  maxTokens = 500,
): { resources: LoadedResource[]; totalTokens: number } {
  const resources: LoadedResource[] = []
  let totalTokens = 0
  for (const target of targetCharacters) {
    const res = loadCanonResource(target.name, target.mode)
    if (totalTokens + res.estimatedTokens > maxTokens) break
    resources.push(res)
    totalTokens += res.estimatedTokens
  }
  return { resources, totalTokens }
}

/** 为"其他在场角色"生成极简信息（仅一行） */
export function loadOtherCharacterBriefs(names: string[], maxCount = 3): string {
  const lines: string[] = []
  for (const name of names.slice(0, maxCount)) {
    const rec = getCanonCharacter(name)
    if (!rec) {
      lines.push(`- ${name}（无官方设定）`)
      continue
    }
    const personality = rec.personality.slice(0, 2).join('、') || '官方设定'
    lines.push(`- ${name}：${personality}。当前状态以你看到的为准。`)
  }
  lines.push('注：你只知道自己看到的内容，不要引用百科或"根据官方设定"。')
  return lines.join('\n')
}
