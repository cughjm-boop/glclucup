/**
 * CanonValidator — 官方设定总校验器（Official Canon Engine）
 *
 * 封装完整的 Canon 校验流程：
 *   AI 回复 → 各维度 Validator → Canon Score → 低于 95% 自动重新生成。
 *
 * V5 架构：统一接管 ReplyValidator 的职责，合并为一个校验入口。
 *   - 官方武器/人格/能力/服装/发型校验
 *   - V5 ReplyPlan 校验（mustReply/silent）
 *   - V5 RuntimeState 校验（睡眠/离场/武器一致性）
 *
 * 提供：
 *  - validateCanonReply(ctx)：标准 Canon 校验
 *  - validateWithRuntime(reply, runtime, plan, characterMap)：V5 统一校验
 *  - autoRewrite(reply, violations)：一键修正
 */

import {
  runAllValidators,
  type ValidationResult,
  type ValidatorContext,
  type ValidationViolation,
} from './CanonValidators'
import { getCanonCharacter, type CanonCharacterRecord } from './CanonDatabase'

export interface CanonValidationReport {
  totalScore: number
  passed: boolean
  shouldRegenerate: boolean
  results: Record<string, ValidationResult>
  violations: ValidationViolation[]
  fixedReply?: string
}

/** 触发重新生成的阈值 */
export const CANON_PASS_THRESHOLD = 95

/** 主校验入口 */
export function validateCanonReply(ctx: ValidatorContext, opts?: {
  /** 分数阈值（默认 95） */
  threshold?: number
  /** 是否尝试自动修正（默认 true） */
  autoFix?: boolean
}): CanonValidationReport {
  const threshold = opts?.threshold ?? CANON_PASS_THRESHOLD
  const autoFix = opts?.autoFix ?? true

  const { totalScore, passed, results } = runAllValidators(ctx)
  const violations = Object.values(results).flatMap((r) => r.violations)

  const shouldRegenerate = totalScore < threshold

  let fixedReply: string | undefined
  if (!shouldRegenerate && autoFix && violations.length > 0) {
    fixedReply = autoRewrite(ctx.reply, violations)
  }

  return {
    totalScore,
    passed: totalScore >= 100 || (passed && totalScore >= threshold),
    shouldRegenerate,
    results,
    violations,
    fixedReply,
  }
}

/**
 * V5 统一校验入口 — 合并原 ReplyValidator 职责
 *
 * @param reply AI 回复文本
 * @param runtime 对话运行时状态（包含 activeCharacters、characterRuntime）
 * @param plan 回复计划（mustReply/optionalReply/silent）
 * @param characterMap 角色 ID → CanonCharacterRecord 映射（可选，缺失则通过名字查找）
 * @param opts 校验选项
 */
export function validateWithRuntime(
  reply: string,
  runtime: {
    activeCharacters: string[]
    characterRuntime: Record<string, {
      characterName: string
      state: string
      position: string
      action: string
      costume: string
      weapon: string
    }>
    scene: { location?: string; area?: string }
  },
  plan: { mustReply: string[]; optionalReply: string[]; silent: string[] },
  characterMap?: Record<string, CanonCharacterRecord>,
  opts?: { threshold?: number; autoFix?: boolean },
): CanonValidationReport {
  if (!reply) {
    return {
      totalScore: 0,
      passed: false,
      shouldRegenerate: true,
      results: {},
      violations: [{ level: 'error', type: 'empty', message: '回复为空' }],
    }
  }

  const threshold = opts?.threshold ?? CANON_PASS_THRESHOLD
  const autoFix = opts?.autoFix ?? true

  // 为每个发言角色构建 ValidatorContext 并分别校验
  const speakerNames = extractSpeakerNames(reply)
  const allResults: Record<string, ValidationResult> = {}
  const allViolations: ValidationViolation[] = []

  for (const name of speakerNames) {
    const canon = characterMap
      ? findCanonByName(characterMap, name)
      : getCanonCharacter(name)

    if (!canon) {
      allViolations.push({
        level: 'warning',
        type: 'unknown_character',
        message: `「${name}」无官方设定`,
      })
      continue
    }

    const ctx: ValidatorContext = {
      reply,
      record: canon,
      sceneInfo: {
        location: runtime.scene?.location,
        area: runtime.scene?.area,
      },
      otherPresentNames: runtime.activeCharacters
        .map((id) => runtime.characterRuntime[id]?.characterName)
        .filter((n) => n && n !== name) as string[],
      runtime,
      replyPlan: plan,
      characterMap,
    }

    const { results } = runAllValidators(ctx)
    for (const [key, val] of Object.entries(results)) {
      const fullKey = `${name}:${key}`
      allResults[fullKey] = val
      allViolations.push(...val.violations)
    }
  }

  // 全局 ReplyPlan + RuntimeState 校验（无特定角色）
  if (speakerNames.length === 0) {
    const globalCtx: ValidatorContext = {
      reply,
      record: { name: 'system' } as CanonCharacterRecord,
      sceneInfo: { location: runtime.scene?.location, area: runtime.scene?.area },
      runtime,
      replyPlan: plan,
      characterMap,
    }
    const { results } = runAllValidators(globalCtx)
    for (const [key, val] of Object.entries(results)) {
      allResults[`global:${key}`] = val
      allViolations.push(...val.violations)
    }
  }

  // 计算总分
  const allScores = Object.values(allResults).map((r) => r.score)
  const totalScore = allScores.length > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 100
  const passed = allViolations.filter((v) => v.level === 'error').length === 0 && totalScore >= threshold
  const shouldRegenerate = totalScore < threshold || allViolations.filter((v) => v.level === 'error').length > 0

  // 自动修正
  let fixedReply: string | undefined
  if (autoFix && !shouldRegenerate && allViolations.length > 0) {
    fixedReply = autoFixReply(reply, allViolations, plan, runtime)
  }

  return {
    totalScore,
    passed,
    shouldRegenerate,
    results: allResults,
    violations: allViolations,
    fixedReply,
  }
}

