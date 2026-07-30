import { useEffect } from 'react'
import useStore from './store/useStore'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import CharacterForm from './components/CharacterForm'
import SettingsPanel from './components/SettingsPanel'
import ErrorToast from './components/ErrorToast'

export default function App() {
  const { view, error, clearError, initTheme } = useStore()

  useEffect(() => {
    initTheme()
  }, [initTheme])

  return (
    <div className="h-screen flex overflow-hidden bg-ios-bg dark:bg-gray-950">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatWindow />
      </main>
      {(view === 'create' || view === 'edit') && <CharacterForm />}
      {view === 'settings' && <SettingsPanel />}
      <ErrorToast error={error} onDismiss={clearError} />
    </div>
  )
}