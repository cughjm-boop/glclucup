/**
 * ReplyPlan V2 — 回复计划（最终方案）
 *
 * 核心原则：Dispatcher 决定谁回复，不让 Prompt/AI 猜。
 *
 * 分配规则：
 *  1) 点名 A → 只有 A 进 mustReply（其余 silent）
 *     例：「三月七，昨天陪我们玩吗？」 → March7 MUST，其余 NO
 *     例：「@卡芙卡 你说呢？」         → Kafka MUST，其余 NO
 *  2) 泛问「大家 / 你们看 / 各位 / 所有人…」→ 全体进 optionalReply，按主动性 + 冷却选出 order
 *     例：「大家怎么看？」 → 所有人可选
 *  3) 场景/剧情事件 → 按事件责任人进 mustReply
 *  4) order：严格串行回复顺序（A→B→C→用户），不是所有人一起答
 *     order 只按 lastSpokeAt 升序 + 冷却/惩罚，避免一个人刷屏
 *
 * 角色之间聊天（支持）：
 *  - 上一条是 A 说话，且 A 直接提到 / 问 B → B 进 mustReply
 *  - 否则「听你说话」的旁观者进 optionalReply
 */

import type { ConversationRuntime, ReplyPlan } from './ConversationRuntime'
import type { GameEvent } from './EventTypes'
import { getCanonCharacter } from '../canon/CanonDatabase'

/** 「泛问」触发词（多人一起答） */
const OPEN_QUESTION_RE =
  /(大家|各位|所有人|全体|你们|你们都|大伙|大伙儿|每一个人|每个人|怎么看|觉得呢|意见呢|看法呢|想法呢)/i

/** 自动旁听：连续 3 分钟没人说话 → 非点名角色可以插一句自然旁白（不强制） */
const IDLE_SIDELINE_THRESHOLD_MS = 3 * 60 * 1000

