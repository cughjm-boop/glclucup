/**
 * 记忆提取服务 — 三层记忆金字塔架构
 * 从外部聊天记录中自动提取记忆，按核心档案/情感精华/日常琐事分类
 * 强制分析规则：事实 vs 玩笑区分、官方设定冲突检测
 */

import { loadFromStorage, STORAGE_KEYS } from './storage'
import { recordCost } from './costTracker'
import { getAllCharacters } from './characterDataService'

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

async function httpPost(url, bodyJson, headers) {
  if (window.HttpProxy && typeof window.HttpProxy.post === 'function') {
    try {
      const rawResult = window.HttpProxy.post(url, bodyJson, JSON.stringify(headers))
      const result = JSON.parse(rawResult)
      if (!result.ok) throw new Error(result.error || `HTTP ${result.status}`)
      return result
    } catch (e) {
      console.warn('[MemoryExtractor] 原生代理失败，降级 fetch:', e.message)
    }
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: bodyJson,
  })
  if (!response.ok) throw new Error(await response.text().catch(() => `HTTP ${response.status}`))
  return { status: response.status, body: await response.text(), ok: true }
}

async function callLLM(messages, temperature = 0.3, maxTokens = 1024) {
  const settings = loadFromStorage(STORAGE_KEYS.SETTINGS) || {}
  const apiKey = settings.apiKey
  if (!apiKey) throw new Error('API Key 未设置')

  const baseUrl = settings.baseUrl || DEFAULT_BASE_URL
  const modelName = settings.modelName || DEFAULT_MODEL
  const apiEndpoint = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/v1`
  const url = `${apiEndpoint}/chat/completions`

  const bodyJson = JSON.stringify({ model: modelName, messages, temperature, max_tokens: maxTokens, stream: false })
  const result = await httpPost(url, bodyJson, { 'Authorization': `Bearer ${apiKey}` })

  const data = JSON.parse(result.body)
  const reply = data.choices?.[0]?.message?.content
  if (!reply) throw new Error(data.error?.message || '空回复')
  return reply
}

function extractJSON(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}') + 1
  if (start === -1 || end <= start) return null
  try { return JSON.parse(text.substring(start, end)) } catch { return null }
}

// ============= 官方设定冲突检测 =============

/**
 * 检查记忆内容是否与官方角色设定冲突
 * @param {string} content - 记忆内容
 * @param {string} characterName - 角色名称（可选）
 * @returns {{ conflict: boolean, reason: string }}
 */
export function checkOfficialConflict(content, characterName) {
  const lower = content.toLowerCase()
  const allChars = getAllCharacters().characters

  for (const c of allChars) {
    if (!c.identity) continue

    // 检查是否否定了官方身份
    const idLower = c.identity.toLowerCase()
    const negations = [`不是${idLower}`, `不${idLower}`, `不再${idLower}`]
    if (negations.some((n) => lower.includes(n))) {
      return { conflict: true, reason: `与官方设定冲突：否定角色身份"${c.identity}"` }
    }

    // 检查是否声称了其他角色的身份
    if (lower.includes('身份') || lower.includes('是') || lower.includes('变成') || lower.includes('成为')) {
      for (const other of allChars) {
        if (other.name !== c.name && other.identity && lower.includes(other.identity.toLowerCase())) {
          // 检查是否声称了其他角色的身份
          if (lower.includes(other.identity.toLowerCase())) {
            return { conflict: true, reason: `与官方设定冲突：声称了"${other.name}"的身份（${other.identity}）` }
          }
        }
      }
    }

    // 检查性格冲突
    if (c.personality) {
      for (const trait of c.personality) {
        const traitLower = trait.toLowerCase()
        const traitNegations = [`不是${traitLower}`, `不${traitLower}`, `不再${traitLower}`, `改掉${traitLower}`, `变得不${traitLower}`]
        if (traitNegations.some((neg) => lower.includes(neg))) {
          return { conflict: true, reason: `与官方设定冲突：否定角色性格特质"${trait}"` }
        }
      }
    }
  }

  return { conflict: false, reason: '' }
}

// ============= 累积摘要结构 =============

const EMPTY_CUMULATIVE = {
  people: [],
  events: [],
  personality: '',
  questions: [],
}

// ============= 分段提取（三层分类） =============

/**
 * 对一个文本片段进行三层记忆提取
 * @param {string} chunkText - 当前段文本
 * @param {Object} cumulativeSummary - 上一段的累积摘要
 * @param {boolean} isFirst - 是否是第一段
 * @param {string} characterName - 角色名称（用于冲突检测）
 * @returns {Promise<{memories: Array, cumulative: Object}>}
 */
async function extractChunk(chunkText, cumulativeSummary, isFirst, characterName) {
  const cumulativeStr = isFirst
    ? '（这是第一段，没有之前的累积摘要）'
    : JSON.stringify(cumulativeSummary, null, 2)

  const prompt = `你是一个专业的记忆提取助手。请从以下对话记录中提取关键信息，并按三层记忆架构分类。

=== 之前段落的累积摘要 ===
${cumulativeStr}

=== 当前段对话内容 ===
${chunkText}

请以 JSON 格式输出提取结果。每条记忆必须打上三层分类标签：

{
  "memories": [
    {
      "tier": "core",
      "content": "具体的记忆内容，以\"用户\"或\"我们\"开头",
      "subCategory": "个人信息|关系|资产",
      "confidence": "高|中|低"
    },
    {
      "tier": "emotional",
      "content": "具体的事件或感受描述",
      "subCategory": "第一次|最时刻|困难与鼓励|最喜欢",
      "confidence": "高|中|低"
    },
    {
      "tier": "daily",
      "content": "日常话题摘要",
      "confidence": "高|中|低"
    }
  ],
  "cumulative": {
    "people": ["本段+之前提到的人物名称列表"],
    "events": ["本段+之前的重要事件列表，包含时间"],
    "personality": "基于所有已处理段落的用户性格初步判断（可更新）",
    "questions": ["尚未解决的疑问，后续段落可能补充"]
  }
}

【三层分类标准】

一、核心档案（tier: "core"）— 永久锁定，不可自动删除
提取标准：用户的明确个人信息、与角色的关系定义、共同拥有的资产。
- 个人信息（subCategory: "个人信息"）：姓名、年龄、职业、重要喜好/忌口、过敏信息
- 关系（subCategory: "关系"）：与角色的关系定义（如伴侣/挚友/朋友）
- 资产（subCategory: "资产"）：共同拥有的房子、宠物等

二、情感精华（tier: "emotional"）— 永久保留，不可自动删除
提取标准：标记为"第一次"、"最"、"转折点"、"困难时期的鼓励"的事件。
- 第一次（subCategory: "第一次"）：第一次见面/牵手/表白/旅行/约会等
- 最时刻（subCategory: "最时刻"）：最幸福/害羞/感动/相爱/困难/难忘的时刻
- 困难与鼓励（subCategory: "困难与鼓励"）：低谷时期的陪伴、重要的承诺与约定
- 最喜欢（subCategory: "最喜欢"）：最喜欢的事物/地方/活动/回忆

三、日常琐事（tier: "daily"）— 可自动清理归档
提取标准：所有不符合核心档案和情感精华标准的其他对话。
- 日常问候、闲聊、吐槽、吃喝玩乐等
- 用一句话概括即可，多条相似内容合并为一条

【核心判断规则：事实 vs 非事实】
以下类型的表达绝对不能提取（非事实性）：
- 玩笑/假设："我这么瘦，是当长跑运动员的料吧？"、"那我岂不是天才？"
- 比喻/夸张："累得我像刚跑完马拉松。"、"我忙得像陀螺一样。"
- 虚拟语气："如果我是程序员就好了。"、"要是能中彩票我就辞职。"
- 不确定的未来："明天我可能会去相亲。"、"也许以后会养只猫。"
- 反问/调侃："我是不是很厉害？"、"你觉得我聪明吗？"
- 自嘲/自谦："我这脑子，啥也记不住。"、"我就一个打杂的。"

以下类型的表达应该提取（事实性）：
- 明确声明："我叫家宇"、"我是程序员"、"我今年25岁"
- 共同资产："我们养了一只猫叫团子"、"我们一起买了房子"
- 确切偏好："我喜欢吃辣"、"我讨厌香菜"、"我对花生过敏"
- 明确关系："我是你的恋人"、"我们是朋友"
- 真实经历："我昨天去了医院"、"我上周参加了面试"

判定标准：如果无法明确区分事实还是玩笑，则暂不处理，不提取。

【角色信息冲突检测】
- 如果对话中涉及角色自身的描述（如"流萤变得大胆了"、"流萤不再是星核猎手了"），不要提取，这些属于潜在冲突内容。
- 角色信息类（关于角色自己的身份、性格、能力描述）一律归入"被丢弃"类别，不要提取到核心档案中。

【提取规则】
1. 只提取确定的信息，不要推测
2. 每条记忆用简洁的一句话描述
3. 不要提取临时、一次性的信息
4. 如果对话涉及多人，都记录到 people 列表
5. 重要事件（如旅行、考试、搬家等）记录到 events 列表
6. personality 字段随着段落增多可以更新
7. 输出必须是严格的 JSON 格式，不要包含任何额外文本

请直接输出 JSON：`

  const reply = await callLLM([
    { role: 'system', content: '你是精确的记忆提取助手。输出必须是标准 JSON 格式。严格按照三层分类（核心档案/情感精华/日常琐事）提取，遵循事实vs玩笑判断规则。' },
    { role: 'user', content: prompt },
  ], 0.3, 1024)

  recordCost(prompt, reply, 'memoryExtraction')

  const parsed = extractJSON(reply)
  if (!parsed) {
    return { memories: [], cumulative: cumulativeSummary }
  }

  return {
    memories: (parsed.memories || []).filter((m) => m.content && m.content.trim().length > 2),
    cumulative: parsed.cumulative || cumulativeSummary,
  }
}

// ============= 最终汇总：三层分类输出 + 冲突检测 =============

/**
 * 最终汇总：基于所有记忆生成三层结构化输出
 * @param {Array} allMemories - 所有提取的记忆条目
 * @param {Object} cumulativeSummary - 最终累积摘要
 * @param {string} characterName - 角色名称（用于冲突检测）
 * @returns {Promise<Object>} { core: [], emotional: [], daily: [], discarded: [], systemMessage, stats }
 */
async function finalizeMemories(allMemories, cumulativeSummary, characterName) {
  const memoryStr = allMemories.map((m) =>
    `[${m.tier || 'daily'}] ${m.subCategory ? `(${m.subCategory}) ` : ''}${m.content} (置信度: ${m.confidence || '中'})`
  ).join('\n')

  const summaryStr = JSON.stringify(cumulativeSummary, null, 2)

  const prompt = `你是一个专业的用户画像分析助手。请基于以下所有提取的记忆，进行三层分类整理和冲突检测。

=== 所有记忆条目 ===
${memoryStr}

=== 累积摘要 ===
${summaryStr}

请以 JSON 格式输出：

{
  "core": [
    { "content": "具体内容", "subCategory": "个人信息|关系|资产" }
  ],
  "emotional": [
    { "content": "具体内容", "subCategory": "第一次|最时刻|困难与鼓励|最喜欢" }
  ],
  "daily": [
    { "content": "日常话题摘要" }
  ],
  "discarded": [
    { "content": "被丢弃的内容", "reason": "丢弃原因（如：与官方设定冲突/非事实性表达/信息不足）" }
  ],
  "systemMessage": "一条总结性消息，角色对用户说'我已记住我们的过去...'"
}

【三层分类标准】

核心档案（core）：用户的明确个人信息（姓名、年龄、职业、重要喜好/忌口）、与角色的关系定义（如伴侣/挚友）、共同拥有的资产（房子、宠物等）。
- 必须是有明确声明的事实性个人信息
- 不能是玩笑、比喻、假设

情感精华（emotional）：标记为"第一次"、"最"、"转折点"、"困难时期的鼓励"的事件。
- 第一次见面/牵手/表白/旅行/约会
- 最幸福/害羞/感动/相爱/困难/难忘的时刻
- 低谷时期的陪伴、重要的承诺与约定
- 最喜欢的事物/地方/活动/回忆

日常琐事（daily）：所有不符合核心档案和情感精华标准的其他对话。
- 日常问候、闲聊、吐槽、吃喝玩乐
- 用一句话概括，多条相似内容合并

被丢弃（discarded）：
- 与角色官方设定冲突的内容（如声称角色性格改变、身份不符）
- 非事实性表达（玩笑、比喻、假设、虚拟语气）
- 信息不足无法判断的内容

【冲突检测规则】
${characterName ? `当前角色是"${characterName}"。如果提取的记忆中涉及"${characterName}"的性格、身份、能力等描述，必须与官方设定保持一致。\n` : ''}
- 任何声称角色性格改变的内容（如"X变得大胆了"、"X不再是XX了"）→ 丢弃
- 任何否定角色身份的内容 → 丢弃
- 任何声称角色是另一个人身份的内容 → 丢弃

【提取规则】
1. 输出必须是严格的 JSON 格式
2. 所有字段尽量填写，无信息则留空数组
3. systemMessage 要温暖自然，体现角色已了解用户，不超过100字
4. 每条记忆的 content 必须简洁明确

请直接输出 JSON：`

  const reply = await callLLM([
    { role: 'system', content: '你是专业的记忆分类整理助手。输出必须是标准 JSON 格式。严格按照三层分类标准整理，检测并丢弃冲突内容。' },
    { role: 'user', content: prompt },
  ], 0.3, 1536)

  recordCost(prompt, reply, 'memoryFinalize')

  const parsed = extractJSON(reply)
  if (!parsed) {
    return { core: [], emotional: [], daily: [], discarded: [], systemMessage: '', stats: { core: 0, emotional: 0, daily: 0, discarded: 0 } }
  }

  return {
    core: parsed.core || [],
    emotional: parsed.emotional || [],
    daily: parsed.daily || [],
    discarded: parsed.discarded || [],
    systemMessage: parsed.systemMessage || '',
    stats: {
      core: (parsed.core || []).length,
      emotional: (parsed.emotional || []).length,
      daily: (parsed.daily || []).length,
      discarded: (parsed.discarded || []).length,
    },
  }
}

// ============= 主入口 =============

/**
 * 主入口：从聊天记录中完整提取记忆（三层架构版本）
 * @param {string} rawText - 完整聊天记录文本
 * @param {Object} character - 角色对象（用于冲突检测）
 * @param {Function} onProgress - 进度回调 ({ current, total, step, memories })
 * @param {AbortSignal} signal - 取消信号
 * @returns {Promise<{core: Array, emotional: Array, daily: Array, discarded: Array, systemMessage: string, stats: Object}>}
 */
export async function extractMemoriesFromChatLog(rawText, character, onProgress, signal) {
  const { chunkText } = await import('./chatLogParser')
  const chunks = chunkText(rawText, 3000)

  if (chunks.length === 0) {
    throw new Error('文本为空，无法提取记忆')
  }

  const characterName = character?.name || ''

  let cumulativeSummary = { ...EMPTY_CUMULATIVE }
  let allMemories = []

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) {
      throw new Error('导入已取消')
    }

    onProgress?.({ current: i + 1, total: chunks.length, step: 'extracting', memories: allMemories.length })

    const result = await extractChunk(chunks[i], cumulativeSummary, i === 0, characterName)
    cumulativeSummary = result.cumulative

    // 去重合并
    for (const mem of result.memories) {
      const exists = allMemories.some((m) =>
        m.content.toLowerCase() === mem.content.toLowerCase() &&
        m.tier === mem.tier
      )
      if (!exists) {
        allMemories.push(mem)
      }
    }
  }

  if (signal?.aborted) {
    throw new Error('导入已取消')
  }

  onProgress?.({ current: chunks.length, total: chunks.length, step: 'finalizing', memories: allMemories.length })

  // 最终汇总：三层分类 + 冲突检测
  const finalResult = await finalizeMemories(allMemories, cumulativeSummary, characterName)

  return {
    core: finalResult.core || [],
    emotional: finalResult.emotional || [],
    daily: finalResult.daily || [],
    discarded: finalResult.discarded || [],
    systemMessage: finalResult.systemMessage || '',
    stats: finalResult.stats || { core: 0, emotional: 0, daily: 0, discarded: 0 },
    totalMessages: allMemories.length,
  }
}

// ============= 成本估算 =============

/**
 * 估算导入的 token 消耗
 */
export function estimateImportCost(rawText) {
  const chars = rawText.length
  const estimatedTokens = Math.ceil(chars * 1.5)
  const chunks = Math.ceil(chars / 3000)
  const inputTokens = chunks * Math.ceil(3500 * 1.5)
  const outputTokens = chunks * Math.ceil(500 * 1.5)
  const finalInput = estimatedTokens
  const finalOutput = 2000

  const totalInput = inputTokens + finalInput
  const totalOutput = outputTokens + finalOutput
  const cost = (totalInput / 1_000_000 * 1.0 + totalOutput / 1_000_000 * 2.0).toFixed(4)

  return {
    estimatedChunks: chunks,
    estimatedTokens: totalInput + totalOutput,
    estimatedCost: parseFloat(cost),
  }
}