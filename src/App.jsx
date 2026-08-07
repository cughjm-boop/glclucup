import { useEffect } from 'react'
import useStore from './store/useStore'
import { cleanupLegacyData } from './services/storage'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import CharacterForm from './components/CharacterForm'
import SettingsPanel from './components/SettingsPanel'
import ErrorToast from './components/ErrorToast'
import MemoryDashboardPage from './pages/MemoryDashboardPage'
import DatabaseCenterPageWrapper from './pages/DatabaseCenterPageWrapper'
import DeveloperToolsPage from './pages/DeveloperToolsPage'
import CharacterManagePage from './pages/CharacterManagePage'

export default function App() {
  const { view, error, clearError, initTheme } = useStore()

  useEffect(() => {
    initTheme()
    cleanupLegacyData()
  }, [initTheme])

  // Handle keyboard visibility for mobile WebView
  useEffect(() => {
    const visualViewport = window.visualViewport
    if (!visualViewport) return

    const handleResize = () => {
      const keyboardHeight = window.innerHeight - visualViewport.height
      document.documentElement.style.setProperty('--keyboard-height', `${Math.max(0, keyboardHeight)}px`)
      document.documentElement.style.setProperty('--app-height', `${visualViewport.height}px`)
    }

    visualViewport.addEventListener('resize', handleResize)
    handleResize()
    return () => visualViewport.removeEventListener('resize', handleResize)
  }, [])

  // 判断当前是否在全屏独立页面（记忆仪表盘、数据库中心等）
  const isFullScreenPage = view === 'memory-dashboard' || view === 'database-center'
  const isChatVisible = view === 'chat'

  return (
    <div className="h-full h-dvh flex overflow-hidden bg-[#f2f2f7] dark:bg-gray-950" style={{ height: 'var(--app-height, 100dvh)' }}>
      <Sidebar />
      {/* ChatWindow 始终挂载，保持状态不丢失；全屏页面打开时隐藏 */}
      <main
        className="flex-1 flex flex-col overflow-hidden min-w-0"
        style={{
          visibility: isChatVisible ? 'visible' : 'hidden',
          pointerEvents: isChatVisible ? 'auto' : 'none',
          position: isChatVisible ? 'relative' : 'absolute',
          opacity: isChatVisible ? 1 : 0,
        }}
      >
        <ChatWindow />
      </main>
      {view === 'create' && <CharacterForm />}
      {view === 'edit' && <CharacterForm />}
      {view === 'settings' && <SettingsPanel />}
      {view === 'memory-dashboard' && <MemoryDashboardPage />}
      {view === 'database-center' && <DatabaseCenterPageWrapper />}
      {view === 'developer-tools' && <DeveloperToolsPage />}
      {view === 'character-manage' && <CharacterManagePage />}
      <ErrorToast error={error} onDismiss={clearError} />
    </div>
  )
}