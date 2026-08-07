/**
 * ReplyValidator — 多人回复校验器（Multi Character Engine V2）
 *
 * 增强检查：
 *  1) 是否出现不存在的角色
 *  2) 是否引用未发生的事件
 *  3) 是否越权知道信息（PerceptionFilter 结果）
 *  4) 是否破坏 Scene（位置冲突、天气冲突）
 *  5) 是否改变他人人格（OOC 检查）
 *
 * 异常等级：
 *   - error（严重）：必须重新生成
 *   - warning（小问题）：可自动修正或提示
 */

import type { CharacterRuntime } from './CharacterRuntime'
import { detectPerceptionBreach } from './PerceptionFilter'

export type ReplyErrorLevel = 'error' | 'warning'

export interface ReplyValidationIssue {
  level: ReplyErrorLevel
  type:
    | 'unknown_character'
    | 'unknown_event'
    | 'perception_breach'
    | 'scene_violation'
    | 'personality_violation'
    | 'format_error'
  message: string
  /** 建议的修正文本（可选） */
  suggestion?: string
}

export interface ReplyValidationResult {
  valid: boolean
  shouldRegenerate: boolean
  issues: ReplyValidationIssue[]
  fixedText?: string
}

/** 校验输入 */
export interface ReplyValidateInput {
  reply: string
  speaker: CharacterRuntime | undefined
  allPresent: CharacterRuntime[]
  messages: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    speakerId?: string | null
    speakerName?: string | null
    content: string
    timestamp: number
    witnessedBy: string[]
  }>
  /** 允许出现的所有已知角色名（来自角色数据库） */
  knownCharacterNames: string[]
  /**
   * 如果非空：本次只允许这些角色名说话，其他角色发言一律视为越权。
   * 用于 ReplyPlan 强化：点名 A 就只能 A 说话，其他人不许代答。
   */
  allowedSpeakerNames?: string[]
}

/** 主校验入口 */
export function validateReply(input: ReplyValidateInput): ReplyValidationResult {
  const issues: ReplyValidationIssue[] = []
  const { reply, speaker, allPresent, messages, allowedSpeakerNames } = input

  if (!reply || !reply.trim()) {
    return {
      valid: false,
      shouldRegenerate: true,
      issues: [{ level: 'error', type: 'format_error', message: 'AI 回复为空' }],
    }
  }

  const presentNames = new Set(allPresent.map((c) => c.characterName))
  const knownNames = new Set([...presentNames, ...input.knownCharacterNames])
  const allowedSet =
    allowedSpeakerNames && allowedSpeakerNames.length > 0
      ? new Set(allowedSpeakerNames.map((s) => s.trim()).filter(Boolean))
      : null

  // 1) 格式检查："角色名：" 格式是否正确
  const speakerNamesInReply = extractSpeakerMentions(reply)
  for (const name of speakerNamesInReply) {
    if (!knownNames.has(name)) {
      issues.push({
        level: 'error',
        type: 'unknown_character',
        message: `AI 回复中出现未定义的角色「${name}」`,
        suggestion: `请移除或替换为已在场角色：${Array.from(presentNames).join('、')}`,
      })
    } else if (!presentNames.has(name)) {
      // 已知但不在场：提示 warning（AI 可能越权让不在场角色说话）
      if (name !== speaker?.characterName) {
        issues.push({
          level: 'warning',
          type: 'perception_breach',
          message: `「${name}」不在场，但被 AI 在回复中提及`,
        })
      }
    }

    // 🔴 越权说话检查：allowedSpeakerNames 非空时，只有这些角色能说话
    if (allowedSet && !allowedSet.has(name)) {
      issues.push({
        level: 'error',
        type: 'perception_breach',
        message: `「${name}」本轮无权发言（允许：${allowedSpeakerNames?.join('、') || ''}），禁止代答。`,
        suggestion: `请删除「${name}」的发言，只保留被点名/调度的角色：${allowedSpeakerNames?.join('、') || ''}`,
      })
    }
  }
  // 🔴 如果有越权说话的 error，即使只有 1 条也需重试
  const anySpeakerOverreach = issues.some(
    (i) => i.level === 'error' && i.type === 'perception_breach' && /无权发言|禁止代答/.test(i.message),
  )

  // 2) 越权感知检查
  if (speaker) {
    const breaches = detectPerceptionBreach(reply, speaker, allPresent, messages as any)
    for (const reason of breaches) {
      issues.push({
        level: 'error',
        type: 'perception_breach',
        message: reason,
      })
    }
  }

  // 3) 自我一致性：当前 speaker 必须在回复中出现（但 allowedSet 且非本人时跳过，不强制）
  const mustIncludeSelf =
    !allowedSet || (speaker?.characterName && allowedSet.has(speaker.characterName))
  if (speaker && mustIncludeSelf && !speakerNamesInReply.includes(speaker.characterName)) {
    issues.push({
      level: 'warning',
      type: 'format_error',
      message: `当前发言者「${speaker.characterName}」未在回复中出现`,
      suggestion: `请在回复中让 ${speaker.characterName} 发言`,
    })
  }

  // 4) 场景违规检查（简化）
  const sceneViolations = detectSceneViolations(reply, allPresent)
  for (const v of sceneViolations) {
    issues.push({ level: 'warning', type: 'scene_violation', message: v })
  }

  // 5) 人格一致性（简化：当前发言者的关键词检查）
  if (speaker) {
    const personalityViolations = detectPersonalityViolations(reply, speaker)
    for (const v of personalityViolations) {
      issues.push({ level: 'warning', type: 'personality_violation', message: v })
    }
  }

  // 汇总
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')

  let valid = errors.length === 0
  let shouldRegenerate = errors.length > 0
  // 越权代答必须强制 regenerate
  if (anySpeakerOverreach) shouldRegenerate = true
  let fixedText: string | undefined

  // 小错误自动修正：去掉不在场角色 / 越权说话角色的发言
  if (warnings.length > 0 && errors.length === 0 && !anySpeakerOverreach) {
    fixedText = autoFixReply(reply, issues, presentNames, speaker?.characterName, allowedSet)
  }
  // 若只有越权发言 error 且 AI 也输出了允许的角色 → 尝试只保留 allowed 的
  if (anySpeakerOverreach && allowedSet) {
    const tryFix = autoFixReply(reply, issues, presentNames, speaker?.characterName, allowedSet)
    if (tryFix && tryFix.trim().length > 0) {
      // 检查修复后是否真的只含 allowed speakers
      const postSpeakers = extractSpeakerMentions(tryFix)
      const stillOverreach = postSpeakers.some((n) => !allowedSet.has(n))
      if (!stillOverreach && postSpeakers.length > 0) {
        fixedText = tryFix
        shouldRegenerate = false
        valid = true
        // 降级：error → warning 并记录已修正
        const newIssues: ReplyValidationIssue[] = issues.map((i) =>
          i.level === 'error' && /无权发言|禁止代答/.test(i.message)
            ? { ...i, level: 'warning' as const, message: `[已自动修正] ${i.message}` }
            : i,
        )
        issues.splice(0, issues.length, ...newIssues)
      }
    }
  }

  return {
    valid,
    shouldRegenerate,
    issues,
    fixedText: shouldRegenerate ? undefined : fixedText,
  }
}

