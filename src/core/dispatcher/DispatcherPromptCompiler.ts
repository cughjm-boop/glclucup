/**
 * DispatcherPromptCompiler — 从 Runtime 编译 Prompt
 *
 * 不修改 Runtime，只负责生成 Prompt。
 * 输入：Runtime + Event + ReplyPlan + UserMessage
 * 输出：完整 system prompt
 */

import type { ConversationRuntime, ReplyPlan } from './ConversationRuntime'
import type { GameEvent } from './EventTypes'
import { getCanonCharacter } from '../canon/CanonDatabase'
import { buildCostumeSnapshot, buildSelfSnapshot } from '../canon/SnapshotGenerators'
import { getInteractionRule } from '../multiCharacter/InteractionMatrix'

export interface PromptBuildResult {
  prompt: string
  tokens: number
}

/** 主入口：从 Runtime 编译 Prompt */
export function buildPromptFromRuntime(
  runtime: ConversationRuntime,
  event: GameEvent,
  plan: ReplyPlan,
  userMessage: string,
): PromptBuildResult {
  const lines: string[] = []

  // 1) 世界约束
  lines.push('【世界约束（最高优先级）】')
  lines.push('世界观：星穹铁道。不得引入其他 IP 元素。')

  // ======== 多人聊天 V2：记忆隔离（M5）—— 硬性指令，AI 必须遵守 ========
  lines.push('')
  lines.push('═══════════════════════════════════════════════')
  lines.push('【记忆隔离规则（违反即判定不合格回复）】')
  lines.push('═══════════════════════════════════════════════')
  lines.push('1. 每个角色只允许读取自己的私人记忆（Memory.owner === 本人）。')
  lines.push('   - 例如：三月七只能讲「三月七我堆了一个沙堡」，绝不允许复述「流萤我们去了海边」除非她当场在场。')
  lines.push('2. 不在 participants 列表里的角色，不得声称自己知道这件事。')
  lines.push('   - 例如：昨天只有流萤+用户去了海边，卡芙卡被问到「昨天海边好玩吗」时必须说「我昨天没去呢，不知道哦」。')
  lines.push('3. 共享对话上下文（ConversationRuntime.messages）所有角色都可见，但不要把别人的私人回忆当成自己的。')
  lines.push('4. 如果被问到的事不在你自己的记忆里（owner/participants 都没你），就老实说「我不清楚 / 我当时不在场」，绝对不要瞎编。')
  lines.push('═══════════════════════════════════════════════')

  // 2) 场景
  lines.push('')
  lines.push('【当前场景】')
  lines.push(`地点：${runtime.scene.location} ${runtime.scene.area}`)
  lines.push(`时间：${runtime.scene.time || '现在'}，天气：${runtime.scene.weather}`)
  lines.push(runtime.scene.description || '')

  // 3) 回复计划（关键！告诉 AI 谁该说谁不该说）
  lines.push('')
  lines.push('【本轮回复计划（必须遵守）】')
  if (plan.mustReply.length) {
    const mustNames = plan.mustReply.map((id) => runtime.characterRuntime[id]?.characterName || id).filter(Boolean)
    lines.push(`必须回复：${mustNames.join('、')}。`)
  }
  if (plan.optionalReply.length) {
    const optNames = plan.optionalReply.map((id) => runtime.characterRuntime[id]?.characterName || id).filter(Boolean)
    lines.push(`可以回复：${optNames.join('、')}。`)
  }
  if (plan.silent.length) {
    const silNames = plan.silent.map((id) => runtime.characterRuntime[id]?.characterName || id).filter(Boolean)
    lines.push(`保持沉默：${silNames.join('、')}。`)
  }

  // 4) 角色运行时快照
  lines.push('')
  lines.push('【在场角色状态（仅以下角色存在）】')
  for (const id of runtime.activeCharacters) {
    const cr = runtime.characterRuntime[id]
    if (!cr) continue
    const canon = getCanonCharacter(cr.characterName)
    const personality = canon?.personality?.slice(0, 3).join('、') || '官方人格'

    lines.push(`---`)
    lines.push(`名字：${cr.characterName}`)
    lines.push(`身份：${canon?.identity || '未知'}`)
    lines.push(`性格：${personality}`)
    lines.push(`位置：${cr.position}`)
    lines.push(`动作：${cr.action}`)
    lines.push(`情绪：${cr.emotion}`)
    lines.push(`服装：${cr.costume}`)
    lines.push(`发型：${cr.hairstyle}`)
    lines.push(`武器：${cr.weapon}`)
    lines.push(`主动性：${cr.initiative}`)
  }

  // 5) 互动关系
  if (runtime.activeCharacters.length > 1) {
    lines.push('')
    lines.push('【角色互动关系（参考）】')
    for (let i = 0; i < runtime.activeCharacters.length; i++) {
      for (let j = i + 1; j < runtime.activeCharacters.length; j++) {
        const a = runtime.characterRuntime[runtime.activeCharacters[i]]
        const b = runtime.characterRuntime[runtime.activeCharacters[j]]
        if (!a || !b) continue
        const rule = getInteractionRule(a.characterName, b.characterName)
        if (rule && rule.frequency >= 50) {
          lines.push(`${a.characterName} ↔ ${b.characterName}：${rule.description}`)
        }
      }
    }
  }

  // 6) 事件上下文
  lines.push('')
  lines.push('【当前事件】')
  lines.push(`类型：${event.type}`)
  lines.push(`目标：${event.targetName || '无'}`)
  lines.push(`描述：${event.summary}`)

  // 7) 回复格式规则
  lines.push('')
  lines.push('【回复格式】')
  lines.push('- 按 ReplyPlan 指定的角色发言，其他角色保持沉默。')
  lines.push('- 多角色对话格式：角色名：（动作）发言内容')
  lines.push('- 使用第一人称"我"，不要第三人称百科描述。')
  lines.push('- 严格遵守官方设定（武器/能力/人格/服装）。')
  lines.push('- 不要让角色做出不符合官方设定的行为。')

  // 8) 历史上下文（最近 10 条）
  const recent = runtime.messages.filter((m) => m.role !== 'system').slice(-10)
  if (recent.length) {
    lines.push('')
    lines.push('【最近对话】')
    for (const m of recent) {
      const tag = m.speakerName ? `[${m.speakerName}]` : m.role === 'user' ? '[用户]' : '[系统]'
      lines.push(`${tag}: ${m.content}`)
    }
  }

  const prompt = lines.join('\n')
  const chineseMatch = prompt.match(/[\u4e00-\u9fa5]/g) || []
  const tokens = chineseMatch.length * 2 + Math.ceil(prompt.length / 10)

  return { prompt, tokens }
}
