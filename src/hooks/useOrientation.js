import { useEffect, useState } from 'react'

/**
 * useOrientation — 屏幕方向检测 Hook
 * 使用 window.matchMedia('(orientation: landscape)') 检测横竖屏。
 * 返回 { isLandscape }，横屏为 true。
 *
 * 说明：只在视觉层（ChatLayout/VisualLayer）使用，不参与任何聊天逻辑。
 */
export default function useOrientation() {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(orientation: landscape)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined

    const mql = window.matchMedia('(orientation: landscape)')
    const handler = (e) => setIsLandscape(e.matches)

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
    } else if (typeof mql.addListener === 'function') {
      // 兼容旧浏览器
      mql.addListener(handler)
    }

    return () => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', handler)
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(handler)
      }
    }
  }, [])

  return { isLandscape }
}