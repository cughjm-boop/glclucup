import { useState } from 'react'
import { createPortal } from 'react-dom'
import useStore from '../store/useStore'
import { Z_INDEX } from './FloatingLayer'

// 记忆类别定义
const MEMORY_CATEGORIES = {
  personal_info: { label: '个人信息', icon: '👤', color: 'blue' },
  preferences: { label: '个人喜好', icon: '⭐', color: 'purple' },
  shared_property: { label: '共同财产', icon: '🏠', color: 'green' },
  shared_experience: { label: '共同经历', icon: '🌟', color: 'orange' },
  relationship: { label: '关系状态', icon: '💝', color: 'pink' },
}

const CATEGORY_OPTIONS = [
  { value: '', label: '无分类' },
  ...Object.entries(MEMORY_CATEGORIES).map(([value, info]) => ({
    value,
    label: `${info.icon} ${info.label}`,
  })),
]

function formatTime(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}`
}

// 分类标签颜色映射
const categoryColorClasses = {
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  pink: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800',
}

export default function MemoryManager({ character, onClose }) {
  const {
    memories,
    memorySummaries,
    addMemory,
    updateMemory,
    deleteMemory,
    clearMemories,
    updateMemorySummary,
  } = useStore()

  const charId = character.id
  const charMemories = memories[charId] || []
  const summary = memorySummaries[charId] || null
  const [showAdd, setShowAdd] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const [editingCategory, setEditingCategory] = useState('')
  const [updatingSummary, setUpdatingSummary] = useState(false)

  // 按类别分组
  const groupedMemories = charMemories.reduce((groups, mem) => {
    const catInfo = MEMORY_CATEGORIES[mem.category]
    const categoryName = catInfo ? catInfo.label : '其他'
    if (!groups[categoryName]) {
      groups[categoryName] = []
    }
    groups[categoryName].push(mem)
    return groups
  }, {})

  const handleAdd = () => {
    if (!newContent.trim()) return
    addMemory(charId, newContent.trim(), 'manual', newCategory)
    setNewContent('')
    setNewCategory('')
    setShowAdd(false)
  }

  const handleEdit = (id) => {
    const mem = charMemories.find((m) => m.id === id)
    if (mem) {
      setEditingId(id)
      setEditingContent(mem.content)
      setEditingCategory(mem.category || '')
    }
  }

  const handleSaveEdit = () => {
    if (!editingContent.trim()) return
    updateMemory(charId, editingId, { content: editingContent.trim(), category: editingCategory })
    setEditingId(null)
    setEditingContent('')
    setEditingCategory('')
  }

  const handleUpdateSummary = async () => {
    setUpdatingSummary(true)
    try {
      await updateMemorySummary(charId)
    } finally {
      setUpdatingSummary(false)
    }
  }

  const handleClearAll = () => {
    if (confirm('确定要清空所有记忆吗？此操作不可恢复。')) {
      clearMemories(charId)
    }
  }

  return createPortal(
    <div className="fixed inset-0 flex items-start justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm pt-safe animate-fade-in overflow-y-auto py-8" style={{ zIndex: Z_INDEX.DIALOG }}>
      <div className="fixed inset-0" style={{ zIndex: Z_INDEX.DIALOG - 1 }} onClick={onClose} />
      <div className="ios-card mx-4 w-full max-w-lg animate-bounce-in relative" style={{ zIndex: Z_INDEX.DIALOG }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center">
              {character?.avatar ? (
                <img src={character.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-ios-blue">
                  {character?.name?.charAt(0) || '?'}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                角色记忆
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {character?.name || '当前角色'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {/* Memory Summary */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                记忆摘要
              </h3>
              <button
                onClick={handleUpdateSummary}
                disabled={updatingSummary}
                className="text-xs text-ios-blue hover:underline disabled:opacity-50"
              >
                {updatingSummary ? '更新中...' : '更新摘要'}
              </button>
            </div>
            {summary ? (
              <div className="space-y-1">
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  {summary.content}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right">
                  更新于 {formatTime(summary.updatedAt)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                暂无记忆摘要。点击"更新摘要"让 AI 扫描对话生成。
              </p>
            )}
          </div>

          {/* Memory Items */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                记忆条目 ({charMemories.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAdd(!showAdd)}
                  className="text-xs font-medium text-ios-blue hover:underline"
                >
                  + 添加
                </button>
                {charMemories.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs font-medium text-red-500 hover:underline"
                  >
                    清空
                  </button>
                )}
              </div>
            </div>

            {/* Add form */}
            {showAdd && (
              <div className="mb-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="输入新的记忆条目，如：用户喜欢喝咖啡"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:border-ios-blue"
                />
                <div className="flex items-center gap-2 mt-2">
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:border-ios-blue"
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAdd}
                    disabled={!newContent.trim()}
                    className="px-3 py-1.5 rounded-lg bg-ios-blue text-white text-xs font-medium disabled:opacity-50"
                  >
                    添加
                  </button>
                  <button
                    onClick={() => { setShowAdd(false); setNewContent(''); setNewCategory('') }}
                    className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Memory list - grouped by category */}
            {charMemories.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                暂无记忆条目。AI 会在对话中自动提取，你也可以手动添加。
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedMemories).map(([categoryName, items]) => {
                  // 找到该类别对应的颜色
                  const catEntry = Object.entries(MEMORY_CATEGORIES).find(
                    ([, info]) => info.label === categoryName
                  )
                  const catColor = catEntry ? catEntry[1].color : 'gray'
                  const catIcon = catEntry ? catEntry[1].icon : '📌'

                  return (
                    <div key={categoryName}>
                      {/* Category header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">{catIcon}</span>
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {categoryName}
                        </h4>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          ({items.length})
                        </span>
                      </div>

                      <div className="space-y-2">
                        {[...items].reverse().map((mem) => (
                          <div
                            key={mem.id}
                            className="group p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                          >
                            {editingId === mem.id ? (
                              <div>
                                <textarea
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  rows={2}
                                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:border-ios-blue"
                                  autoFocus
                                />
                                <div className="flex items-center gap-2 mt-2">
                                  <select
                                    value={editingCategory}
                                    onChange={(e) => setEditingCategory(e.target.value)}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:border-ios-blue"
                                  >
                                    {CATEGORY_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={handleSaveEdit}
                                    disabled={!editingContent.trim()}
                                    className="px-3 py-1.5 rounded-lg bg-ios-blue text-white text-xs font-medium disabled:opacity-50"
                                  >
                                    保存
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed flex-1">
                                    {mem.content}
                                  </p>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                    <button
                                      onClick={() => handleEdit(mem.id)}
                                      className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => deleteMemory(charId, mem.id)}
                                      className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                  {(() => {
                                    const sourceInfo = {
                                      auto: { label: '自动提取', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
                                      manual: { label: '手动添加', class: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
                                      import: { label: '外部导入', class: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
                                      worldview: { label: '世界观', class: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
                                    }
                                    const info = sourceInfo[mem.source] || sourceInfo.manual
                                    return (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${info.class}`}>
                                        {info.label}
                                      </span>
                                    )
                                  })()}
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                    {formatTime(mem.createdAt)}
                                  </span>
                                  {mem.updatedAt !== mem.createdAt && (
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                      · 更新 {formatTime(mem.updatedAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-4">
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            记忆数据仅存储在本地，不同角色相互独立
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}