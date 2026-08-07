import { useEffect } from 'react'
import PageShell from './PageShell'
import useStore from '../store/useStore'

export default function CharacterManagePage() {
  const { characters, currentCharacterId, setView, setCurrentCharacter } = useStore()

  const handleBack = () => {
    setView('chat')
  }

  const handleSelectCharacter = (char) => {
    setCurrentCharacter(char.id)
    setView('chat')
  }

  const handleCreateCharacter = () => {
    setView('create')
  }

  return (
    <PageShell
      title="角色管理"
      subtitle={`共 ${characters.length} 个角色`}
      onBack={handleBack}
      rightActions={
        <button
          onClick={handleCreateCharacter}
          className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
        >
          + 新建
        </button>
      }
    >
      <div className="space-y-3 pb-8">
        {characters.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">👤</div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">还没有任何角色</p>
            <button
              onClick={handleCreateCharacter}
              className="px-5 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
            >
              创建第一个角色
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {characters.map((char) => (
              <div
                key={char.id}
                className={`ios-card p-3 flex items-center gap-3 hover:scale-[1.01] active:scale-[0.99] transition-transform cursor-pointer ${
                  char.id === currentCharacterId ? 'ring-2 ring-indigo-500' : ''
                }`}
                onClick={() => handleSelectCharacter(char)}
              >
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400/20 to-purple-400/20 flex items-center justify-center flex-shrink-0">
                  {char.avatar ? (
                    <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-semibold text-indigo-500">
                      {char.name?.charAt(0) || '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{char.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{char.identity || 'AI 伙伴'}</p>
                  {char.worldview && (
                    <p className="text-xs text-indigo-500 truncate mt-0.5">
                      🌌 {char.worldview === 'star_rail' ? '星穹铁道' : char.worldview}
                    </p>
                  )}
                </div>
                {char.id === currentCharacterId && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300">
                    当前
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setView('edit', char.id)
                  }}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