/** 提取回复中出现的所有 "角色名" */
function extractSpeakerMentions(reply: string): string[] {
  const set = new Set<string>()
  const re = /([\u4e00-\u9fa5A-Za-z]{2,8})[：:]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(reply)) !== null) {
    set.add(m[1])
  }
  return Array.from(set)
}

/** 检测简单场景违规（如"在天上游泳"等矛盾组合） */
function detectSceneViolations(reply: string, allPresent: CharacterRuntime[]): string[] {
  const violations: string[] = []
  const replyLower = reply.toLowerCase()

  // 位置与动作矛盾（简单规则）
  const contradictions: Array<[RegExp, RegExp, string]> = [
    [/在(?:沙发|椅子|床|座位)/, /(?:飞翔|飞行|翱翔|漂浮|飘浮)/, '在家具上不可能飞翔'],
    [/在(?:水里|河中|湖中|海中)/, /(?:点燃|燃烧|着火|起火)/, '水中不可能点燃火焰'],
    [/在(?:图书馆|教室)/, /(?:大声喧哗|尖叫|怒吼|咆哮)/, '图书馆/教室不宜大声喧哗'],
  ]
  for (const [place, action, reason] of contradictions) {
    if (place.test(replyLower) && action.test(replyLower)) {
      violations.push(reason)
    }
  }

  return violations
}

/** 检测人格违规（当前 speaker 的核心性格特征被违反） */
function detectPersonalityViolations(reply: string, speaker: CharacterRuntime): string[] {
  const violations: string[] = []
  const profile = speaker.profile as Record<string, unknown>
  const personality = profile?.personality
  if (!personality) return violations

  // 简化：如果角色设定"高冷"却出现撒娇语气词 → 提示
  const person = Array.isArray(personality) ? personality.join(',') : String(personality)
  const contradictions: Array<[RegExp, string, string]> = [
    [/撒娇|娇嗔|嘤嘤|抱抱/, /(?:高冷|冷漠|严肃|严肃|少言)/, '高冷角色不应频繁撒娇'],
    [/冷酷|冰冷|无情/, /(?:热情|活泼|撒娇|嘻嘻)/, '冷酷角色不应过于热情'],
    [/天真|单纯|呆萌/, /(?:老练|世故|深沉|运筹帷幄)/, '天真角色不应表现得过于世故'],
  ]
  const replyLower = reply.toLowerCase()
  for (const [wordRegex, personaRegex, reason] of contradictions) {
    if (wordRegex.test(replyLower) && personaRegex.test(person)) {
      violations.push(`${speaker.characterName} 的人设可能被破坏：${reason}`)
    }
  }

  return violations
}

/** 自动修正回复（去除不在场角色的发言段落） */
function autoFixReply(
  reply: string,
  issues: ReplyValidationIssue[],
  presentNames: Set<string>,
  selfName: string | undefined,
  allowedSet?: Set<string> | null,
): string | undefined {
  if (!selfName) return undefined
  const lines = reply.split('\n')
  const kept: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(/^([\u4e00-\u9fa5A-Za-z]{2,8})[：:]/)
    if (match) {
      const name = match[1]
      // 优先白名单（allowedSpeakerNames）：不在里面就丢
      if (allowedSet && !allowedSet.has(name)) continue
      if (presentNames.has(name)) {
        kept.push(line)
      }
      // 不在场 → 丢弃
    } else {
      kept.push(line)
    }
  }
  const fixed = kept.join('\n').trim()
  return fixed || reply
}
