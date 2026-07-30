import { useState } from 'react'
import CharacterCard from './CharacterCard'
import ConfirmDialog from './ConfirmDialog'
import useStore from '../store/useStore'

export default function Sidebar() {
  const {
    characters,
    currentCharacterId,
    setCurrentCharacter,
    setView,
    deleteCharacter,
  } = useStore()

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleEdit = (character) => {
    setView('edit', character.id)
  }

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteCharacter(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  return (
    <>
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-40 w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center" style={{ top: 'calc(1rem + var(--safe-area-inset-top, 0px))' }}
      >
        <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <aside
        className={`fixed lg:relative z-30 h-full w-80 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 pt-safe">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">AI 陪伴</h1>
            <button
              onClick={() => setView('settings')}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
              title="设置"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => setView('create')}
            className="w-full ios-button flex items-center justify-center gap-2 text-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            创建角色
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {characters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="text-5xl mb-3">🤖</div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">还没有角色</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">点击上方按钮创建你的第一个 AI 角色</p>
            </div>
          ) : (
            characters.map((char) => (
              <CharacterCard
                key={char.id}
                character={char}
                isActive={char.id === currentCharacterId}
                onClick={() => {
                  setCurrentCharacter(char.id)
                  setSidebarOpen(false)
                }}
                onEdit={handleEdit}
                onDelete={(c) => setDeleteTarget(c)}
              />
            ))
          )}
        </div>

        <div className="p-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            {characters.length} 个角色
          </p>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-20 bg-black/30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除角色"
          message={`确定要删除「${deleteTarget.name}」吗？与该角色的所有聊天记录也会被清除。`}
          confirmText="删除"
          danger
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}