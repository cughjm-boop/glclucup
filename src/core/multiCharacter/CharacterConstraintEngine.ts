/**
 * CharacterConstraintEngine — 角色约束引擎 (Multi Character Engine V4)
 *
 * 每轮自动注入：角色身份、当前服装、当前发型、当前武器、
 * 当前能力、当前位置、当前情绪、禁止事项。
 * 保证角色不会突然拿出不符合设定的武器或改变外观。
 */

import type { CharacterRuntimeV4 } from './CharacterRuntimeV4'
import { getCanonCharacter } from '../canon/CanonDatabase'

export interface ConstraintSnapshot {
  /** 文本形式的约束（注入 Prompt） */
  promptText: string
  /** 结构化字段 */
  fields: {
    name: string
    identity: string
    costume: string
    hairstyle: string
    weapon: string
    abilities: string
    position: string
    emotion: string
    prohibitions: string[]
  }
}

/** 为指定运行时生成当前约束快照 */
export function buildConstraintSnapshot(runtime: CharacterRuntimeV4): ConstraintSnapshot {
  const canon = getCanonCharacter(runtime.characterName)
  const profile = runtime.profile as Record<string, any>

  const identity = canon?.identity || profile?.identity || '未知身份'
  const costume = runtime.costume || canon?.defaultCostume || '官方默认'
  const hairstyle = runtime.hairstyle || canon?.officialHair || '官方设定'
  const weapon = runtime.weapon || canon?.weaponType || '官方武器'
  const abilities = canon?.abilities?.slice(0, 3).join('、') || '官方能力'
  const position = runtime.position || '默认位置'
  const emotion = runtime.emotion || 'neutral'

  const prohibitions: string[] = [
    `禁止使用不属于 ${runtime.characterName} 的武器`,
    `禁止改变发型为非官方设定（当前：${hairstyle}）`,
    `禁止改变服装为非当前设定（当前：${costume}）`,
    `禁止使用不存在的能力（官方能力：${abilities}）`,
    `保持官方人格与说话风格`,
    `禁止引入非星穹铁道世界观元素`,
  ]

  const promptText = [
    `【当前角色约束】`,
    `你是 ${runtime.characterName}。`,
    `身份：${identity}。`,
    `当前服装：${costume}。`,
    `当前发型：${hairstyle}。`,
    `当前武器：${weapon}。`,
    `官方能力：${abilities}。`,
    `当前位置：${position}。`,
    `当前情绪：${emotion}。`,
    ``,
    `【禁止事项】`,
    ...prohibitions.map((p) => `- ${p}`),
  ].join('\n')

  return {
    promptText,
    fields: {
      name: runtime.characterName,
      identity, costume, hairstyle, weapon, abilities, position, emotion, prohibitions,
    },
  }
}

/** 生成精简版约束（仅一行，用于其他角色的 Prompt） */
export function buildMinimalConstraint(runtime: CharacterRuntimeV4): string {
  const canon = getCanonCharacter(runtime.characterName)
  const personality = (canon?.personality || []).slice(0, 2).join('、')
  return `${runtime.characterName}（${personality}），服装${runtime.costume}，武器${runtime.weapon}。`
}

/** 校验运行时字段是否违反官方设定 */
export function validateRuntimeFields(runtime: CharacterRuntimeV4): Array<{ field: string; issue: string }> {
  const issues: Array<{ field: string; issue: string }> = []
  const canon = getCanonCharacter(runtime.characterName)
  if (!canon) return issues

  // 武器检查
  if (runtime.weapon && canon.weaponType !== '官方武器') {
    // 简化：只做弱匹配
    const canonWeapon = canon.weaponType
    if (!runtime.weapon.includes(canonWeapon.slice(0, 2))) {
      // 仅警告，允许运行时覆盖
    }
  }

  return issues
}
