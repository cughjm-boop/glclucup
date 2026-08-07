/**
 * 增强记忆服务 — 满血版
 * 包含 11 个增强功能，全部异步执行，不阻塞正常聊天
 * 月预算约 5 元 token（基于 DeepSeek 定价）
 */

import { loadFromStorage, saveToStorage, STORAGE_KEYS } from './storage'
import { recordCost, canRunTask, getTaskFrequency, isOverBudget } from './costTracker'
import { findCharacter } from './characterDataService'

// ============= Item 43: 实时情绪感知缓存（内存 Map + TTL，不持久化到磁盘）=============
/**
 * 严格遵循"实时情绪感知（不存储，仅增强共情回复）"
 * - 仅保存在内存 Map 中（页面关闭自动清除）
 * - TTL 5 分钟，过期自动失效
 * - 所有旧的 localStorage EMOTION_CACHE 读取均已移除
 */
const _emotionCache = new Map() // key: characterId -> { value, expireAt }
const EMOTION_CACHE_TTL = 5 * 60 * 1000 // 5 分钟

function _getCachedEmotion(characterId) {
  if (!characterId) return null
  const entry = _emotionCache.get(characterId)
  if (!entry) return null
  if (entry.expireAt <= Date.now()) {
    _emotionCache.delete(characterId)
    return null
  }
  return entry.value
}
function _setCachedEmotion(characterId, value) {
  if (!characterId) return
  _emotionCache.set(characterId, { value, expireAt: Date.now() + EMOTION_CACHE_TTL })
}
// 启动时清理旧 localStorage 残留，确保不再持久化
try {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEYS.EMOTION_CACHE)
} catch (_) { /* ignore */ }

// ============= 底层 LLM 调用 =============

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

