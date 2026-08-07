/**
 * useAndroidBackButton — 安卓系统返回键处理 Hook
 *
 * 在独立页面打开时，监听 popstate 事件（安卓返回键触发），
 * 执行传入的回调（返回聊天页）。
 *
 * 注意：不使用 history.pushState/back() 避免触发 Capacitor WebView 导航重置。
 */

import { useEffect, useRef } from 'react'

export function useAndroidBackButton(onBack: () => void) {
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // 阻止默认的浏览器返回行为
      e.preventDefault()
      console.log('[useAndroidBackButton] popstate 触发 → 执行 onBack')
      onBackRef.current()
    }

    window.addEventListener('popstate', handlePopState)

    console.log('[useAndroidBackButton] 已注册 popstate 监听')

    return () => {
      window.removeEventListener('popstate', handlePopState)
      console.log('[useAndroidBackButton] 已移除 popstate 监听')
    }
  }, [])
}