/** 生成回复计划（V2 最终版） */
export function generateReplyPlan(
  runtime: ConversationRuntime,
  event: GameEvent,
  userMessage: string,
): ReplyPlan {
  const allIds = [...runtime.activeCharacters]
  let mustReply: string[] = []
  let optionalReply: string[] = []
  const silent: string[] = []

  const mentionTargetId = event.targetName ? findCharacterIdByName(runtime, event.targetName) : null
  const directMentionMatches = findAllMentions(userMessage, runtime)

  // ======== 自动旁听（M13）：判断是否「久未说话」开启旁白机会 ========
  // 3 分钟内没有用户消息 & 没有 AI 回复 → 视为 idle
  const now = Date.now()
  const userIdleMs = runtime.lastUserMessageAt ? now - runtime.lastUserMessageAt : Infinity
  const aiIdleMs = runtime.lastAiReplyAt ? now - runtime.lastAiReplyAt : Infinity
  const isIdleSession =
    userMessage.trim().length === 0 && // 不是用户主动发消息（场景 tick / 定时触发）
    (userIdleMs >= IDLE_SIDELINE_THRESHOLD_MS || aiIdleMs >= IDLE_SIDELINE_THRESHOLD_MS)

  // 🔴🔴🔴 高优先级 0：严格召唤 / 离场事件（CharacterEnter / CharacterLeave）
  // 只有该角色自己能说话，其他角色一律 silent（禁止流萤替三月七说话 / 其他角色抢话）
  if ((event.type === 'CharacterEnter' || event.type === 'CharacterLeave') && mentionTargetId) {
    mustReply = [mentionTargetId]
    for (const id of allIds) {
      if (id !== mentionTargetId) silent.push(id)
    }
    return {
      mustReply,
      optionalReply: [],
      silent,
      order: mustReply,
      _hardEventLock: {
        event: event.type,
        exclusiveCharacterId: mentionTargetId,
      },
    } as ReplyPlan & { _hardEventLock?: unknown }
  }

  // ① 最高优先级：显式点名（message 里直接 @ + 名字）
  if (directMentionMatches.length > 0) {
    mustReply = dedupe(directMentionMatches)
  }
  // ② 事件责任点名（Mention / CharacterEnter）
  else if (mentionTargetId && !mustReply.includes(mentionTargetId)) {
    mustReply = [mentionTargetId]
  }

  // ③ 泛问「大家/各位/你们怎么看」 → 不在 mustReply 的全部进 optional
  const isOpenQuestion = OPEN_QUESTION_RE.test(userMessage || '')

  const rest = allIds.filter((id) => !mustReply.includes(id))

  // 角色间聊天：如果上一条说话人 A 直接问了另一个人 B，B 进 mustReply
  const interjectionTarget = getPreviousSpeakerTarget(runtime)
  if (interjectionTarget && !mustReply.includes(interjectionTarget) && allIds.includes(interjectionTarget)) {
    if (rest.includes(interjectionTarget)) {
      // 角色之间的直接问句，把 B 提到 mustReply
      mustReply.push(interjectionTarget)
      const idx = rest.indexOf(interjectionTarget)
      if (idx >= 0) rest.splice(idx, 1)
    }
  }

  // ④ 其他角色：按 openQuestion / 主动性 / 冷却分 optional 或 silent
  // score：越高越优先回复
  const scored = rest.map((id) => {
    const cr = runtime.characterRuntime[id]
    if (!cr) return { id, score: -1 }
    let score = cr.initiative * 0.4 + cr.presence * 0.3

    // 冷却中 → 降低（连发言惩罚）
    if (cr.cooldown > 0) score -= cr.cooldown * 15
    // 30 秒内发过言 → 明显降低（避免一个角色刷屏）
    if (cr.lastSpokeAt > 0 && Date.now() - cr.lastSpokeAt < 30_000) {
      score -= 30
    }
    // 15 秒内发过言 → 更大惩罚（「连续发言」防刷屏）
    if (cr.lastSpokeAt > 0 && Date.now() - cr.lastSpokeAt < 15_000) {
      score -= 60
    }
    // 发言次数：越多次越降权（公平轮换）
    score -= Math.min(30, cr.speakCount * 3)

    // 话题相关性：消息中出现角色名、武器、人设关键词 → +分
    score += computeTopicRelevanceBoost(cr, userMessage, event)

    // 上一条是某角色说话，其他人如和该角色有好友/CP 关系 → 轻微加（让角色之间聊天不冷场）
    score += interjectionBoostFromPreviousSpeaker(runtime, cr.characterId)

    // ======== 自动旁听（M13）：idle 状态下，给久未说话的旁观者一个温和加分 ========
    // 让她有机会插一句「（笑）你们聊得真开心。」 这种自然旁白，不强制。
    if (isIdleSession) {
      // 越久没说话、越主动 → 加越多
      const sinceLastSpeak = cr.lastSpokeAt > 0 ? Date.now() - cr.lastSpokeAt : 10 * 60 * 1000
      if (sinceLastSpeak >= 2 * 60 * 1000) {
        score += Math.min(25, sinceLastSpeak / 12_000) // 最多 +25
      }
      // 位置相同（同房间的人更容易旁听）
      const sceneLoc = runtime.scene.location
      if (sceneLoc && cr.position && cr.position.includes(sceneLoc)) {
        score += 8
      }
    }

    return { id, score: Math.max(-100, Math.min(100, score)) }
  })

  scored.sort((a, b) => b.score - a.score)

  // 分配 optional / silent
  //  - 泛问：可选 = 所有 score>20 的（最多 3 个轮次）
  //  - 有明确点名：可选最多 1 个（「旁听+附和」，score≥45 才进，避免抢话）
  //  - 自动旁听 idle：放宽到最多 2 个 + score≥0，允许非点名角色插一句自然旁白（不强制）
  const maxOptional = isIdleSession
    ? 2
    : isOpenQuestion
      ? 3
      : mustReply.length >= 1
        ? 1
        : 2
  let assigned = 0
  for (const s of scored) {
    if (s.score < 0 && !isIdleSession) {
      silent.push(s.id)
      continue
    }
    const threshold = isIdleSession
      ? 0
      : mustReply.length >= 1 && !isOpenQuestion
        ? 45
        : 20
    if (s.score >= threshold && assigned < maxOptional) {
      optionalReply.push(s.id)
      assigned++
    } else {
      silent.push(s.id)
    }
  }

  // ⑤ order：串行回复顺序（mustReply 按消息中出现顺序 → optional 按 lastSpokeAt 早→晚 + 积分高→低）
  // 目的：避免「所有人一起答」，变成 A→B→C→用户
  const order: string[] = []
  const pushUnique = (id: string) => {
    if (!order.includes(id)) order.push(id)
  }

  // mustReply 保持消息里点名出现的顺序（dedupe 已保证 unique）
  mustReply.forEach(pushUnique)

  // optional：按 lastSpokeAt 升序（越久没说越先排）
  const orderedOptional = [...optionalReply].sort((aId, bId) => {
    const a = runtime.characterRuntime[aId]
    const b = runtime.characterRuntime[bId]
    if (!a || !b) return 0
    // 长久没说 → 先排；如果都没说过（0），按 score 降序
    if (a.lastSpokeAt === b.lastSpokeAt) {
      const sa = scored.find((s) => s.id === aId)?.score ?? 0
      const sb = scored.find((s) => s.id === bId)?.score ?? 0
      return sb - sa
    }
    return a.lastSpokeAt - b.lastSpokeAt
  })
  orderedOptional.forEach(pushUnique)

  // 清理：silent 不应出现在 mustReply/optional 里（防御）
  const cleanSilent = silent.filter(
    (id) => !mustReply.includes(id) && !optionalReply.includes(id),
  )

  return { mustReply, optionalReply, silent: cleanSilent, order }
}

