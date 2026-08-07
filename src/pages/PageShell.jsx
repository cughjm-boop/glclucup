import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import useStore from '../store/useStore'

export default function PageShell({ title, subtitle, children, onBack, rightActions }) {
  const { setView } = useStore()
  const [mounted, setMounted] = useState(false)

  const handleBack = () => {
    if (onBack) {
      console.log('[PageShell] handleBack -> 调用自定义 onBack')
      onBack()
    } else {
      console.log('[PageShell] handleBack -> 默认返回 chat 视图')
      setView('chat')
    }
  }

  useEffect(() => {
    setMounted(true)

    // 锁定背景滚动
    document.body.style.overflow = 'hidden'
    // 设置 body 属性，供 CSS 用于隐藏下层内容
    document.body.setAttribute('data-page-shell-open', 'true')

    console.log('[PageShell] 已挂载 → Portal 渲染到 body, z-index=9999')
    return () => {
      document.body.style.overflow = ''
      document.body.removeAttribute('data-page-shell-open')
      console.log('[PageShell] 已卸载 → Portal 已移除')
    }
  }, [])

  if (!mounted) {
    return null
  }

  const content = (
    <>
      {/* 全屏遮罩层，100% 覆盖所有下层元素 */}
      <div
        data-page-shell-mask
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        style={{
          zIndex: 9998,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100dvh',
        }}
        // 阻止透过遮罩误触下层元素
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      />
      {/* 记忆页面主内容 */}
      <div
        data-page-shell
        className="fixed inset-0 flex flex-col bg-[#f2f2f7] dark:bg-gray-950"
        style={{
          zIndex: 9999,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: 'var(--app-height, 100dvh)',
          boxShadow: 'inset 0 0 0 2px rgba(99, 102, 241, 0.6)',
        }}
      >
        <header className="flex-shrink-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 px-3 sm:px-4 py-2.5 sm:py-3 pt-safe">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleBack}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors flex-shrink-0"
              title="返回"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
              )}
            </div>

            {rightActions && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {rightActions}
              </div>
            )}
          </div>
        </header>

        <div
          className="flex-1 overflow-y-auto overflow-x-visible px-3 sm:px-4 py-3 sm:py-4 pb-safe"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </>
  )

  return createPortal(content, document.body)
}