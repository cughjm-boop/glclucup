import { useEffect, useRef, useCallback } from 'react'
import PageShell from './PageShell'
import MemoryDashboard from '../components/MemoryDashboard'
import useStore from '../store/useStore'
import { useAndroidBackButton } from '../hooks/useAndroidBackButton'

export default function MemoryDashboardPage() {
  const { currentCharacterId, characters, memoryDashboardFilter, setMemoryDashboardFilter, setView, setFullScreenPageOpen, view } = useStore()
  const scrollRef = useRef(null)
  const mountTimeRef = useRef(Date.now())

  const currentChar = characters.find((c) => c.id === currentCharacterId)

  const handleBack = useCallback(() => {
    console.log('[MemoryDashboardPage] handleBack 触发，存活时长:', Date.now() - mountTimeRef.current, 'ms')
    setMemoryDashboardFilter(null)
    // 先释放全屏守卫，再切换视图
    setFullScreenPageOpen(false)
    try {
      setView('chat')
      console.log('[MemoryDashboardPage] 已 setView(chat)，回到聊天界面')
    } catch (e) {
      console.error('[MemoryDashboardPage] setView(chat) 失败:', e)
    }
  }, [setMemoryDashboardFilter, setView, setFullScreenPageOpen])

  // 安卓系统返回键支持
  useAndroidBackButton(handleBack)

  // 挂载时设置全屏守卫，防止意外视图切换
  useEffect(() => {
    setFullScreenPageOpen(true)
    console.log('[MemoryDashboardPage] 已设置 fullScreenPageOpen=true（视图守卫激活）')
  }, [setFullScreenPageOpen])

  // 调试：挂载/卸载 + 视图切换日志
  useEffect(() => {
    mountTimeRef.current = Date.now()
    console.log('[MemoryDashboardPage] ✅ 组件已挂载，view=', view, 'characterId=', currentCharacterId, 'timestamp=', mountTimeRef.current)

    return () => {
      const aliveMs = Date.now() - mountTimeRef.current
      console.log('[MemoryDashboardPage] ❌ 组件已卸载，存活时长:', aliveMs, 'ms', 'view=', view)
      if (aliveMs < 500) {
        console.warn('[MemoryDashboardPage] ⚠️ 异常快速卸载！可能原因：view 状态被意外重置。当前 view=', view)
        console.trace('[MemoryDashboardPage] 卸载调用栈:')
      }
    }
  }, [view, currentCharacterId])

  // 视图变成 memory-dashboard 时重置滚动
  useEffect(() => {
    if (view === 'memory-dashboard' && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [view, currentCharacterId])

  return (
    <PageShell
      title="记忆仪表盘"
      subtitle={currentChar ? `角色：${currentChar.name}` : undefined}
      onBack={handleBack}
    >
      <div ref={scrollRef}>
        <MemoryDashboard />
      </div>
    </PageShell>
  )
}