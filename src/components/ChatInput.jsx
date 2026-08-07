import { useState, useRef, useEffect, useCallback, memo } from 'react'

const ChatInput = memo(function ChatInput({ onSend, isLoading, followUpTarget, onCancelFollowUp }) {
  const [input, setInput] = useState('')
  const textareaRef = useRef(null)

  // 当 followUpTarget 变化时，自动聚焦输入框
  useEffect(() => {
    if (followUpTarget && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [followUpTarget])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return
    onSend(input)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, isLoading, onSend])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl px-3 sm:px-4 py-2 sm:py-3 pb-safe"
         style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}>
      {/* 追问状态提示 */}
      {followUpTarget && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-xs text-ios-blue/70 truncate flex-1">
            针对这条消息追问：{followUpTarget.content.slice(0, 40)}{followUpTarget.content.length > 40 ? '...' : ''}
          </span>
          <button
            onClick={onCancelFollowUp}
            className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
          >
            <svg className="w-3 h-3 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 w-full max-w-3xl mx-auto">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={followUpTarget ? '针对这条消息追问...' : '输入消息...'}
            rows={1}
            disabled={isLoading}
            enterKeyHint="send"
            className="w-full px-4 py-2.5 pr-10 rounded-2xl border border-gray-200 dark:border-gray-700
                       bg-gray-50 dark:bg-gray-800
                       focus:outline-none focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/20
                       focus:bg-white dark:focus:bg-gray-800
                       transition-all duration-200 text-sm resize-none
                       text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500
                       disabled:opacity-50 disabled:cursor-not-allowed
                       selection:bg-ios-blue/30"
            style={{ maxHeight: '120px', fontSize: '16px' }}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-ios-blue text-white flex items-center justify-center
                     hover:brightness-110 active:scale-[0.95] transition-all duration-150
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
                     -webkit-tap-highlight-color-none">
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
})

export default ChatInput