/**
 * PromptCompiler — 多人 Prompt 优化（Multi Character Engine V2）
 *
 * 关键策略：
 *  - 只对当前发言角色注入完整人格
 *  - 其他在场角色只注入 "姓名 + 一句性格摘要 + 一句当前状态"
 *  - 每个角色只注入其"可见"的历史消息
 *  - Token 大幅下降（相对于"所有人都注入完整设定"）
 */

import type { CharacterRuntime } from './CharacterRuntime'
import type { ConversationState, SceneEvent } from './ConversationState'
import { filterHistoryForCharacter } from './PerceptionFilter'

/** Prompt 编译选项 */
export interface CompilePromptOptions {
  speaker: CharacterRuntime | undefined
  allPresent: CharacterRuntime[]
  userMessage: string
  conversationSnapshot: ConversationState
  event: SceneEvent
  /** 最多给其他角色注入多少信息（用于截断） */
  maxOtherCharacters?: number
}

/** 编译结果 */
export interface MultiCharacterPromptResult {
  /** 完整 system prompt（当前发言者视角） */
  systemPrompt: string
  /** 用于本次调用的 messages（含 user / system 历史） */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; name?: string }>
  /** 预估 token 数（粗略估算） */
  estimatedTokens: number
  /** 本次发言目标角色名 */
  speakerName: string
}

/**
 * Prompt 编译器主入口
 */
export function compileMultiCharacterPrompt(opts: CompilePromptOptions): MultiCharacterPromptResult {
  const { speaker, allPresent, userMessage, conversationSnapshot, event, maxOtherCharacters = 3 } = opts
  const speakerName = speaker?.characterName || '未知角色'

  // 1) 获取当前发言者的可见历史
  const perception = speaker
    ? filterHistoryForCharacter(
        {
          self: speaker,
          messages: conversationSnapshot.messages,
          lastSceneEvent: event,
        },
        30,
      )
    : null

  // 2) 构造系统 Prompt
  const systemLines: string[] = []
  systemLines.push('【多角色对话模式】')
  systemLines.push('')
  systemLines.push(`当前你扮演的角色：${speakerName}`)

  if (speaker) {
    // 为当前发言角色注入完整人格（从 profile 读取）
    const profile = speaker.profile as Record<string, unknown>
    const identity = profile?.identity || profile?.身份 || ''
    const personality = profile?.personality
    const speakingStyle = profile?.speaking_style || profile?.speaking_style

    if (identity) systemLines.push(`身份：${identity}`)
    if (Array.isArray(personality) && personality.length) {
      systemLines.push(`核心性格：${personality.slice(0, 5).join('、')}`)
    }
    if (speakingStyle) {
      const styleText = typeof speakingStyle === 'string' ? speakingStyle : String(speakingStyle)
      systemLines.push(`说话风格：${styleText.slice(0, 200)}`)
    }

    // 关系度
    systemLines.push(
      `与用户关系：${speaker.relationship.stage}（${speaker.relationship.score}/100）`,
    )
    // 情绪
    systemLines.push(`当前情绪：${speaker.emotion}`)
    // 位置动作
    systemLines.push(`当前位置：${speaker.position}，动作：${speaker.action}`)
  }

  systemLines.push('')
  systemLines.push('【其他在场角色（仅精简信息）】')
  systemLines.push('以下角色也在场景中，你只需知道他们的"存在感"，不要注入他们的完整人格设定。')
  systemLines.push('你可以和他们互动，但必须保持你自己的人设。')

  const others = allPresent.filter((c) => c.characterId !== speaker?.characterId).slice(0, maxOtherCharacters)
  if (others.length === 0) {
    systemLines.push('（当前没有其他在场角色）')
  } else {
    for (const other of others) {
      const personality = (other.profile?.personality as string[]) || []
      const oneLinePersonality = Array.isArray(personality) && personality.length ? personality.slice(0, 2).join('、') : '未定义'
      const status = other.buildStatusSummary()
      systemLines.push(`- ${other.characterName}：${oneLinePersonality}。当前状态：${status}`)
    }
  }

  // 3) Scene Event
  systemLines.push('')
  systemLines.push('【最近场景事件】')
  systemLines.push(`事件：${event.summary}`)
  systemLines.push(`类型：${event.type}`)

  // 4) 历史消息（已过滤）
  if (perception && perception.filteredHistoryText) {
    systemLines.push('')
    systemLines.push('【你能感知到的最近对话】（仅注入你在场时的发言）')
    systemLines.push(perception.filteredHistoryText)
  }

  // 5) 回复格式规则
  systemLines.push('')
  systemLines.push('【回复规则】')
  systemLines.push(`- 仅以「${speakerName}」的身份发言，不要替其他角色说话`)
  systemLines.push('- 如果其他角色也需要发言，使用以下格式：其他角色名：（动作）发言内容`)
  systemLines.push('- 动作描述放在括号 () 中，先动作再说话`)
  systemLines.push('- 不要提及你不可能知道的信息（如离场期间发生的事）`)
  systemLines.push('- 保持性格一致，不要 OOC`)

  const systemPrompt = systemLines.join('\n')

  // 6) 构造消息列表
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; name?: string }> = []
  messages.push({ role: 'system', content: systemPrompt })

  // 注入部分历史（最多 8 条，避免超长）
  const recent = (conversationSnapshot.messages || []).slice(-8)
  for (const m of recent) {
    // 仅注入当前发言者可见的消息
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      if (speaker && (m.witnessedBy.includes(speaker.characterId) || m.speakerId === speaker.characterId)) {
        messages.push({
          role: 'assistant',
          content: m.content,
          name: m.speakerName || undefined,
        })
      }
    }
  }

  // 最后一条用户消息（最新）
  messages.push({ role: 'user', content: userMessage })

  // 7) 估算 token（粗略：1 中文字 ≈ 2 token，1 英文词 ≈ 1 token）
  let estimatedTokens = 0
  for (const m of messages) {
    const text = m.content
    // 粗略：中文每个字算 2，英文每 5 字符算 1
    const chineseMatch = text.match(/[\u4e00-\u9fa5]/g) || []
    const chineseCount = chineseMatch.length
    const nonChinese = text.length - chineseCount
    estimatedTokens += chineseCount * 2 + Math.ceil(nonChinese / 4)
  }

  return {
    systemPrompt,
    messages,
    estimatedTokens,
    speakerName,
  }
}

/**
 * 构建 "其他角色精简信息" 片段（可用于上层拼接）
 */
export function buildOtherCharactersBrief(present: CharacterRuntime[], max = 3): string {
  const others = present.slice(1, max + 1)
  if (others.length === 0) return ''
  const lines: string[] = []
  for (const o of others) {
    const personality = (o.profile?.personality as string[]) || []
    const brief = Array.isArray(personality) && personality.length ? personality.slice(0, 2).join('、') : '未知'
    lines.push(`${o.characterName}（${brief}）`)
  }
  return lines.join('，')
}
