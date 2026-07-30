/**
 * 聊天记录导入解析器
 * 支持多种格式：
 * - JSON: ChatGPT, Character.AI, 通用格式
 * - CSV: role/content 或 sender/message 列
 * - TXT: 自定义分隔符（如 用户：/AI：）
 * - DOCX: Word 文档，使用 mammoth 提取文本后按 TXT 格式解析
 */

/**
 * 解析导入文件，返回统一格式的消息数组
 * @param {File} file - 上传的文件
 * @param {Object} options - 解析选项
 * @returns {Promise<{messages: Array, format: string, preview: string}>}
 */
export async function parseImportFile(file, options = {}) {
  const fileName = file.name.toLowerCase()
  const ext = fileName.split('.').pop()

  if (ext === 'docx') {
    return parseDOCX(file, options)
  }

  const text = await file.text()

  if (ext === 'json') {
    return parseJSON(text)
  } else if (ext === 'csv') {
    return parseCSV(text)
  } else {
    return parseTXT(text, options)
  }
}

/**
 * 解析 JSON 格式
 * 支持:
 * - ChatGPT 导出: [{mapping: {...}}] 或 [{conversations: [...]}]
 * - Character.AI 格式: {histories: [{messages: [...]}]}
 * - 通用格式: [{role: 'user'|'assistant', content: '...'}]
 * - 本应用导出格式: {character: {...}, messages: [...]}
 */
function parseJSON(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('JSON 格式无效，无法解析')
  }

  let messages = []

  // 本应用导出格式
  if (data.messages && Array.isArray(data.messages)) {
    messages = data.messages
      .filter((m) => m.role && m.content)
      .map((m) => ({ role: m.role, content: m.content }))
  }
  // ChatGPT 导出格式: 数组包含 conversations
  else if (Array.isArray(data)) {
    // 检查是否是 ChatGPT 格式
    if (data[0]?.mapping) {
      // ChatGPT conversations.json
      for (const conv of data) {
        const mapping = conv.mapping || {}
        const sorted = Object.values(mapping)
          .filter((m) => m.message && m.message.content)
          .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0))

        for (const item of sorted) {
          const msg = item.message
          const role = msg.author?.role
          if (role === 'user' || role === 'assistant') {
            const content = extractChatGPTContent(msg.content)
            if (content) {
              messages.push({ role, content })
            }
          }
        }
      }
    }
    // 通用 JSON 数组 [{role, content}]
    else if (data[0]?.role && data[0]?.content) {
      messages = data
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
        .map((m) => ({ role: m.role, content: m.content }))
    }
    // 尝试深层查找
    else {
      messages = findMessagesInJSON(data)
    }
  }
  // Character.AI 格式
  else if (data.histories && Array.isArray(data.histories)) {
    for (const hist of data.histories) {
      if (hist.messages && Array.isArray(hist.messages)) {
        for (const msg of hist.messages) {
          const role = msg.src === 0 ? 'user' : 'assistant' // Character.AI: src=0 is user
          const content = msg.text || msg.content || ''
          if (content) {
            messages.push({ role, content })
          }
        }
      }
    }
  }
  // 通用对象
  else {
    messages = findMessagesInJSON(data)
  }

  if (messages.length === 0) {
    throw new Error('未找到可识别的聊天记录。请检查文件格式，或尝试使用文本格式导入。')
  }

  return {
    messages,
    format: 'json',
    preview: generatePreview(messages),
  }
}

/**
 * 从 JSON 对象中深层递归查找消息数组
 */
function findMessagesInJSON(obj, depth = 0) {
  if (depth > 5) return []

  if (Array.isArray(obj)) {
    // 检查是否是消息数组
    if (obj.length > 0 && obj[0]?.role && obj[0]?.content) {
      return obj
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
        .map((m) => ({ role: m.role, content: m.content }))
    }
    for (const item of obj) {
      const found = findMessagesInJSON(item, depth + 1)
      if (found.length > 0) return found
    }
  } else if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const found = findMessagesInJSON(obj[key], depth + 1)
      if (found.length > 0) return found
    }
  }

  return []
}

/**
 * 提取 ChatGPT 消息内容（可能是 parts 数组或纯文本）
 */
function extractChatGPTContent(content) {
  if (typeof content === 'string') return content
  if (content?.parts && Array.isArray(content.parts)) {
    return content.parts.filter((p) => typeof p === 'string').join('\n')
  }
  return ''
}

/**
 * 解析 CSV 格式
 * 支持列名: role/content, sender/message, 角色/内容, 发送者/消息
 */