/** 用 ReplyPlan 生成 Prompt 指令文本（更明确、更严格） */
export function buildReplyPlanInstruction(plan: ReplyPlan, runtime: ConversationRuntime): string {
  const lines: string[] = []

  lines.push(
    '═══════════════════════════════════════════════\n' +
      '【回复调度 — 硬性指令（Dispatcher 已决定，AI 不得更改）】\n' +
      '═══════════════════════════════════════════════',
  )
  lines.push('下面的角色分工是已经由程序决定的最终结果，你必须严格遵守，不得自行增加/删除发言人：')
  lines.push('【禁令】绝对禁止"主角色（通常是默认的第一个人）代替被点名角色说话"。如果用户问的是三月七，必须由三月七自己回答，流萤/卡芙卡不能替她说话。')

  // 🔴 召唤 / 离场硬锁：只有 X 一人发言，其余包括主角色在内一律沉默
  const exclusiveId = plan.mustReply.length === 1 && plan.optionalReply.length === 0 ? plan.mustReply[0] : null
  const exclusiveName = exclusiveId ? runtime.characterRuntime[exclusiveId]?.characterName || null : null
  if (exclusiveName && plan.silent.length >= 0) {
    const evtGuess = runtime.messages?.length
      ? runtime.messages[runtime.messages.length - 1]?.content || ''
      : ''
    const isEnterOrLeave = /加入了聊天|离开了|加入了对话/.test(evtGuess)
    if (isEnterOrLeave || (plan as any)._hardEventLock) {
      lines.push(`\n🔒 【强事件锁定】本轮只有【${exclusiveName}】一个人可以说话。`)
      lines.push(`  - 其他所有角色（包括主要角色在内）必须完全保持沉默，不要出声，不要抢话，不要代答。`)
      lines.push(`  - 即便你觉得主要角色应该附和，也不要让她说话，保持安静即可。`)
    }
  }

  if (plan.mustReply.length) {
    const names = plan.mustReply
      .map((id) => runtime.characterRuntime[id]?.characterName || id)
      .filter(Boolean)
    lines.push(`\n【必须回复】：${names.join('、')}`)
    lines.push('  - 只有这些角色被点名 / 需要对事件负责，必须出声回复。')
    lines.push('  - 非被点名的角色，除非被明确列入【可以回复】，否则不要说话。')
  }

  if (plan.optionalReply.length) {
    const names = plan.optionalReply
      .map((id) => runtime.characterRuntime[id]?.characterName || id)
      .filter(Boolean)
    lines.push(`\n【可以回复】：${names.join('、')}`)
    lines.push('  - 这些角色可以简短附和/补一句（1 句就好），也可以保持沉默，看氛围。')
    lines.push('  - 如果没什么好加的，宁愿不说，不要为了说话而说话。')
  }

  if (plan.silent.length) {
    const names = plan.silent
      .map((id) => runtime.characterRuntime[id]?.characterName || id)
      .filter(Boolean)
    lines.push(`\n【保持沉默】：${names.join('、')}`)
    lines.push('  - 这些角色本轮完全不要说话，不要出声。')
    lines.push('  - 即使心里有想法，也不要让他们冒出来，让被点名的角色先答。')
  }

  if (plan.order && plan.order.length > 1) {
    const ordered = plan.order
      .map((id) => runtime.characterRuntime[id]?.characterName || id)
      .filter(Boolean)
    lines.push(`\n【回复顺序（串行）】：${ordered.join(' → ')} → 用户`)
    lines.push('  - 按这个顺序一个接一个，不要所有人同时回答。')
    lines.push('  - 每个角色 1 轮说完即结束，不要互相追着问下去造成刷屏。')
  }

  lines.push(
    '\n═══════════════════════════════════════════════',
  )
  return lines.join('\n')
}

