/**
 * 聊天记录解析器 — 增强版
 * 解析后返回结构化消息 + 原始纯文本（用于记忆提取）
 * 支持 txt, json, csv, docx
 */

import { parseImportFile as baseParse } from './importParser'

/**
 * 解析导入文件，返回增强结果
 * @param {File} file
 * @param {Object} options - { userDelimiter, aiDelimiter, csvRoleCol, csvContentCol }
 * @returns {Promise<{messages: Array, format: string, rawText: string, stats: Object}>}
 */
export async function parseChatLogFile(file, options = {}) {
  const result = await baseParse(file, options)

  // 生成纯文本（用于 LLM 记忆提取）
  const rawText = result.messages.map((m) => {
    const role = m.role === 'user' ? '用户' : 'AI'
    return `${role}：${m.content}`
  }).join('\n')

  const totalChars = rawText.length
  const estimatedTokens = Math.ceil(totalChars * 1.5)
  // 按 3000 字一段切割，预估段数
  const chunkSize = 3000
  const estimatedChunks = Math.ceil(totalChars / chunkSize)

  return {
    messages: result.messages,
    format: result.format,
    rawText,
    stats: {
      totalMessages: result.messages.length,
      totalChars,
      estimatedTokens,
      estimatedChunks,
      // 预估费用：每段约 3000 字输入 + 500 字输出，DeepSeek 输入 1元/百万token，输出 2元/百万token
      estimatedCost: (estimatedChunks * (estimatedTokens / estimatedChunks) * 1.0 / 1_000_000 +
        estimatedChunks * 500 * 1.5 * 2.0 / 1_000_000).toFixed(4),
    },
  }
}

/**
 * 将纯文本切割为多个片段，每段不超过 maxChars 字
 * 确保切割点在换行符处，不切断消息
 */
export function chunkText(rawText, maxChars = 3000) {
  const chunks = []
  const lines = rawText.split('\n')
  let current = ''

  for (const line of lines) {
    if ((current.length + line.length + 1) > maxChars && current.length > 0) {
      // 当前段已满，保存并开始新段
      chunks.push(current.trim())
      current = line
    } else {
      current += (current ? '\n' : '') + line
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks
}

/**
 * 获取断点续传状态
 */
export function getImportProgress(characterId) {
  try {
    const raw = localStorage.getItem(`ai-chat-import-progress-${characterId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveImportProgress(characterId, progress) {
  localStorage.setItem(`ai-chat-import-progress-${characterId}`, JSON.stringify(progress))
}

export function clearImportProgress(characterId) {
  localStorage.removeItem(`ai-chat-import-progress-${characterId}`)
}