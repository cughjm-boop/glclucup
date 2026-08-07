import { useState, useMemo } from 'react'

function formatFullTime(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}`
}

function highlightText(text, keyword) {
  if (!keyword.trim()) return text
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 text-gray-900 dark:text-yellow-100 rounded px-0.5">{part}</mark>
      : part
  )
}

// 提取关键词前后各约15个字的上下文
function getContext(text, keyword, contextLen = 15) {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase())
  if (idx === -1) return text.slice(0, contextLen * 2) + (text.length > contextLen * 2 ? '...' : '')

  const start = Math.max(0, idx - contextLen)
  const end = Math.min(text.length, idx + keyword.length + contextLen)
  let preview = text.slice(start, end)
  if (start > 0) preview = '...' + preview
  if (end < text.length) preview = preview + '...'
  return preview
}

export default function ChatSearch({ messages, character, onSelectMessage, onClose }) {
  const [keyword, setKeyword] = useState('')

  const results = useMemo(() => {
    if (!keyword.trim()) return []
    const kw = keyword.toLowerCase()
    const matched = []
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.recalled) continue // 跳过已撤回的消息
      if (msg.content.toLowerCase().includes(kw)) {
        matched.push({
          ...msg,
          preview: getContext(msg.content, keyword),
        })
      }
    }
    return matched
  }, [messages, keyword])

  const senderLabel = (role) => role === 'user' ? '用户' : (character?.name || 'AI')

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-safe animate-fade-in">
      <div className="ios-card mx-4 mt-4 w-full max-w-lg flex flex-col max-h-[80vh] animate-bounce-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">查找聊天内容</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 pb-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="输入关键词搜索..."
              autoFocus
              className="ios-input pl-10 pr-10"
            />
            {keyword && (
              <button
                onClick={() => setKeyword('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {!keyword.trim() ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              输入关键词，搜索与 {character?.name || '当前角色'} 的聊天记录
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              未找到相关消息
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                找到 {results.length} 条相关消息
              </p>
              {results.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => onSelectMessage(msg.id)}
                  className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-100 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${
                      msg.role === 'user'
                        ? 'text-ios-blue'
                        : 'text-green-600 dark:text-green-400'
                    }`}>
                      {senderLabel(msg.role)}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {formatFullTime(msg.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {highlightText(msg.preview, keyword)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}