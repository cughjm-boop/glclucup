import { useState, useRef, useEffect } from 'react'

export default function ChatInput({ onSend, isLoading }) {
  const [input, setInput] = useState('')
  const textareaRef = useRef(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return
    onSend(input)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl px-4 py-3">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
            disabled={isLoading}
            className="w-full px-4 py-2.5 pr-10 rounded-2xl border border-gray-200 dark:border-gray-700
                       bg-gray-50 dark:bg-gray-800
                       focus:outline-none focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/20
                       focus:bg-white dark:focus:bg-gray-800
                       transition-all duration-200 text-sm resize-none
                       text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500
                       disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ maxHeight: '120px' }}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-ios-blue text-white flex items-center justify-center
                     hover:brightness-110 active:scale-[0.95] transition-all duration-150
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
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
}