function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV 文件内容为空')
  }

  const header = parseCSVLine(lines[0])
  const roleIdx = header.findIndex((h) =>
    ['role', 'sender', '角色', '发送者', 'speaker'].includes(h.toLowerCase().trim())
  )
  const contentIdx = header.findIndex((h) =>
    ['content', 'message', '内容', '消息', 'text'].includes(h.toLowerCase().trim())
  )

  if (roleIdx === -1 || contentIdx === -1) {
    throw new Error(
      'CSV 格式不正确。需要包含 role/sender 和 content/message 列。\n' +
        '当前列名: ' + header.join(', ')
    )
  }

  const messages = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length <= Math.max(roleIdx, contentIdx)) continue

    const roleRaw = (cols[roleIdx] || '').trim().toLowerCase()
    const content = (cols[contentIdx] || '').trim()

    if (!content) continue

    let role = 'user'
    if (['assistant', 'ai', 'bot', 'ai助手', '机器人', 'ai角色'].includes(roleRaw)) {
      role = 'assistant'
    } else if (['user', '用户', 'me', '我', 'human'].includes(roleRaw)) {
      role = 'user'
    }

    messages.push({ role, content })
  }

  if (messages.length === 0) {
    throw new Error('CSV 文件中没有找到有效的消息数据')
  }

  return {
    messages,
    format: 'csv',
    preview: generatePreview(messages),
  }
}

/**
 * 解析 CSV 行（处理引号包裹的逗号）
 */
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

/**
 * 解析纯文本格式
 * 默认分隔符: 用户： / AI： 或 User: / AI:
 * 可通过 options.delimiters 自定义
 */
function parseTXT(text, options = {}) {
  const userDelim = options.userDelimiter || '用户：'
  const aiDelim = options.aiDelimiter || 'AI：'

  // 尝试多种分隔符模式
  const patterns = [
    { user: userDelim, ai: aiDelim },
    { user: '用户:', ai: 'AI:' },
    { user: 'User:', ai: 'AI:' },
    { user: 'USER:', ai: 'ASSISTANT:' },
    { user: 'Human:', ai: 'Assistant:' },
    { user: '我：', ai: 'AI：' },
    { user: '我:', ai: 'AI:' },
    { user: '你：', ai: '对方：' },
    { user: 'Q:', ai: 'A:' },
  ]

  let messages = []
  let usedPattern = null

  for (const pattern of patterns) {
    const testMessages = tryParseWithDelimiters(text, pattern.user, pattern.ai)
    if (testMessages.length > 0) {
      messages = testMessages
      usedPattern = pattern
      break
    }
  }

  if (messages.length === 0) {
    // 最后尝试：按空行分割，交替分配给 user/assistant
    messages = tryParseAlternating(text)
  }

  if (messages.length === 0) {
    throw new Error(
      '无法解析文本格式。请确保使用以下格式之一：\n' +
        '  用户：消息内容\n' +
        '  AI：回复内容\n' +
        '或使用 JSON/CSV 格式导入。'
    )
  }

  return {
    messages,
    format: 'txt',
    preview: generatePreview(messages),
    detectedPattern: usedPattern
      ? `用户: "${usedPattern.user}" / AI: "${usedPattern.ai}"`
      : '交替模式',
  }
}

/**
 * 使用指定分隔符尝试解析
 */
function tryParseWithDelimiters(text, userDelim, aiDelim) {
  const messages = []
  // 构建正则，匹配分隔符后面的内容
  const escapedUser = userDelim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedAI = aiDelim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escapedUser}|${escapedAI})\\s*`, 'gi')

  const parts = text.split(regex).filter(Boolean)
  let currentRole = null

  for (const part of parts) {
    const trimmed = part.trim()
    const userMatch = trimmed.match(new RegExp(`^${escapedUser}\\s*$`, 'i'))
    const aiMatch = trimmed.match(new RegExp(`^${escapedAI}\\s*$`, 'i'))

    if (userMatch) {
      currentRole = 'user'
    } else if (aiMatch) {
      currentRole = 'assistant'
    } else if (currentRole && trimmed) {
      messages.push({ role: currentRole, content: trimmed })
    }
  }

  return messages
}

/**
 * 按空行分割，交替分配角色
 */
function tryParseAlternating(text) {
  const blocks = text.split(/\n\n+/).filter((b) => b.trim())
  if (blocks.length < 2) return []

  const messages = []
  blocks.forEach((block, index) => {
    const content = block.trim()
    if (content) {
      messages.push({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content,
      })
    }
  })

  return messages.length >= 2 ? messages : []
}

/**
 * 解析 DOCX 格式
 * 使用 mammoth 提取文本，然后按 TXT 格式解析
 */
async function parseDOCX(file, options = {}) {
  try {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    const text = result.value

    if (!text || !text.trim()) {
      throw new Error('DOCX 文件中没有提取到文本内容')
    }

    // 显示警告信息
    if (result.messages && result.messages.length > 0) {
      console.warn('Mammoth warnings:', result.messages)
    }

    // 按 TXT 格式解析提取的文本
    const txtResult = parseTXT(text, options)
    return {
      ...txtResult,
      format: 'docx',
    }
  } catch (err) {
    if (err.message === 'DOCX 文件中没有提取到文本内容') {
      throw err
    }
    throw new Error(`DOCX 解析失败: ${err.message}`)
  }
}

/**
 * 生成消息预览文本
 */
function generatePreview(messages) {
  const previewCount = Math.min(messages.length, 5)
  const lines = messages.slice(0, previewCount).map((m, i) => {
    const role = m.role === 'user' ? '用户' : 'AI'
    const preview = m.content.length > 80 ? m.content.slice(0, 80) + '...' : m.content
    return `${i + 1}. [${role}] ${preview}`
  })

  if (messages.length > previewCount) {
    lines.push(`... 共 ${messages.length} 条消息`)
  }

  return lines.join('\n')
}