/** 提取回复中的发言角色名 */
function extractSpeakerNames(reply: string): string[] {
  const set = new Set<string>()
  const re = /([\u4e00-\u9fa5A-Za-z]{2,8})[：:]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(reply)) !== null) set.add(m[1])
  return Array.from(set)
}

/** 从 characterMap 中按名字查找 CanonCharacterRecord */
function findCanonByName(
  map: Record<string, CanonCharacterRecord>,
  name: string,
): CanonCharacterRecord | null {
  for (const record of Object.values(map)) {
    if (record.name === name) return record
  }
  return null
}

/** V5 专用自动修正：移除 silent 角色的发言段落 + 清除违规内容 */
function autoFixReply(
  reply: string,
  violations: ValidationViolation[],
  plan: { silent: string[] },
  runtime: { characterRuntime: Record<string, { characterName: string }> },
): string {
  let text = reply

  // 1) 移除 silent 角色的发言
  const silentNames = plan.silent
    .map((id) => runtime.characterRuntime[id]?.characterName)
    .filter((n): n is string => Boolean(n))

  if (silentNames.length > 0) {
    const lines = text.split('\n')
    const kept = lines.filter((line) => {
      for (const name of silentNames) {
        if (line.startsWith(`${name}：`) || line.startsWith(`${name}:`)) return false
      }
      return true
    })
    text = kept.join('\n').trim()
  }

  // 2) 移除第三方违规描述
  text = autoRewrite(text, violations)

  return text
}

/** 是否需要重新生成 */
export function shouldRegenerateByScore(score: number, threshold = CANON_PASS_THRESHOLD): boolean {
  return score < threshold
}

/** 一键自动修正（移除违规片段） */
export function autoRewrite(reply: string, violations: ValidationViolation[]): string {
  if (!violations.length) return reply
  let text = reply

  // 移除"根据官方设定"等条目
  const thirdPersonPatterns = [
    /根据官方设定[^，。,.\n]*/g,
    /根据游戏设定[^，。,.\n]*/g,
    /根据原著[^，。,.\n]*/g,
    /在官方设定里[^，。,.\n]*/g,
    /我查了一下[^，。,.\n]*/g,
  ]
  for (const re of thirdPersonPatterns) {
    text = text.replace(re, '')
  }

  // 把违反设定的武器能力替换为符合设定的描述
  for (const v of violations) {
    for (const snippet of [v.snippet || v.message]) {
      if (text.includes(snippet)) {
        text = text.replace(snippet, '（此部分不符合官方设定，已省略）')
      }
    }
  }

  return text.trim()
}

/** 生成人类可读的 Canon 评分报告 */
export function formatCanonReport(report: CanonValidationReport): string {
  const lines: string[] = []
  lines.push(`Canon Score: ${report.totalScore}/100`)
  lines.push(report.shouldRegenerate ? '状态：❌ 低于阈值，建议重新生成' : '状态：✅ 通过')
  lines.push('')
  for (const [name, result] of Object.entries(report.results)) {
    const status = result.passed ? '✅' : '❌'
    lines.push(`${status} ${name}: ${result.score}/100`)
    for (const v of result.violations) {
      lines.push(`  - [${v.level}] ${v.message}`)
    }
  }
  return lines.join('\n')
}
