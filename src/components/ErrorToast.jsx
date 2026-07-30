import { useState, useEffect } from 'react'

export default function ErrorToast({ error, onDismiss }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (error) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(onDismiss, 300)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, onDismiss])

  if (!error || !visible) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="flex items-center gap-3 px-5 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-2xl shadow-lg max-w-md">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-800/50 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
        <button
          onClick={() => { setVisible(false); setTimeout(onDismiss, 300) }}
          className="flex-shrink-0 text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}