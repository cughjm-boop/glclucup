export default function CharacterCard({ character, isActive, onClick, onEdit, onDelete }) {
  const avatarSrc = character.avatar
  const initial = character.name?.charAt(0) || '?'

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 text-left group ${
        isActive
          ? 'bg-ios-blue/10 dark:bg-ios-blue/20 ring-2 ring-ios-blue/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-[0.98]'
      }`}
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center">
        {avatarSrc ? (
          <img src={avatarSrc} alt={character.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-lg font-semibold text-ios-blue">{initial}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{character.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{character.identity || '未设定身份'}</p>
      </div>

      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <span
          onClick={(e) => { e.stopPropagation(); onEdit?.(character) }}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title="编辑"
        >
          <svg className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </span>
        <span
          onClick={(e) => { e.stopPropagation(); onDelete?.(character) }}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          title="删除"
        >
          <svg className="w-3.5 h-3.5 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </span>
      </div>
    </button>
  )
}