/** 从消息中提取所有被 @ + 名字 / 名字开头逗号「三月七，...」 点名 —— 返回 characterId 列表（按出现顺序） */
function findAllMentions(msg: string, runtime: ConversationRuntime): string[] {
  if (!msg) return []
  const ids: string[] = []
  const pushed = new Set<string>()
  const chars = Object.values(runtime.characterRuntime)

  const pushId = (id: string) => {
    if (!id || pushed.has(id)) return
    pushed.add(id)
    ids.push(id)
  }

  // 模式 1：「三月七，...」 / 「知更鸟：...」（名字 + 冒号/逗号/顿号/问号开头）
  for (const cr of chars) {
    if (!cr?.characterName) continue
    const name = cr.characterName
    const reHead = new RegExp(`^(\\s*[@]?\\s*${escapeReg(name)}\\s*[,，:：?？])`)
    if (reHead.test(msg)) pushId(cr.characterId)
  }

  // 模式 2：消息任意位置「三月七你 / 卡芙卡说 / @知更鸟...」
  for (const cr of chars) {
    if (!cr?.characterName) continue
    const name = cr.characterName
    const reBody = new RegExp(
      `[@＠]?\\s*${escapeReg(name)}\\s*(你|您|说|觉得|看|呢|吗|回答|怎么|的话)`,
      'u',
    )
    if (reBody.test(msg)) pushId(cr.characterId)
  }

  // 模式 3：消息结尾问某角色「，对吧三月七？」/「，是不是卡芙卡？」
  for (const cr of chars) {
    if (!cr?.characterName) continue
    const name = cr.characterName
    const reTail = new RegExp(
      `[,，]\\s*(对吧|对吗|是不是|你说呢|你觉得呢|对不对|是吗)\\s*${escapeReg(name)}[?？。.]?$|` +
        `${escapeReg(name)}(对吧|对吗|是不是|你说呢|你觉得呢|对不对|是吗)[?？]?$`,
      'u',
    )
    if (reTail.test(msg)) pushId(cr.characterId)
  }

  return ids
}

/** 上一条说话人直接问另一个在场角色 → 返回被问角色 id（支持角色间对话） */
function getPreviousSpeakerTarget(runtime: ConversationRuntime): string | null {
  const msgs = runtime.messages
  if (!msgs || msgs.length === 0) return null
  // 找倒数最近一条 assistant 消息
  let lastAi: any = null
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role === 'assistant' && m.content && m.content.trim()) {
      lastAi = m
      break
    }
  }
  if (!lastAi) return null
  const names = Object.values(runtime.characterRuntime).map((c) => c.characterName).filter(Boolean)
  // 上一条里出现了「X 你 / 问 X」且 X 不是说话人本身
  for (const name of names) {
    if (lastAi.speakerName && lastAi.speakerName === name) continue
    const re = new RegExp(`${escapeReg(name)}[,，:：]?\\s*(你|说|怎么|回答|觉得)`)
    if (re.test(lastAi.content || '')) {
      const id = findCharacterIdByName(runtime, name)
      if (id) return id
    }
  }
  return null
}

/** 上一条说话人是同一人的好友 / CP → 轻微加，鼓励角色互相对话（不强制） */
function interjectionBoostFromPreviousSpeaker(runtime: ConversationRuntime, meId: string): number {
  try {
    const msgs = runtime.messages
    if (!msgs || msgs.length === 0) return 0
    let lastId: string | null = null
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.role === 'assistant' && m.speakerId) {
        lastId = m.speakerId
        break
      }
    }
    if (!lastId || lastId === meId) return 0
    // 简化：只要上一个是另一个 AI，给「附和一句」友好 boost 3 分
    return 3
  } catch {
    return 0
  }
}

/** 查找角色 ID（按名字匹配） */
function findCharacterIdByName(runtime: ConversationRuntime, name: string): string | null {
  // 精确匹配
  for (const [id, cr] of Object.entries(runtime.characterRuntime)) {
    if (cr.characterName === name) return id
  }
  // 模糊
  for (const [id, cr] of Object.entries(runtime.characterRuntime)) {
    if (cr.characterName.includes(name) || name.includes(cr.characterName)) return id
  }
  // 如果名字本身就是 ID
  if (runtime.activeCharacters.includes(name)) return name
  return null
}

/** 话题相关性加分（合并原 computeTopicRelevanceBoost + 话题相关性格关键词） */
function computeTopicRelevanceBoost(cr: any, msg: string, event: GameEvent): number {
  if (!msg) return 0
  let score = 0
  if (msg.includes(cr.characterName)) score += 20
  if (event.targetName && event.targetName === cr.characterName) score += 20
  const canon = getCanonCharacter(cr.characterName)
  if (canon?.personality) {
    for (const kw of canon.personality) {
      if (msg.includes(kw)) score += 8
    }
  }
  if (Array.isArray(canon?.tags)) {
    for (const kw of canon.tags) {
      if (msg.includes(kw)) score += 6
    }
  }
  return Math.min(30, score)
}

function dedupe<T>(arr: T[]): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const x of arr) {
    if (seen.has(x)) continue
    seen.add(x)
    out.push(x)
  }
  return out
}

function escapeReg(s: string): string {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
