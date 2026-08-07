/**
 * ReplyValidator — V5 回复校验器
 *
 * 不参与聊天，只负责最后检查。
 * 检查：官方性格 / 官方武器 / 官方能力 / 官方服装 / 当前场景 / Runtime 状态
 * 失败 → 返回 shouldRegenerate
 */

import type { ConversationRuntime, ReplyPlan } from './ConversationRuntime'
import { getCanonCharacter } from '../canon/CanonDatabase'

export interface ValidatorReport {
  passed: boolean
  shouldRegenerate: boolean
  score: number
  violations: Array<{ level: 'error' | 'warning'; type: string; message: string }>
  fixedReply?: string
}

const PASS_THRESHOLD = 95

/** 主校验入口 */
export function validateReply(
  reply: string,
  runtime: ConversationRuntime,
  plan: ReplyPlan,
): ValidatorReport {
  const violations: Array<{ level: 'error' | 'warning'; type: string; message: string }> = []
  if (!reply) {
    return { passed: false, shouldRegenerate: true, score: 0, violations: [{ level: 'error', type: 'empty', message: '回复为空' }] }
  }

  // 1) 检查 mustReply 角色是否在回复中出现
  for (const id of plan.mustReply) {
    const cr = runtime.characterRuntime[id]
    if (cr && !reply.includes(cr.characterName)) {
      violations.push({
        level: 'error', type: 'missing_speaker',
        message: `必须回复的角色「${cr.characterName}」未在回复中出现`,
      })
    }
  }

  // 2) 检查 silent 角色是否不该出现却出现了
  for (const id of plan.silent) {
    const cr = runtime.characterRuntime[id]
    if (cr && reply.includes(`${cr.characterName}：`)) {
      violations.push({
        level: 'error', type: 'unauthorized_speaker',
        message: `应该保持沉默的「${cr.characterName}」在回复中发言了`,
      })
    }
  }

  // 3) 检查每个发言角色的官方设定
  const speakerNames = extractSpeakerNames(reply)
  for (const name of speakerNames) {
    const canon = getCanonCharacter(name)
    if (!canon) {
      violations.push({ level: 'warning', type: 'unknown_character', message: `「${name}」无官方设定` })
      continue
    }

    // 3a) 武器检查
    const weaponBans = getWeaponBans(name)
    for (const w of weaponBans) {
      if (reply.includes(w)) {
        violations.push({
          level: 'error', type: 'weapon_violation',
          message: `${name} 不应使用 "${w}"（官方武器：${canon.weaponType}）`,
        })
      }
    }

    // 3b) 人格检查
    const personaBans = getPersonaBans(name)
    for (const phrase of personaBans) {
      if (reply.includes(phrase)) {
        violations.push({
          level: 'warning', type: 'personality_violation',
          message: `${name} 出现 "${phrase}"，可能违反官方人格`,
        })
      }
    }
  }

  // 4) 检查场景违规
  const sceneBans: Array<[RegExp, string]> = [
    [/(沙滩|海浪|海边)/, '当前场景不是海边'],
    [/(木叶村|忍者|查克拉)/, '引入了非星穹铁道世界观'],
  ]
  for (const [re, msg] of sceneBans) {
    if (re.test(reply)) {
      violations.push({ level: 'error', type: 'scene_violation', message: msg })
    }
  }

  // 5) 检查 Runtime 一致性
  for (const id of runtime.activeCharacters) {
    const cr = runtime.characterRuntime[id]
    if (!cr) continue
    if (cr.state === 'sleeping' && reply.includes(`${cr.characterName}：`)) {
      violations.push({ level: 'error', type: 'state_violation', message: `${cr.characterName} 处于睡眠状态，不应发言` })
    }
  }

  // 6) 评分
  let score = 100
  for (const v of violations) {
    score -= v.level === 'error' ? 25 : 15
  }
  score = Math.max(0, score)

  // 7) 自动修正（去掉 silent 角色的发言段落）
  let fixedReply: string | undefined
  const hasErrors = violations.some((v) => v.level === 'error')
  if (!hasErrors && violations.length > 0) {
    fixedReply = autoFix(reply, plan, runtime)
  }

  return {
    passed: score >= PASS_THRESHOLD && !hasErrors,
    shouldRegenerate: score < PASS_THRESHOLD || hasErrors,
    score,
    violations,
    fixedReply,
  }
}

/** 提取回复中出现的角色名 */
function extractSpeakerNames(reply: string): string[] {
  const set = new Set<string>()
  const re = /([\u4e00-\u9fa5A-Za-z]{2,8})[：:]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(reply)) !== null) set.add(m[1])
  return Array.from(set)
}

function getWeaponBans(characterName: string): string[] {
  const map: Record<string, string[]> = {
    '刃': ['狙击', '手枪', '步枪', '弓', '法杖', '火球', '雷电'],
    '银狼': ['剑', '刀', '巨剑', '长枪', '火球', '冰锥'],
    '卡芙卡': ['剑', '刀', '巨剑', '法杖', '长弓'],
    '流萤': ['刀', '剑', '弓'],
    '希儿': ['枪', '刀', '剑'],
    '布洛妮娅': ['刀', '剑', '法杖'],
    '三月七': ['刀', '剑', '法杖'],
    '花火': ['刀', '剑', '长枪'],
    '知更鸟': ['刀', '剑', '枪'],
  }
  return map[characterName] || []
}

function getPersonaBans(characterName: string): string[] {
  const map: Record<string, string[]> = {
    '刃': ['哈哈哈哈', '好开心', '嘻嘻', '撒娇', '抱抱', '耶'],
    '卡芙卡': ['害羞', '怯懦', '我好怕'],
    '流萤': ['哈哈大笑', '太好玩了', '撒娇'],
    '知更鸟': ['沉默', '冷漠'],
    '银狼': ['撒娇', '热情'],
    '花火': ['严肃', '冷漠'],
  }
  return map[characterName] || []
}

/** 自动修正：去掉 silent 角色的发言 */
function autoFix(reply: string, plan: ReplyPlan, runtime: ConversationRuntime): string {
  const silentNames = plan.silent.map((id) => runtime.characterRuntime[id]?.characterName).filter(Boolean)
  if (!silentNames.length) return reply

  const lines = reply.split('\n')
  const kept: string[] = []
  for (const line of lines) {
    let shouldKeep = true
    for (const name of silentNames) {
      if (line.startsWith(`${name}：`) || line.startsWith(`${name}:`)) {
        shouldKeep = false
        break
      }
    }
    if (shouldKeep) kept.push(line)
  }
  return kept.join('\n').trim()
}