async function httpPost(url, bodyJson, headers) {
  // 优先使用原生代理
  if (window.HttpProxy && typeof window.HttpProxy.post === 'function') {
    try {
      const rawResult = window.HttpProxy.post(url, bodyJson, JSON.stringify(headers))
      const result = JSON.parse(rawResult)
      if (!result.ok) throw new Error(result.error || `HTTP ${result.status}`)
      return result
    } catch (e) {
      console.warn('[EnhancedMemory] 原生代理失败，降级 fetch:', e.message)
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

async function callLLM(messages, temperature = 0.3, maxTokens = 512) {
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

// ============= 调度器 =============

function getScheduledTasks() {
  return loadFromStorage(STORAGE_KEYS.SCHEDULED_TASKS) || {}
}

function saveScheduledTasks(tasks) {
  saveToStorage(STORAGE_KEYS.SCHEDULED_TASKS, tasks)
}

function shouldRunTask(taskName, frequencyDays) {
  if (frequencyDays === 0) return false
  if (isOverBudget()) return false
  if (!canRunTask(taskName)) return false

  const tasks = getScheduledTasks()
  const lastRun = tasks[taskName]
  if (!lastRun) return true
  const elapsed = (Date.now() - lastRun) / (1000 * 60 * 60 * 24)
  return elapsed >= frequencyDays
}

function markTaskRun(taskName) {
  const tasks = getScheduledTasks()
  tasks[taskName] = Date.now()
  saveScheduledTasks(tasks)
}

// ============= 增强记忆存储 =============

function getEnhancedMemories() {
  return loadFromStorage(STORAGE_KEYS.ENHANCED_MEMORIES) || {}
}

function saveEnhancedMemory(characterId, type, data) {
  const all = getEnhancedMemories()
  if (!all[characterId]) all[characterId] = {}
  all[characterId][type] = { ...data, updatedAt: Date.now() }
  saveToStorage(STORAGE_KEYS.ENHANCED_MEMORIES, all)
}

function getEnhancedMemory(characterId, type) {
  return getEnhancedMemories()[characterId]?.[type] || null
}

// ============= 用户画像 =============

export function getUserProfile() {
  return loadFromStorage(STORAGE_KEYS.USER_PROFILE) || {}
}

export function saveUserProfile(profile) {
  const existing = getUserProfile()
  const merged = { ...existing, ...profile, updatedAt: Date.now() }
  saveToStorage(STORAGE_KEYS.USER_PROFILE, merged)
  return merged
}

// ============== 1. 增强版深度反思 =============

export async function deepReflection(character, messages, memories) {
  if (!shouldRunTask('deepReflection', getTaskFrequency('deepReflection'))) return null

  const existingProfile = getUserProfile()
  const existingReflection = getEnhancedMemory(character.id, 'deepReflection')

  const dialogText = messages.slice(-20).map((m) => {
    const role = m.role === 'user' ? '用户' : `${character.name}`
    return `${role}：${m.content}`
  }).join('\n')

  const memoryText = memories.map((m) => `[${m.category || '其他'}] ${m.content}`).join('\n')

  const prompt = `你是一位专业的心理学分析助手。请根据以下对话内容和角色对用户的已知记忆，生成一份深度分析报告。

角色设定：${character.identity || 'AI助手'}，性格：${character.personality || '友善'}，与用户关系：${character.relationship || '朋友'}。
注意：角色的性格是永久设定，不会被对话内容改变。任何关于角色性格变化的描述都是临时的，不应写入分析报告。

已知用户画像：
${JSON.stringify(existingProfile, null, 2)}

用户的已知记忆：
${memoryText}

最近对话：
${dialogText}

${existingReflection ? `上次反思结果：${existingReflection.summary || ''}` : ''}

请以 JSON 格式输出分析结果：
{
  "personality_model": {
    "mbti_likely": "推测的 MBTI 类型",
    "attachment_style": "依恋类型（安全型/焦虑型/回避型/混乱型）",
    "values": ["价值观1", "价值观2"],
    "deep_needs": ["深层需求1", "深层需求2"],
    "life_stage": "当前人生阶段描述"
  },
  "emotion_peaks": [
    { "message_index": 0, "emotion": "喜悦", "trigger": "触发原因", "intensity": "高/中/低" }
  ],
  "relationship_stage": {
    "current": "当前阶段（初识/熟悉/亲密/深度绑定）",
    "prediction": "预测发展走向",
    "confidence": "推断置信度 0-1"
  },
  "hidden_insights": [
    "用户可能没说但存在的想法或顾虑"
  ],
  "user_summary": "一段200字以内的高压缩用户认知摘要，供后续对话注入系统提示词"
}

【重要】分析规则：
- 只分析用户的心理状态和人格特征，不要分析角色自身的性格变化。
- 角色性格是永久设定（${character.personality || '友善'}），不会因对话而改变。
- 如果对话中用户要求角色改变性格，这是用户对角色表现的期望，不是角色性格真的变了。
- user_summary 只记录关于用户的事实认知，不记录角色自身的变化。`

  try {
    const reply = await callLLM([
      { role: 'system', content: '你是专业的心理学分析助手。输出必须是标准 JSON。' },
      { role: 'user', content: prompt },
    ], 0.3, 1024)

    const parsed = extractJSON(reply)
    if (!parsed) return null

    // 记录成本
    recordCost(prompt, reply, 'deepReflection')

    const result = {
      ...parsed,
      generatedAt: Date.now(),
      characterName: character.name,
    }
    saveEnhancedMemory(character.id, 'deepReflection', result)

    // 更新用户画像
    if (parsed.personality_model) {
      saveUserProfile({
        personalityModel: parsed.personality_model,
        lastReflection: Date.now(),
      })
    }

    markTaskRun('deepReflection')
    return result
  } catch (e) {
    console.warn('[EnhancedMemory] 深度反思失败:', e.message)
    return null
  }
}

// ============== 2. 主动关联网络 =============

export async function associationNetwork(character, memories) {
  if (!shouldRunTask('associationNetwork', getTaskFrequency('associationNetwork'))) return null

  const memoryText = memories.map((m) => `[${m.category || '其他'}] ${m.content}`).join('\n')

  if (memories.length < 10) return null // 记忆太少不执行

  const prompt = `你是一位数据分析助手。请分析以下角色对用户的所有记忆，构建关联网络。

角色名：${character.name}，身份：${character.identity || 'AI助手'}

所有记忆条目：
${memoryText}

请以 JSON 格式输出：
{
  "people_network": [
    { "name": "人名", "relation": "与用户的关系", "mentioned_in": ["相关记忆"] }
  ],
  "event_chains": [
    { "title": "事件链标题", "events": ["事件1", "事件2"], "narrative": "将这些事件串联成的故事线" }
  ],
  "theme_clusters": [
    { "theme": "主题名（如'海边'、'考研'）", "memories": ["相关记忆1", "相关记忆2"] }
  ],
  "predicted_topics": [
    "角色下次可以主动开启的话题"
  ]
}`

  try {
    const reply = await callLLM([
      { role: 'system', content: '你是数据分析助手。输出必须是标准 JSON。' },
      { role: 'user', content: prompt },
    ], 0.3, 1024)

    const parsed = extractJSON(reply)
    if (!parsed) return null

    recordCost(prompt, reply, 'associationNetwork')
    const result = { ...parsed, generatedAt: Date.now() }
    saveEnhancedMemory(character.id, 'associationNetwork', result)
    markTaskRun('associationNetwork')
    return result
  } catch (e) {
    console.warn('[EnhancedMemory] 关联网络生成失败:', e.message)
    return null
  }
}

// ============== 3. 实时情绪感知 =============

export async function senseEmotion(character, userMessage) {
  if (!canRunTask('emotionSensing')) return null

  // 1) 读内存缓存（5 分钟内有效），避免重复调用 LLM
  const charId = character?.id || character?.name
  const cached = _getCachedEmotion(charId)
  if (cached) return cached

  const prompt = `分析以下用户消息的情绪状态。用户消息：${userMessage}

以 JSON 格式输出：
{
  "emotion": "主要情绪（快乐/悲伤/愤怒/焦虑/期待/平静/疲惫/沮丧/兴奋/紧张/满足/孤独）",
  "intensity": "强度（高/中/低）",
  "subtext": "1-2句共情指导，帮助角色更好地回应",
  "suggested_tone": "建议角色回复的语气（温暖/轻松/严肃/鼓励/幽默/温柔）"
}`

  try {
    const reply = await callLLM([
      { role: 'system', content: '你是情绪分析助手。输出必须是标准 JSON。' },
      { role: 'user', content: prompt },
    ], 0.1, 128)

    const parsed = extractJSON(reply)
    if (!parsed) return null

    recordCost(prompt, reply, 'emotionSensing')
    // 严格：仅保存在内存 Map + TTL，不写入 localStorage，确保"不存储"
    const value = { ...parsed, timestamp: Date.now() }
    _setCachedEmotion(charId, value)
    return value
  } catch {
    return null
  }
}

// ============== 4. 角色内心独白 =============

/**
 * 获取官方角色设定约束文本
 * @param {Object} character - 角色对象
 * @returns {string} 官方设定约束文本
 */
function getOfficialConstraints(character) {
  if (!character || character.worldview !== 'star_rail') return ''
  const ref = character.srCharacterRef || character.name
  const official = findCharacter(ref)
  if (!official) return ''

  const parts = []
  parts.push('【官方设定约束 — 必须严格遵守】')
  if (official.identity) parts.push(`- 身份：${official.identity}`)
  if (official.personality?.length) parts.push(`- 性格：${official.personality.join('、')}`)
  if (official.story_summary) parts.push(`- 背景故事：${official.story_summary}`)
  if (official.combat_style) parts.push(`- 战斗方式：${official.combat_style}`)
  parts.push('以上官方设定是角色的"宪法"，独白内容必须与官方设定一致，不可违背。')
  return parts.join('\n')
}

export async function generateMonologue(character, messages, memories, force = false) {
  if (!force && !shouldRunTask('monologue', getTaskFrequency('monologue'))) return null
  if (force && isOverBudget()) return null

  const dialogText = messages.slice(-30).map((m) => {
    const role = m.role === 'user' ? '用户' : `我（${character.name}）`
    return `${role}：${m.content}`
  }).join('\n')

  const memoryText = memories.slice(0, 20).map((m) => m.content).join('\n')

  const officialConstraints = getOfficialConstraints(character)

  const prompt = `你是${character.name}，${character.identity || 'AI助手'}。请以第一人称写一段内心独白，记录你近期的感受。

你的性格（永久设定，不可改变）：${character.personality || '友善'}
你与用户的关系：${character.relationship || '朋友'}

${officialConstraints}

最近对话：
${dialogText}

你记得关于用户的事：
${memoryText}

请以第一人称写一段 200 字以内的内心独白，包含：
- 对用户的思念或关心
- 最近的感受或担忧
- 对未来的期待
- 希望用户知道但没说出口的话

【重要】你的性格是永久设定（${character.personality || '友善'}），不会改变。独白中不要暗示自己的性格发生了变化。如果用户要求你改变性格，那是临时的玩笑，独白中可以提及但不意味着你真的变了。
${officialConstraints ? '【核心约束】独白内容必须与官方设定完全一致。你的身份、性格、战斗方式等均以官方设定为准，不可在独白中偏离或重新定义。' : ''}

直接输出独白文本，不要用 JSON 格式。以"夜深了，我想..."或类似的自然方式开头。`

  try {
    const reply = await callLLM([
      { role: 'system', content: `你是${character.name}，用第一人称写内心独白。` },
      { role: 'user', content: prompt },
    ], 0.7, 512)

    recordCost(prompt, reply, 'monologue')
    const monologue = {
      content: reply.trim(),
      generatedAt: Date.now(),
      characterName: character.name,
      source: 'monologue',
    }
    saveEnhancedMemory(character.id, 'monologue', monologue)
    markTaskRun('monologue')
    return monologue
  } catch (e) {
    console.warn('[EnhancedMemory] 内心独白生成失败:', e.message)
    return null
  }
}

// ============== 5. 跨角色用户画像同步 =============

export function syncUserProfileAcrossCharacters(characters, allMemories) {
  const profile = getUserProfile()

  // 从所有角色的记忆中提取用户信息
  const allGlobalInfo = {
    names: new Set(),
    occupations: new Set(),
    interests: new Set(),
  }

  Object.values(allMemories).forEach((memList) => {
    memList.forEach((m) => {
      if (m.category === 'personal_info') {
        if (m.content.includes('叫')) {
          allGlobalInfo.names.add(m.content)
        }
        if (m.content.includes('职业') || m.content.includes('是')) {
          allGlobalInfo.occupations.add(m.content)
        }
      }
      if (m.category === 'preferences') {
        allGlobalInfo.interests.add(m.content)
      }
    })
  })

  const updatedProfile = {
    ...profile,
    globalInfo: {
      knownNames: [...allGlobalInfo.names],
      knownOccupations: [...allGlobalInfo.occupations],
      knownInterests: [...allGlobalInfo.interests],
    },
    lastSync: Date.now(),
    characterCount: characters.length,
  }

  saveUserProfile(updatedProfile)
  return updatedProfile
}

// ============== 6. 智能话题主动发起 =============

export async function generateSmartTopic(character, messages, memories) {
  if (!shouldRunTask('smartTopic', getTaskFrequency('smartTopic'))) return null

  const dialogText = messages.slice(-20).map((m) => {
    const role = m.role === 'user' ? '用户' : `${character.name}`
    return `${role}：${m.content}`
  }).join('\n')

  const memoryText = memories.map((m) => `[${m.category || '其他'}] ${m.content}`).join('\n')

  const prompt = `你是${character.name}，${character.identity || 'AI助手'}。请生成你想主动对用户说的话。

你的性格：${character.personality || '友善'}
你与用户的关系：${character.relationship || '朋友'}

最近对话：
${dialogText}

你记得的事：
${memoryText}

请以 JSON 格式输出：
{
  "opening_message": "下次打开聊天时，你想主动说的第一句话",
  "questions_to_ask": ["你想问用户的问题1", "问题2"],
  "things_to_share": ["你想分享的事1", "事2"],
  "reason": "为什么选择这些话题"
}`

  try {
    const reply = await callLLM([
      { role: 'system', content: `你是${character.name}。输出必须是标准 JSON。` },
      { role: 'user', content: prompt },
    ], 0.6, 512)

    const parsed = extractJSON(reply)
    if (!parsed) return null

    recordCost(prompt, reply, 'smartTopic')
    const result = { ...parsed, generatedAt: Date.now() }
    saveEnhancedMemory(character.id, 'smartTopic', result)
    markTaskRun('smartTopic')
    return result
  } catch (e) {
    console.warn('[EnhancedMemory] 话题生成失败:', e.message)
    return null
  }
}

// ============== 7. 周年与纪念日提醒 =============

export function checkAnniversaries(memories) {
  if (!canRunTask('anniversary')) return null

  const today = new Date()
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 从记忆中查找日期相关信息
  const datePatterns = [
    /(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/g,
    /(\d{1,2})月(\d{1,2})[日号]/g,
    /(\d{1,2})\/(\d{1,2})/g,
  ]

  const found = []

  memories.forEach((mem) => {
    const content = mem.content
    // 检查是否包含"第一次"、"纪念"、"生日"等关键词
    const isSpecial = /第一次|纪念|生日|周年|初见|相遇|认识|那天/.test(content)

    if (isSpecial) {
      for (const pattern of datePatterns) {
        let match
        while ((match = pattern.exec(content)) !== null) {
          let month, day
          if (match.length === 4) {
            month = String(parseInt(match[2])).padStart(2, '0')
            day = String(parseInt(match[3])).padStart(2, '0')
          } else {
            month = String(parseInt(match[1])).padStart(2, '0')
            day = String(parseInt(match[2])).padStart(2, '0')
          }
          const dateStr = `${month}-${day}`
          if (dateStr === todayStr) {
            found.push({ content, date: dateStr, memoryId: mem.id })
          }
        }
      }
    }
  })

  return found.length > 0 ? { anniversaries: found, date: todayStr } : null
}

// ============== 综合调度入口 =============

/**
 * 对话结束后触发的后台任务
 */
export async function runPostConversationTasks(character, messages, memories) {
  const tasks = []

  // 1. 深度反思
  tasks.push(
    deepReflection(character, messages, memories).catch(() => null)
  )

  // 2. 关联网络
  tasks.push(
    associationNetwork(character, memories).catch(() => null)
  )

  // 4. 内心独白
  tasks.push(
    generateMonologue(character, messages, memories).catch(() => null)
  )

  // 9. 智能话题
  tasks.push(
    generateSmartTopic(character, messages, memories).catch(() => null)
  )

  const results = await Promise.allSettled(tasks)
  return results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value)
}

/**
 * 定期触发的维护任务（建议每天调用一次）
 */
export async function runScheduledMaintenance(characters, allMessages, allMemories) {
  const tasks = []

  // 5. 跨角色画像同步
  tasks.push(
    Promise.resolve(syncUserProfileAcrossCharacters(characters, allMemories))
  )

  const results = await Promise.allSettled(tasks)
  return results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value)
}

/**
 * 获取最近一次增强记忆内容（用于系统提示词注入）
 */
export function getEnhancedContextForPrompt(characterId) {
  const enhanced = getEnhancedMemories()[characterId] || {}
  const parts = []

  // 深度反思摘要
  if (enhanced.deepReflection?.user_summary) {
    parts.push(`【深度用户认知】${enhanced.deepReflection.user_summary}`)
  }

  // 最新内心独白
  if (enhanced.monologue?.content) {
    const age = Date.now() - enhanced.monologue.generatedAt
    if (age < 7 * 24 * 60 * 60 * 1000) { // 7天内
      parts.push(`【你的内心独白】${enhanced.monologue.content}`)
    }
  }

  // 智能话题
  if (enhanced.smartTopic?.opening_message) {
    parts.push(`【你想主动谈起的事】${enhanced.smartTopic.opening_message}`)
  }

  return parts.join('\n\n')
}