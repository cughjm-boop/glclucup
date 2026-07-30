/**
 * LLM API 服务 - 支持 OpenAI 兼容接口
 * 默认使用 DeepSeek API，可配置为任意兼容接口
 *
 * 配置方式:
 * - DeepSeek: baseUrl = 'https://api.deepseek.com', model = 'deepseek-chat'
 * - OpenAI:   baseUrl = 'https://api.openai.com/v1',  model = 'gpt-4o'
 * - 其他兼容: 填入对应的 baseUrl 和 model
 */

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

/**
 * 构建系统提示词
 */
function buildSystemPrompt(character) {
  const parts = []

  if (character.identity) {
    parts.push(`你是${character.identity}。`)
  }
  if (character.personality) {
    parts.push(`你的性格特点：${character.personality}。`)
  }
  if (character.speakingStyle) {
    parts.push(`你的说话风格：${character.speakingStyle}。`)
  }
  if (character.relationship) {
    parts.push(`你与用户的关系：${character.relationship}。`)
  }
  if (character.backstory) {
    parts.push(`背景设定：${character.backstory}。`)
  }

  // 导入的记忆
  if (character.importedMemory && character.importedMemory.length > 0) {
    parts.push('')
    parts.push('以下是你们之前的对话历史，请记住这些内容，并在后续对话中保持连贯：')
    character.importedMemory.forEach((m) => {
      const role = m.role === 'user' ? '用户' : `你（${character.name}）`
      parts.push(`${role}：${m.content}`)
    })
    parts.push('以上是之前的对话回忆。请基于这些记忆自然地延续对话，在适当的时候可以提及过去的事情。')
  }

  parts.push('请始终保持角色，用符合角色设定的方式回复。回复要自然、生动，富有情感。不要跳出角色设定。')
  parts.push('回复使用中文。')

  return parts.join('\n')
}

/**
 * 发送聊天消息到 LLM API
 * @param {Array} messages - 消息历史 [{role: 'user'|'assistant', content: string}]
 * @param {Object} character - 角色对象
 * @param {Object} settings - {apiKey, baseUrl, modelName}
 * @returns {Promise<string>} AI 回复内容
 */
export async function sendChatMessage(messages, character, settings) {
  const apiKey = settings.apiKey
  const baseUrl = settings.baseUrl || DEFAULT_BASE_URL
  const modelName = settings.modelName || DEFAULT_MODEL

  if (!apiKey) {
    throw new Error('请先设置 API Key')
  }

  const systemPrompt = buildSystemPrompt(character)

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ]

  // 确保 URL 以 /v1 结尾
  const apiEndpoint = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/v1`
  const url = `${apiEndpoint}/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: apiMessages,
      temperature: 0.8,
      max_tokens: 2048,
      stream: false,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMsg = errorData.error?.message || `API 请求失败 (${response.status})`
    throw new Error(errorMsg)
  }

  const data = await response.json()
  const reply = data.choices?.[0]?.message?.content

  if (!reply) {
    throw new Error('API 返回了空回复')
  }

  return reply
}