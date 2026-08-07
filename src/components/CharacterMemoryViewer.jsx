import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import useStore from '../store/useStore'
import { Z_INDEX } from './FloatingLayer'
import { downloadWithFallback, formatExportTime, formatExportDate, getDateStr, triggerShare, triggerClipboard } from '../utils/exportUtils'

// ============= 工具函数 =============
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}`
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ============= 记忆类别定义 =============
const MEMORY_CATEGORIES = {
  hobby: { label: '爱好', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
  experience: { label: '经历', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  relationship: { label: '关系', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800' },
  promise: { label: '承诺', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' },
  other: { label: '其他', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
  personal_info: { label: '个人信息', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800' },
  preferences: { label: '喜好', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
  shared_experience: { label: '经历', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  shared_property: { label: '财产', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' },
  user_expectation: { label: '用户期望', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
}

function getCategoryInfo(cat) {
  return MEMORY_CATEGORIES[cat] || MEMORY_CATEGORIES.other
}

const SOURCE_LABELS = {
  auto: '自动提取',
  manual: '手动添加',
  deep_reflection: '深度反思',
  import: '外部导入',
}

// ============= 情绪emoji映射 =============
const EMOTION_EMOJIS = {
  '快乐': '😊', '悲伤': '😢', '愤怒': '😠', '焦虑': '😰', '期待': '🤩',
  '平静': '😌', '疲惫': '😫', '沮丧': '😞', '兴奋': '🥳', '紧张': '😨',
  '满足': '😊', '孤独': '🥺', '喜悦': '😄', '幸福': '🥰', '感动': '🥲',
  '害怕': '😱', '惊讶': '😲', '厌恶': '🤢', '安心': '😌', '思念': '💭',
}

const EMOTION_INTENSITY_COLORS = {
  '高': 'bg-red-500', '中': 'bg-orange-400', '低': 'bg-yellow-400',
}

const TABS = [
  { id: 'impression', label: '对我的印象', icon: '📝' },
  { id: 'relationships', label: '关系图谱', icon: '🕸️' },
  { id: 'memories', label: '记忆条目', icon: '🧠' },
  { id: 'timeline', label: '事件时间线', icon: '📅' },
  { id: 'emotion', label: '情绪记录', icon: '💭' },
  { id: 'reflection', label: '深度反思', icon: '🔍' },
  { id: 'prediction', label: '预测与建议', icon: '🔮' },
  { id: 'sceneEvents', label: '场景事件', icon: '🎬' },
]

// ============= 强度颜色条 =============
function StrengthBar({ strength }) {
  const s = strength ?? 100
  let color = 'bg-green-500'
  if (s <= 30) color = 'bg-red-500'
  else if (s <= 60) color = 'bg-yellow-500'
  else if (s <= 80) color = 'bg-lime-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${s}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 w-7 text-right">{s}%</span>
    </div>
  )
}

// ============= 空状态 =============
function EmptyTab({ icon, text, subText }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm text-gray-400 dark:text-gray-500">{text}</p>
      {subText && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subText}</p>}
    </div>
  )
}

// ============= 确认对话框 =============
function ConfirmDialog({ title, message, onConfirm, onCancel, danger = false }) {
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center animate-fade-in" style={{ zIndex: Z_INDEX.DIALOG }} onClick={onCancel}>
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" style={{ zIndex: Z_INDEX.DIALOG - 1 }} />
      <div className="ios-card p-6 mx-4 max-w-sm w-full relative animate-bounce-in" style={{ zIndex: Z_INDEX.DIALOG }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            取消
          </button>
          <button onClick={onConfirm} className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-ios-blue hover:bg-blue-600'}`}>
            确认
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ============= 添加/编辑模态框 =============
function AddEditModal({ title, fields, initialValues, onSave, onClose }) {
  const [values, setValues] = useState(initialValues || {})

  const handleChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center animate-fade-in" style={{ zIndex: Z_INDEX.DIALOG }} onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" style={{ zIndex: Z_INDEX.DIALOG - 1 }} />
      <div className="ios-card mx-4 max-w-sm w-full animate-bounce-in p-4 relative" style={{ zIndex: Z_INDEX.DIALOG }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">{title}</h3>
        <div className="space-y-3">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{field.label}</label>
              {field.type === 'textarea' ? (
                <textarea
                  value={values[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={field.rows || 2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:border-ios-blue"
                />
              ) : field.type === 'select' ? (
                <select
                  value={values[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-ios-blue"
                >
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || 'text'}
                  value={values[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-ios-blue"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            取消
          </button>
          <button onClick={() => onSave(values)} className="flex-1 py-2 rounded-xl bg-ios-blue text-white text-sm font-medium hover:bg-blue-600 transition-colors">
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ============= 详情弹出卡片（Popover）- Portal 渲染 =============
function MemoryDetailPopover({ memory, anchorRect, onClose }) {
  const [visible, setVisible] = useState(false)
  const cardRef = useRef(null)
  const catInfo = getCategoryInfo(memory.category)
  const sourceLabel = SOURCE_LABELS[memory.source] || memory.source

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 100)
  }

  // 计算位置
  const style = useMemo(() => {
    if (!anchorRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    const CARD_W = 300
    const CARD_H = 280
    const gap = 8
    let left = anchorRect.left + anchorRect.width / 2 - CARD_W / 2
    let top = anchorRect.bottom + gap

    if (left < 8) left = 8
    if (left + CARD_W > window.innerWidth - 8) left = window.innerWidth - CARD_W - 8
    if (top + CARD_H > window.innerHeight - 8) top = anchorRect.top - CARD_H - gap
    if (top < 8) top = 8

    return { left, top }
  }, [anchorRect])

  return createPortal(
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0"
        style={{ zIndex: Z_INDEX.POPOVER - 1 }}
        onClick={handleClose}
      />
      {/* 卡片 */}
      <div
        ref={cardRef}
        className="fixed bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 w-[300px] max-w-[calc(100vw-16px)] select-none"
        style={{
          zIndex: Z_INDEX.POPOVER,
          ...style,
          opacity: visible ? 1 : 0,
          transform: `scale(${visible ? 1 : 0.95})`,
          transition: 'opacity 150ms ease-out, transform 150ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 分类标签 */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${catInfo.color}`}>
            {catInfo.label}
          </span>
          {memory.important && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-medium">⭐ 重要</span>
          )}
          {memory.confidence === 'low' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium italic">低可信度</span>
          )}
        </div>

        {/* 记忆内容 */}
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{memory.content}</p>

        {/* 详细信息 */}
        <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-100 dark:border-gray-700 pt-3">
          <div>
            <p className="text-gray-400 dark:text-gray-500">时间</p>
            <p className="text-gray-700 dark:text-gray-300">{formatTime(memory.createdAt)}</p>
          </div>
          <div>
            <p className="text-gray-400 dark:text-gray-500">来源</p>
            <p className="text-gray-700 dark:text-gray-300">{sourceLabel}</p>
          </div>
          <div>
            <p className="text-gray-400 dark:text-gray-500">可信度</p>
            <p className={`${memory.confidence === 'low' ? 'text-red-500' : 'text-green-500'}`}>
              {memory.confidence === 'low' ? '低' : memory.confidence === 'high' ? '高' : '正常'}
            </p>
          </div>
          <div>
            <p className="text-gray-400 dark:text-gray-500">记忆强度</p>
            <StrengthBar strength={memory.strength} />
          </div>
          {memory.updatedAt !== memory.createdAt && (
            <div className="col-span-2">
              <p className="text-gray-400 dark:text-gray-500">最后更新</p>
              <p className="text-gray-700 dark:text-gray-300">{formatTime(memory.updatedAt)}</p>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

// ============= 长按菜单 - Portal 渲染 =============
function LongPressMenu({ anchorRect, onEdit, onDelete, onToggleImportant, isImportant, onClose }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 100)
  }

  const style = useMemo(() => {
    if (!anchorRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    const MENU_W = 168
    const MENU_H = 140
    const gap = 4
    let left = anchorRect.left
    let top = anchorRect.bottom + gap

    if (left + MENU_W > window.innerWidth - 8) left = window.innerWidth - MENU_W - 8
    if (left < 8) left = 8
    if (top + MENU_H > window.innerHeight - 8) top = anchorRect.top - MENU_H - gap
    if (top < 8) top = 8

    return { left, top }
  }, [anchorRect])

  return createPortal(
    <>
      {/* 半透明遮罩 */}
      <div
        className="fixed inset-0 bg-black/30 dark:bg-black/60 transition-opacity duration-150"
        style={{ zIndex: Z_INDEX.MENU_OVERLAY, opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />
      {/* 菜单 */}
      <div
        className="fixed bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] select-none"
        style={{
          zIndex: Z_INDEX.MENU,
          ...style,
          opacity: visible ? 1 : 0,
          transform: `scale(${visible ? 1 : 0.95})`,
          transformOrigin: 'top left',
          transition: 'opacity 150ms ease-out, transform 150ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => { onEdit(); handleClose() }}
          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          编辑
        </button>
        <button
          onClick={() => { onToggleImportant(); handleClose() }}
          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill={isImportant ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" color={isImportant ? '#eab308' : undefined}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          {isImportant ? '取消重要' : '标记为重要'}
        </button>
        <button
          onClick={() => { onDelete(); handleClose() }}
          className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          删除
        </button>
      </div>
    </>,
    document.body
  )
}

// ============= 主组件 =============
export default function CharacterMemoryViewer({ character, onClose }) {
  const {
    memories,
    memorySummaries,
    enhancedMemories,
    emotionHistory,
    relationships,
    events,
    sceneEvents,
    addMemory,
    updateMemory,
    deleteMemory,
    toggleImportant,
    addRelationship,
    updateRelationship,
    deleteRelationship,
    addEvent,
    updateEvent,
    deleteEvent,
    addEmotionRecord,
    deleteEmotionRecord,
    deleteSceneEvent,
    globalSearchMemories,
    exportAllMemories,
    clearAllMemories,
  } = useStore()

  const charId = character.id
  const charMemories = useMemo(() => (memories[charId] || []).slice().sort((a, b) => b.createdAt - a.createdAt), [memories, charId])
  const charEmotions = useMemo(() => (emotionHistory[charId] || []).slice().sort((a, b) => b.createdAt - a.createdAt), [emotionHistory, charId])
  const charRels = useMemo(() => relationships[charId] || [], [relationships, charId])
  const charEvents = useMemo(() => (events[charId] || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)), [events, charId])
  const enhanced = useMemo(() => enhancedMemories[charId] || {}, [enhancedMemories, charId])
  const summary = memorySummaries[charId] || null
  const sortedSceneEvents = useMemo(() => (sceneEvents || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)), [sceneEvents])

  const [activeTab, setActiveTab] = useState('impression')
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [showConfirm, setShowConfirm] = useState(null)
  const [showAddModal, setShowAddModal] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [expandedItems, setExpandedItems] = useState({})
  const [memoryFilter, setMemoryFilter] = useState('all')
  const [memorySearch, setMemorySearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [expandedEvent, setExpandedEvent] = useState(null)
  const [selectedEmotionDay, setSelectedEmotionDay] = useState(null)
  const [showExportFormats, setShowExportFormats] = useState(false)
  const [exportResult, setExportResult] = useState(null) // { success, method, error }

  // ============= 全局搜索 =============
  const handleGlobalSearch = useCallback(() => {
    if (!searchKeyword.trim()) {
      setSearchResults(null)
      return
    }
    const results = globalSearchMemories(charId, searchKeyword.trim())
    setSearchResults(results)
  }, [searchKeyword, charId, globalSearchMemories])

  // ============= 导出 =============
  const handleExport = async (format) => {
    setShowExportFormats(false)
    const jsonData = exportAllMemories(charId)
    const data = JSON.parse(jsonData)
    const dateStr = getDateStr()
    const safeName = (character.name || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')

    let content, filename, mimeType

    try {
      if (format === 'json') {
        // JSON 格式：包含所有记忆条目，每条包含类别、内容、创建时间、来源、记忆强度
        content = JSON.stringify({
          characterName: character.name,
          exportedAt: formatExportTime(Date.now()),
          memoryCount: data.memories.length,
          memories: data.memories.map((m) => ({
            category: m.category || 'other',
            categoryLabel: getCategoryInfo(m.category).label,
            content: m.content,
            createdAt: formatExportTime(m.createdAt),
            updatedAt: formatExportTime(m.updatedAt),
            source: m.source || 'manual',
            sourceLabel: SOURCE_LABELS[m.source] || m.source,
            strength: m.strength ?? 100,
            important: m.important || false,
          })),
          relationshipCount: data.relationships.length,
          relationships: data.relationships,
          eventCount: data.events.length,
          events: data.events.map((e) => ({
            date: e.date,
            description: e.description,
          })),
          memorySummary: data.memorySummary,
        }, null, 2)
        filename = `${safeName}_记忆_${dateStr}.json`
        mimeType = 'application/json'
      } else {
        // TXT 格式：按类别分组展示
        const lines = []
        lines.push(`=== ${character.name} 记忆数据 ===`)
        lines.push(`导出时间: ${formatExportTime(Date.now())}`)
        lines.push(`记忆条目: ${data.memories.length} 条`)
        lines.push('')

        // 按类别分组
        const grouped = {}
        data.memories.forEach((m) => {
          const cat = m.category || 'other'
          if (!grouped[cat]) grouped[cat] = []
          grouped[cat].push(m)
        })

        const categoryOrder = ['personal_info', 'hobby', 'preferences', 'experience', 'shared_experience', 'relationship', 'promise', 'shared_property', 'other']
        const orderedCategories = [...new Set([...categoryOrder.filter((c) => grouped[c]), ...Object.keys(grouped).filter((c) => !categoryOrder.includes(c))])]

        orderedCategories.forEach((cat) => {
          const catLabel = getCategoryInfo(cat).label
          const items = grouped[cat] || []
          lines.push(`--- ${catLabel} (${items.length}条) ---`)
          items.forEach((m) => {
            const sourceLabel = SOURCE_LABELS[m.source] || m.source || '手动添加'
            lines.push(`【${catLabel}】${m.content}（创建于 ${formatExportTime(m.createdAt)}，来源：${sourceLabel}，强度：${m.strength ?? 100}%）`)
          })
          lines.push('')
        })

        // 关系图谱
        if (data.relationships.length > 0) {
          lines.push(`--- 关系图谱 (${data.relationships.length}人) ---`)
          data.relationships.forEach((r) => {
            lines.push(`  ${r.name}: ${r.relation}${r.note ? '（' + r.note + '）' : ''}`)
          })
          lines.push('')
        }

        // 事件时间线
        if (data.events.length > 0) {
          lines.push(`--- 事件时间线 (${data.events.length}个) ---`)
          data.events.forEach((e) => {
            lines.push(`  ${formatExportDate(e.date)}: ${e.description}`)
          })
          lines.push('')
        }

        content = lines.join('\n')
        filename = `${safeName}_记忆_${dateStr}.txt`
        mimeType = 'text/plain;charset=utf-8'
      }

      const result = await downloadWithFallback(content, filename, mimeType, {
        label: '记忆',
      })
      setExportResult(result)
    } catch (err) {
      const errorMsg = err.message || '文件写入失败'
      setExportResult({ success: false, error: errorMsg })
    }
  }

  const handleShareExport = async () => {
    // 触发分享（使用已导出的内容）
    const jsonData = exportAllMemories(charId)
    const data = JSON.parse(jsonData)
    const dateStr = getDateStr()
    const safeName = (character.name || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')
    const content = JSON.stringify({
      characterName: character.name,
      exportedAt: formatExportTime(Date.now()),
      memories: data.memories.map((m) => ({
        category: getCategoryInfo(m.category).label,
        content: m.content,
        createdAt: formatExportTime(m.createdAt),
        source: SOURCE_LABELS[m.source] || m.source,
        strength: m.strength ?? 100,
      })),
    }, null, 2)
    await triggerShare(content, `${safeName}_记忆_${dateStr}.json`, 'application/json')
  }

  const handleClipboardCopy = async () => {
    const jsonData = exportAllMemories(charId)
    await triggerClipboard(jsonData)
  }

  // ============= 清空所有 =============
  const handleClearAll = () => {
    setShowConfirm({
      title: '清空所有记忆',
      message: `确定要清空「${character.name}」的所有记忆数据吗？包括记忆条目、关系图谱、事件时间线、情绪记录等。此操作不可恢复。`,
      onConfirm: () => {
        clearAllMemories(charId)
        setShowConfirm(null)
      },
    })
  }

  // ============= 添加记忆 =============
  const handleOpenAddMemory = () => {
    setShowAddModal({
      title: '添加新记忆',
      fields: [
        { key: 'content', label: '记忆内容', type: 'textarea', placeholder: '输入记忆内容...', rows: 3 },
        { key: 'category', label: '记忆类别', type: 'select', options: [
          { value: 'hobby', label: '爱好' },
          { value: 'experience', label: '经历' },
          { value: 'relationship', label: '关系' },
          { value: 'promise', label: '承诺' },
          { value: 'character_info', label: '角色信息' },
          { value: 'other', label: '其他' },
        ]},
      ],
      onSave: (values) => {
        if (!values.content?.trim()) return
        // 如涉及角色自身设定，弹出确认提示
        if (values.category === 'character_info') {
          setShowAddModal(null)
          setShowConfirm({
            title: '角色信息记忆',
            message: '该内容可能与官方设定冲突，确定添加吗？添加后标记为低可信度。',
            onConfirm: () => {
              addMemory(charId, values.content.trim(), 'manual', values.category || 'other')
              setShowConfirm(null)
            },
            onCancel: () => setShowConfirm(null),
          })
          return
        }
        addMemory(charId, values.content.trim(), 'manual', values.category || 'other')
        setShowAddModal(null)
      },
    })
  }

  const handleOpenAddRelationship = () => {
    setShowAddModal({
      title: '添加人物节点',
      fields: [
        { key: 'name', label: '人物名称', placeholder: '如：张三' },
        { key: 'relation', label: '与用户的关系', placeholder: '如：好朋友、同事' },
        { key: 'note', label: '备注', type: 'textarea', placeholder: '相关事件或补充信息...', rows: 2 },
      ],
      onSave: (values) => {
        if (!values.name?.trim() || !values.relation?.trim()) return
        addRelationship(charId, { name: values.name.trim(), relation: values.relation.trim(), note: values.note?.trim() || '', events: [] })
        setShowAddModal(null)
      },
    })
  }

  const handleOpenAddEvent = () => {
    setShowAddModal({
      title: '添加事件',
      fields: [
        { key: 'date', label: '日期', type: 'date', placeholder: '' },
        { key: 'description', label: '事件描述', type: 'textarea', placeholder: '如：第一次见面...', rows: 2 },
      ],
      onSave: (values) => {
        if (!values.description?.trim() || !values.date) return
        addEvent(charId, { date: values.date, description: values.description.trim(), relatedMemoryIds: [] })
        setShowAddModal(null)
      },
    })
  }

  const handleOpenAddEmotion = () => {
    setShowAddModal({
      title: '添加情绪记录',
      fields: [
        { key: 'date', label: '日期', type: 'date', placeholder: '' },
        { key: 'emotion', label: '情绪', type: 'select', options: Object.keys(EMOTION_EMOJIS).map((k) => ({ value: k, label: `${EMOTION_EMOJIS[k]} ${k}` })) },
        { key: 'intensity', label: '强度', type: 'select', options: [{ value: '高', label: '高' }, { value: '中', label: '中' }, { value: '低', label: '低' }] },
        { key: 'trigger', label: '触发原因', placeholder: '如：工作压力大' },
        { key: 'keywords', label: '关键词（逗号分隔）', placeholder: '如：焦虑, 工作, 失眠' },
      ],
      onSave: (values) => {
        if (!values.emotion || !values.date) return
        addEmotionRecord(charId, {
          date: values.date,
          emotion: values.emotion,
          intensity: values.intensity || '中',
          trigger: values.trigger || '',
          keywords: values.keywords ? values.keywords.split(',').map((k) => k.trim()).filter(Boolean) : [],
        })
        setShowAddModal(null)
      },
    })
  }

  // ============= 编辑 =============
  const handleStartEdit = (item) => {
    setEditItem(item)
  }

  const handleSaveEdit = (updates) => {
    if (editItem.type === 'memory') {
      updateMemory(charId, editItem.id, updates)
    } else if (editItem.type === 'relationship') {
      updateRelationship(charId, editItem.id, updates)
    } else if (editItem.type === 'event') {
      updateEvent(charId, editItem.id, updates)
    }
    setEditItem(null)
  }

  const handleDelete = (type, id) => {
    setShowConfirm({
      title: '确认删除',
      message: '确定要删除这条记录吗？此操作不可恢复。',
      onConfirm: () => {
        if (type === 'memory') deleteMemory(charId, id)
        else if (type === 'relationship') deleteRelationship(charId, id)
        else if (type === 'event') deleteEvent(charId, id)
        else if (type === 'emotion') deleteEmotionRecord(charId, id)
        setShowConfirm(null)
      },
    })
  }

  // ============= 筛选记忆 =============
  const filteredMemories = useMemo(() => {
    let list = charMemories
    if (memoryFilter === 'high_confidence') {
      list = list.filter((m) => m.confidence !== 'low')
    } else if (memoryFilter === 'low_confidence') {
      list = list.filter((m) => m.confidence === 'low')
    } else if (memoryFilter !== 'all') {
      list = list.filter((m) => m.category === memoryFilter)
    }
    if (memorySearch.trim()) {
      const lower = memorySearch.toLowerCase()
      list = list.filter((m) => m.content.toLowerCase().includes(lower))
    }
    return list
  }, [charMemories, memoryFilter, memorySearch])

  // ============= 情绪热力图数据 =============
  const emotionHeatmap = useMemo(() => {
    const map = {}
    charEmotions.forEach((e) => {
      const date = e.date || formatDate(e.createdAt)
      if (!map[date]) map[date] = []
      map[date].push(e)
    })
    return map
  }, [charEmotions])

  // ============= 深度反思列表 =============
  const reflectionHistory = useMemo(() => {
    const list = []
    if (enhanced.deepReflection) {
      list.push({ ...enhanced.deepReflection, type: 'deepReflection', label: '深度反思' })
    }
    if (enhanced.monologue) {
      list.push({ ...enhanced.monologue, type: 'monologue', label: '内心独白' })
    }
    if (enhanced.associationNetwork) {
      list.push({ ...enhanced.associationNetwork, type: 'associationNetwork', label: '关联网络' })
    }
    list.sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0))
    return list
  }, [enhanced])

  const hasAnyData = charMemories.length > 0 || charRels.length > 0 || charEvents.length > 0 || charEmotions.length > 0 || Object.keys(enhanced).length > 0 || sortedSceneEvents.length > 0

  // ============= 渲染 =============
  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-gray-950 animate-fade-in" style={{ zIndex: Z_INDEX.MEMORY_CARD + 30 }}>
      {/* Header */}
      <div className="flex-shrink-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 px-4 py-3 pt-safe">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">角色记忆</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{character.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowGlobalSearch(!showGlobalSearch); setSearchKeyword(''); setSearchResults(null) }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${showGlobalSearch ? 'bg-ios-blue text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button onClick={handleOpenAddMemory} className="w-8 h-8 rounded-full bg-ios-blue text-white flex items-center justify-center hover:bg-blue-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Global search bar */}
        {showGlobalSearch && (
          <div className="mt-2 flex gap-2">
            <input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGlobalSearch()}
              placeholder="搜索所有记忆、关系、事件..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-ios-blue"
              autoFocus
            />
            <button onClick={handleGlobalSearch} className="px-4 py-2 rounded-lg bg-ios-blue text-white text-sm font-medium hover:bg-blue-600 transition-colors">
              搜索
            </button>
          </div>
        )}

        {/* Global search results */}
        {searchResults && (
          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl bg-gray-50 dark:bg-gray-800 p-2 space-y-1 text-xs" style={{ zIndex: Z_INDEX.SEARCH_DROPDOWN, position: 'relative' }}>
            {searchResults.memories.length === 0 && searchResults.reflections.length === 0 && searchResults.emotions.length === 0 && searchResults.relationships.length === 0 && searchResults.events.length === 0 && (
              <p className="text-gray-400 dark:text-gray-500 text-center py-2">未找到匹配结果</p>
            )}
            {searchResults.memories.map((m) => (
              <div key={m.id} className="p-2 rounded-lg bg-white dark:bg-gray-900 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setActiveTab('memories'); setShowGlobalSearch(false); setSearchResults(null) }}>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full mr-1.5 font-medium border ${getCategoryInfo(m.category).color}">{getCategoryInfo(m.category).label}</span>
                <span className="text-gray-600 dark:text-gray-400">{m.content}</span>
              </div>
            ))}
            {searchResults.relationships.map((r) => (
              <div key={r.id} className="p-2 rounded-lg bg-white dark:bg-gray-900 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setActiveTab('relationships'); setSelectedPerson(r); setShowGlobalSearch(false); setSearchResults(null) }}>
                <span className="font-medium text-gray-700 dark:text-gray-300">{r.name}</span>
                <span className="text-gray-400 ml-2">— {r.relation}</span>
              </div>
            ))}
            {searchResults.events.map((e) => (
              <div key={e.id} className="p-2 rounded-lg bg-white dark:bg-gray-900 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setActiveTab('timeline'); setShowGlobalSearch(false); setSearchResults(null) }}>
                <span className="text-gray-400">{formatDate(e.date)}</span>
                <span className="text-gray-600 dark:text-gray-400 ml-2">{e.description}</span>
              </div>
            ))}
            {searchResults.emotions.map((e) => (
              <div key={e.id} className="p-2 rounded-lg bg-white dark:bg-gray-900 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setActiveTab('emotion'); setShowGlobalSearch(false); setSearchResults(null) }}>
                <span>{EMOTION_EMOJIS[e.emotion] || ''}</span>
                <span className="text-gray-600 dark:text-gray-400 ml-1">{e.emotion}</span>
                <span className="text-gray-400 ml-2">{formatDate(e.date || e.createdAt)}</span>
              </div>
            ))}
            {searchResults.reflections.map((r, i) => (
              <div key={i} className="p-2 rounded-lg bg-white dark:bg-gray-900 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setActiveTab('reflection'); setShowGlobalSearch(false); setSearchResults(null) }}>
                <span className="text-gray-600 dark:text-gray-400">{r.label || '反思记录'}</span>
                <span className="text-gray-400 ml-2">{formatTime(r.generatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-hide">
        <div className="flex px-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-xs font-medium whitespace-nowrap px-2 transition-colors relative ${
                activeTab === tab.id
                  ? 'text-ios-blue'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-ios-blue rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-visible">
        {!hasAnyData ? (
          <EmptyTab icon="📭" text="暂无记忆数据" subText="继续聊天，AI 会自动提取和生成记忆。你也可以手动添加记忆条目。" />
        ) : (
          <>
            {/* Tab 1: 对我的印象 */}
            {activeTab === 'impression' && (
              <ImpressionTab
                character={character}
                summary={summary}
                enhanced={enhanced}
                charMemories={charMemories}
                onEdit={handleStartEdit}
                onDelete={handleDelete}
                onSaveEdit={handleSaveEdit}
                editItem={editItem}
                setEditItem={setEditItem}
              />
            )}

            {/* Tab 2: 关系图谱 */}
            {activeTab === 'relationships' && (
              <RelationshipTab
                charRels={charRels}
                enhanced={enhanced}
                selectedPerson={selectedPerson}
                onSelectPerson={setSelectedPerson}
                onEdit={handleStartEdit}
                onDelete={handleDelete}
                onSaveEdit={handleSaveEdit}
                editItem={editItem}
                setEditItem={setEditItem}
                onAdd={handleOpenAddRelationship}
                charMemories={charMemories}
              />
            )}

            {/* Tab 3: 记忆条目 */}
            {activeTab === 'memories' && (
              <MemoriesTab
                charId={charId}
                charMemories={charMemories}
                filteredMemories={filteredMemories}
                memoryFilter={memoryFilter}
                setMemoryFilter={setMemoryFilter}
                memorySearch={memorySearch}
                setMemorySearch={setMemorySearch}
                expandedItems={expandedItems}
                setExpandedItems={setExpandedItems}
                onEdit={handleStartEdit}
                onDelete={handleDelete}
                onSaveEdit={handleSaveEdit}
                editItem={editItem}
                setEditItem={setEditItem}
                onToggleImportant={toggleImportant}
                onAdd={handleOpenAddMemory}
              />
            )}

            {/* Tab 4: 事件时间线 */}
            {activeTab === 'timeline' && (
              <TimelineTab
                charEvents={charEvents}
                charMemories={charMemories}
                expandedEvent={expandedEvent}
                setExpandedEvent={setExpandedEvent}
                onEdit={handleStartEdit}
                onDelete={handleDelete}
                onSaveEdit={handleSaveEdit}
                editItem={editItem}
                setEditItem={setEditItem}
                onAdd={handleOpenAddEvent}
              />
            )}

            {/* Tab 5: 情绪记录 */}
            {activeTab === 'emotion' && (
              <EmotionTab
                charEmotions={charEmotions}
                emotionHeatmap={emotionHeatmap}
                selectedEmotionDay={selectedEmotionDay}
                setSelectedEmotionDay={setSelectedEmotionDay}
                onDelete={handleDelete}
                onAdd={handleOpenAddEmotion}
              />
            )}

            {/* Tab 6: 深度反思记录 */}
            {activeTab === 'reflection' && (
              <ReflectionTab
                enhanced={enhanced}
                reflectionHistory={reflectionHistory}
                character={character}
              />
            )}

            {/* Tab 7: 预测与建议 */}
            {activeTab === 'prediction' && (
              <PredictionTab
                enhanced={enhanced}
                charMemories={charMemories}
              />
            )}

            {/* Tab 8: 场景事件 */}
            {activeTab === 'sceneEvents' && (
              <SceneEventsTab
                sceneEvents={sortedSceneEvents}
                characterName={character.name}
                onDelete={(eventId) => {
                  setShowConfirm({
                    title: '删除场景事件',
                    message: '确定要删除这条场景事件记录吗？此操作不可恢复。',
                    onConfirm: () => {
                      deleteSceneEvent(eventId)
                      setShowConfirm(null)
                    },
                  })
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 px-4 py-3 pb-safe">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <button
                onClick={() => setShowExportFormats(!showExportFormats)}
                className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                导出记忆
              </button>
              {showExportFormats && (
                <div className="absolute bottom-full left-0 mb-2 w-full animate-fade-in">
                  <div className="ios-card p-1 space-y-0.5 shadow-lg">
                    <button
                      onClick={() => handleExport('json')}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono">JSON</span>
                      <span>JSON 格式</span>
                    </button>
                    <button
                      onClick={() => handleExport('txt')}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono">TXT</span>
                      <span>TXT 文本格式</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleClearAll}
              className="flex-1 py-2.5 rounded-xl border border-red-200 dark:border-red-900/30 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
            >
              清空记忆
            </button>
          </div>

          {/* 移动端备选方案：分享和剪贴板 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleShareExport}
              className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              分享
            </button>
            <button
              onClick={handleClipboardCopy}
              className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              复制
            </button>
          </div>
        </div>

        {/* 导出错误提示 */}
        {exportResult && !exportResult.success && (
          <div className="mt-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 animate-fade-in">
            导出失败：{exportResult.error || '未知错误'}
          </div>
        )}
      </div>

      {/* Modals */}
      {showConfirm && (
        <ConfirmDialog
          title={showConfirm.title}
          message={showConfirm.message}
          onConfirm={showConfirm.onConfirm}
          onCancel={() => setShowConfirm(null)}
          danger={showConfirm.title.includes('清空')}
        />
      )}
      {showAddModal && (
        <AddEditModal
          title={showAddModal.title}
          fields={showAddModal.fields}
          onSave={showAddModal.onSave}
          onClose={() => setShowAddModal(null)}
        />
      )}
      {editItem && editItem.type === 'memory' && (
        <AddEditModal
          title="编辑记忆"
          fields={[
            { key: 'content', label: '记忆内容', type: 'textarea', placeholder: '输入记忆内容...', rows: 3 },
            { key: 'category', label: '记忆类别', type: 'select', options: [
              { value: 'hobby', label: '爱好' },
              { value: 'experience', label: '经历' },
              { value: 'relationship', label: '关系' },
              { value: 'promise', label: '承诺' },
              { value: 'other', label: '其他' },
              { value: 'personal_info', label: '个人信息' },
              { value: 'preferences', label: '喜好' },
              { value: 'shared_experience', label: '共同经历' },
              { value: 'shared_property', label: '共同财产' },
              { value: 'character_info', label: '角色信息' },
            ]},
            { key: 'strength', label: '记忆强度 (0-100)', type: 'number', placeholder: '100' },
          ]}
          initialValues={{ content: editItem.content, category: editItem.category || '', strength: String(editItem.strength ?? 100) }}
          onSave={(values) => {
            handleSaveEdit({ content: values.content, category: values.category, strength: Number(values.strength) || 100 })
          }}
          onClose={() => setEditItem(null)}
        />
      )}
      {editItem && editItem.type === 'relationship' && (
        <AddEditModal
          title="编辑人物"
          fields={[
            { key: 'name', label: '人物名称', placeholder: '如：张三' },
            { key: 'relation', label: '与用户的关系', placeholder: '如：好朋友' },
            { key: 'note', label: '备注', type: 'textarea', placeholder: '相关事件...', rows: 2 },
          ]}
          initialValues={{ name: editItem.name, relation: editItem.relation, note: editItem.note || '' }}
          onSave={(values) => handleSaveEdit(values)}
          onClose={() => setEditItem(null)}
        />
      )}
      {editItem && editItem.type === 'event' && (
        <AddEditModal
          title="编辑事件"
          fields={[
            { key: 'date', label: '日期', type: 'date' },
            { key: 'description', label: '事件描述', type: 'textarea', placeholder: '事件描述...', rows: 2 },
          ]}
          initialValues={{ date: editItem.date || '', description: editItem.description }}
          onSave={(values) => handleSaveEdit(values)}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  )
}

// ============= Tab 1: 对我的印象 =============
function ImpressionTab({ character, summary, enhanced, charMemories, onEdit, onDelete, onSaveEdit, editItem, setEditItem }) {
  const deepReflection = enhanced.deepReflection
  const personalityModel = deepReflection?.personality_model || {}

  const impressionItems = []

  // 名字/称呼
  const nameMemories = charMemories.filter((m) => m.category === 'personal_info' && (m.content.includes('叫') || m.content.includes('名字') || m.content.includes('称呼')))
  if (nameMemories.length > 0) {
    impressionItems.push({
      id: 'name',
      label: '名字 / 称呼',
      items: nameMemories,
    })
  }

  // 性格分析
  if (personalityModel.mbti_likely) {
    impressionItems.push({
      id: 'mbti',
      label: 'MBTI 类型',
      value: personalityModel.mbti_likely,
      source: 'AI 生成',
      updatedAt: deepReflection.generatedAt,
    })
  }
  if (personalityModel.attachment_style) {
    impressionItems.push({
      id: 'attachment',
      label: '依恋类型',
      value: personalityModel.attachment_style,
      source: 'AI 生成',
      updatedAt: deepReflection.generatedAt,
    })
  }
  if (personalityModel.values?.length > 0) {
    impressionItems.push({
      id: 'values',
      label: '价值观',
      value: personalityModel.values.join('、'),
      source: 'AI 生成',
      updatedAt: deepReflection.generatedAt,
    })
  }
  if (personalityModel.deep_needs?.length > 0) {
    impressionItems.push({
      id: 'needs',
      label: '深层需求',
      value: personalityModel.deep_needs.join('、'),
      source: 'AI 生成',
      updatedAt: deepReflection.generatedAt,
    })
  }
  if (personalityModel.life_stage) {
    impressionItems.push({
      id: 'life_stage',
      label: '人生阶段',
      value: personalityModel.life_stage,
      source: 'AI 生成',
      updatedAt: deepReflection.generatedAt,
    })
  }

  // 总结性评价
  if (deepReflection?.user_summary) {
    impressionItems.push({
      id: 'summary',
      label: '角色对你的评价',
      value: deepReflection.user_summary,
      source: 'AI 生成',
      updatedAt: deepReflection.generatedAt,
    })
  }

  // 记忆摘要
  if (summary) {
    impressionItems.push({
      id: 'memory_summary',
      label: '记忆摘要',
      value: summary.content,
      source: 'AI 生成',
      updatedAt: summary.updatedAt,
    })
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400 dark:text-gray-500">共 {impressionItems.length} 条印象</span>
      </div>

      {impressionItems.length === 0 ? (
        <EmptyTab icon="📝" text="暂无印象数据" subText="继续聊天，AI 深度反思后会自动生成对你的认知印象。" />
      ) : (
        <div className="space-y-3">
          {impressionItems.map((item) => (
            <div key={item.id} className="ios-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{item.label}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      item.source === 'AI 生成'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    }`}>
                      {item.source}
                    </span>
                  </div>
                  {item.items ? (
                    <div className="space-y-1">
                      {item.items.map((m) => (
                        <div key={m.id} className="flex items-start justify-between gap-2 group">
                          <p className="text-sm text-gray-700 dark:text-gray-300">{m.content}</p>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => onEdit({ ...m, type: 'memory' })} className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => onDelete('memory', m.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{item.value}</p>
                  )}
                  {item.updatedAt && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                      更新于 {formatTime(item.updatedAt)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* 用户手动添加的印象信息 */}
          <div className="ios-card p-4 border-dashed border-2 border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              以上印象由 AI 自动生成。你可以手动添加记忆条目来完善角色对你的认知。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ============= Tab 2: 关系图谱 =============
function RelationshipTab({ charRels, enhanced, selectedPerson, onSelectPerson, onEdit, onDelete, onSaveEdit, editItem, setEditItem, onAdd, charMemories }) {
  const networkData = enhanced.associationNetwork?.people_network || []

  // 合并从增强记忆和手动添加的人物
  const allPeople = [...charRels]
  networkData.forEach((np) => {
    if (!allPeople.find((p) => p.name === np.name)) {
      allPeople.push({ id: np.name, name: np.name, relation: np.relation, note: '', events: [], source: 'AI 生成' })
    }
  })

  // 从记忆中提取提到的人物
  const mentionedPeople = charMemories
    .filter((m) => m.category === 'relationship')
    .map((m) => ({ id: m.id, name: m.content.replace(/^与|的关系.*$/g, ''), relation: m.content, source: '记忆提取' }))

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500">共 {allPeople.length} 人</span>
        <button onClick={onAdd} className="text-xs font-medium text-ios-blue hover:underline">+ 添加人物</button>
      </div>

      {allPeople.length === 0 && mentionedPeople.length === 0 ? (
        <EmptyTab icon="🕸️" text="暂无关系数据" subText="继续聊天或手动添加人物节点来构建关系图谱。" />
      ) : (
        <>
          {/* 可视化：中心节点 + 周围节点 */}
          <div className="ios-card p-4 flex items-center justify-center min-h-[200px]">
            <div className="relative w-full max-w-[280px] aspect-square">
              {/* 中心节点 - 用户 */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-gradient-to-br from-ios-blue to-purple-500 flex items-center justify-center text-white text-sm font-bold shadow-lg z-10">
                我
              </div>
              {/* 周围节点 */}
              {allPeople.slice(0, 8).map((person, i) => {
                const angle = (i / Math.min(allPeople.length, 8)) * 2 * Math.PI - Math.PI / 2
                const radius = 40
                const x = 50 + radius * Math.cos(angle)
                const y = 50 + radius * Math.sin(angle)
                const colors = ['from-pink-400 to-rose-500', 'from-purple-400 to-indigo-500', 'from-blue-400 to-cyan-500', 'from-green-400 to-teal-500', 'from-yellow-400 to-orange-500', 'from-red-400 to-pink-500', 'from-indigo-400 to-blue-500', 'from-teal-400 to-green-500']
                return (
                  <div key={person.id || i}>
                    {/* 连线 */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                      <line x1="50%" y1="50%" x2={`${x}%`} y2={`${y}%`} stroke="currentColor" strokeWidth="1" className="text-gray-300 dark:text-gray-600" strokeDasharray="4,2" />
                    </svg>
                    {/* 节点 */}
                    <button
                      className={`absolute w-12 h-12 rounded-full bg-gradient-to-br ${colors[i % colors.length]} flex items-center justify-center text-white text-xs font-medium shadow-md hover:scale-110 transition-transform z-10`}
                      style={{ left: `calc(${x}% - 24px)`, top: `calc(${y}% - 24px)` }}
                      onClick={() => onSelectPerson(person)}
                      title={person.name}
                    >
                      {person.name.charAt(0)}
                    </button>
                    {/* 标签 */}
                    <div className="absolute text-[10px] text-gray-500 dark:text-gray-400 text-center w-16" style={{ left: `calc(${x}% - 32px)`, top: `calc(${y}% + 28px)`, zIndex: 1 }}>
                      {person.name}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 人物列表 */}
          <div className="space-y-2">
            {allPeople.map((person) => (
              <div key={person.id} className="ios-card p-3">
                <div className="flex items-center justify-between">
                  <button
                    className="flex-1 flex items-center gap-3 text-left"
                    onClick={() => onSelectPerson(selectedPerson?.id === person.id ? null : person)}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center text-lg flex-shrink-0">
                      👤
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{person.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{person.relation}</p>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${selectedPerson?.id === person.id ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => onEdit({ ...person, type: 'relationship' })} className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => onDelete('relationship', person.id)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                {/* 展开详情 */}
                {selectedPerson?.id === person.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2 animate-fade-in">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400 dark:text-gray-500">关系</p>
                        <p className="text-gray-700 dark:text-gray-300">{person.relation}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 dark:text-gray-500">来源</p>
                        <p className="text-gray-700 dark:text-gray-300">{person.source || '手动添加'}</p>
                      </div>
                    </div>
                    {person.note && (
                      <div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">备注</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{person.note}</p>
                      </div>
                    )}
                    {person.events?.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">相关事件</p>
                        <div className="space-y-1">
                          {person.events.map((evt, i) => (
                            <p key={i} className="text-sm text-gray-600 dark:text-gray-400">• {evt}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============= Tab 3: 记忆条目 =============
function MemoriesTab({ charId, charMemories, filteredMemories, memoryFilter, setMemoryFilter, memorySearch, setMemorySearch, expandedItems, setExpandedItems, onEdit, onDelete, onSaveEdit, editItem, setEditItem, onToggleImportant, onAdd }) {
  const [longPressTarget, setLongPressTarget] = useState(null) // { memory, rect }
  const [detailTarget, setDetailTarget] = useState(null) // { memory, rect }
  const longPressTimer = useRef(null)
  const longPressTriggered = useRef(false)
  // Item 67: 记忆库时间线虚拟滚动（sentinel 懒加载，与 ChatWindow 方案一致）
  const [visibleCount, setVisibleCount] = useState(50)
  const sentinelRef = useRef(null)
  const isLoadingMoreRef = useRef(false)
  const PAGE_SIZE = 50

  useEffect(() => {
    // 筛选条件切换时重置窗口
    setVisibleCount(PAGE_SIZE)
  }, [memoryFilter, memorySearch])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !isLoadingMoreRef.current && visibleCount < filteredMemories.length) {
          isLoadingMoreRef.current = true
          // 模拟异步加载（防止一次过多重渲染）
          requestAnimationFrame(() => {
            setVisibleCount((prev) => Math.min(filteredMemories.length, prev + PAGE_SIZE))
            isLoadingMoreRef.current = false
          })
        }
      }
    }, { rootMargin: '200px' })
    io.observe(sentinel)
    return () => io.disconnect()
  }, [visibleCount, filteredMemories.length])

  const visibleMemories = useMemo(
    () => filteredMemories.slice(0, visibleCount),
    [filteredMemories, visibleCount],
  )
  const hasMore = visibleCount < filteredMemories.length
  const filterOptions = [
    { value: 'all', label: '全部' },
    { value: 'high_confidence', label: '高可信度' },
    { value: 'low_confidence', label: '低可信度' },
    { value: 'hobby', label: '爱好' },
    { value: 'experience', label: '经历' },
    { value: 'relationship', label: '关系' },
    { value: 'promise', label: '承诺' },
    { value: 'other', label: '其他' },
    { value: 'personal_info', label: '个人信息' },
    { value: 'preferences', label: '喜好' },
    { value: 'shared_experience', label: '共同经历' },
    { value: 'shared_property', label: '共同财产' },
    { value: 'character_info', label: '角色信息' },
  ]

  const toggleExpand = (id) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // 长按处理
  const handleTouchStart = (e, mem) => {
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      const rect = e.currentTarget.getBoundingClientRect()
      setLongPressTarget({ memory: mem, rect })
    }, 500)
  }

  const handleTouchEnd = () => {
    clearTimeout(longPressTimer.current)
  }

  const handleTouchMove = () => {
    clearTimeout(longPressTimer.current)
  }

  // 点击弹出详情
  const handleItemClick = (e, mem) => {
    if (longPressTriggered.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDetailTarget({ memory: mem, rect })
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500">共 {charMemories.length} 条记忆</span>
        <button onClick={onAdd} className="text-xs font-medium text-ios-blue hover:underline">+ 添加</button>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex gap-2">
        <input
          value={memorySearch}
          onChange={(e) => setMemorySearch(e.target.value)}
          placeholder="搜索记忆..."
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-ios-blue"
        />
        <select
          value={memoryFilter}
          onChange={(e) => setMemoryFilter(e.target.value)}
          className="px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:border-ios-blue"
        >
          {filterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {filteredMemories.length === 0 ? (
        <EmptyTab icon="🧠" text="暂无记忆条目" subText="AI 会在对话中自动提取，你也可以手动添加。" />
      ) : (
        <div className="space-y-2">
          {visibleMemories.map((mem) => {
            const catInfo = getCategoryInfo(mem.category)
            const isExpanded = expandedItems[mem.id]
            const sourceLabel = SOURCE_LABELS[mem.source] || mem.source
            const isLowConfidence = mem.confidence === 'low'
            const isImportLow = mem.source === 'import' && isLowConfidence
            return (
              <div
                key={mem.id}
                className={`ios-card p-3 ${isLowConfidence ? 'opacity-75' : ''} cursor-pointer`}
                onTouchStart={(e) => handleTouchStart(e, mem)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onClick={(e) => handleItemClick(e, mem)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0" onClick={() => toggleExpand(mem.id)}>
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${catInfo.color}`}>
                        {catInfo.label}
                      </span>
                      {isLowConfidence && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium italic">
                          {isImportLow ? '低可信度-外部导入' : '低可信度'}
                        </span>
                      )}
                      {mem.important && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-medium">⭐ 重要</span>
                      )}
                    </div>
                    <p className={`text-sm leading-relaxed cursor-pointer ${isLowConfidence ? 'text-gray-400 dark:text-gray-500 italic' : 'text-gray-700 dark:text-gray-300'}`}>
                      {mem.content}
                    </p>
                    {!isExpanded && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatTime(mem.createdAt)}</span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${
                          mem.source === 'auto' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                          mem.source === 'deep_reflection' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                          mem.source === 'import' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                          'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        }`}>
                          {sourceLabel}
                        </span>
                        <StrengthBar strength={mem.strength} />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => onToggleImportant(charId, mem.id)} className={`w-6 h-6 rounded flex items-center justify-center ${mem.important ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`} title={mem.important ? '取消重要' : '标记为重要'}>
                      <svg className="w-3.5 h-3.5" fill={mem.important ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                    <button onClick={() => onEdit({ ...mem, type: 'memory' })} className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => onDelete('memory', mem.id)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2 animate-fade-in">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400 dark:text-gray-500">创建时间</p>
                        <p className="text-gray-700 dark:text-gray-300">{formatTime(mem.createdAt)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 dark:text-gray-500">最后更新</p>
                        <p className="text-gray-700 dark:text-gray-300">{formatTime(mem.updatedAt)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 dark:text-gray-500">来源</p>
                        <p className="text-gray-700 dark:text-gray-300">{sourceLabel}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 dark:text-gray-500">记忆强度</p>
                        <StrengthBar strength={mem.strength} />
                      </div>
                      {mem.source === 'import' && mem.importTime && (
                        <div className="col-span-2">
                          <p className="text-gray-400 dark:text-gray-500">导入时间</p>
                          <p className="text-gray-700 dark:text-gray-300">{formatTime(mem.importTime)}</p>
                        </div>
                      )}
                    </div>
                    {mem.important && (
                      <div>
                        <p className="text-xs text-yellow-600 dark:text-yellow-400">⭐ 重要记忆 - 不会随时间衰减</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {/* 加载更多 sentinel（Item 67: 虚拟滚动触发点）*/}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              <div className="text-xs text-gray-400 dark:text-gray-500">
                上滑加载更多（{filteredMemories.length - visibleCount} 条未显示）
              </div>
            </div>
          )}
        </div>
      )}

      {/* 详情弹出卡片 */}
      {detailTarget && (
        <MemoryDetailPopover
          memory={detailTarget.memory}
          anchorRect={detailTarget.rect}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {/* 长按菜单 */}
      {longPressTarget && (
        <LongPressMenu
          anchorRect={longPressTarget.rect}
          onEdit={() => onEdit({ ...longPressTarget.memory, type: 'memory' })}
          onDelete={() => onDelete('memory', longPressTarget.memory.id)}
          onToggleImportant={() => onToggleImportant(charId, longPressTarget.memory.id)}
          isImportant={longPressTarget.memory.important}
          onClose={() => setLongPressTarget(null)}
        />
      )}
    </div>
  )
}

// ============= Tab 4: 事件时间线 =============
function TimelineTab({ charEvents, charMemories, expandedEvent, setExpandedEvent, onEdit, onDelete, onSaveEdit, editItem, setEditItem, onAdd }) {
  // Item 67: 事件时间线虚拟滚动（sentinel 懒加载）
  const [visibleCount, setVisibleCount] = useState(30)
  const sentinelRef = useRef(null)
  const isLoadingMoreRef = useRef(false)
  const PAGE_SIZE = 30

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [charEvents.length])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !isLoadingMoreRef.current && visibleCount < charEvents.length) {
          isLoadingMoreRef.current = true
          requestAnimationFrame(() => {
            setVisibleCount((prev) => Math.min(charEvents.length, prev + PAGE_SIZE))
            isLoadingMoreRef.current = false
          })
        }
      }
    }, { rootMargin: '200px' })
    io.observe(sentinel)
    return () => io.disconnect()
  }, [visibleCount, charEvents.length])

  const visibleEvents = useMemo(
    () => charEvents.slice(0, visibleCount),
    [charEvents, visibleCount],
  )
  const hasMore = visibleCount < charEvents.length

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500">共 {charEvents.length} 个事件</span>
        <button onClick={onAdd} className="text-xs font-medium text-ios-blue hover:underline">+ 添加事件</button>
      </div>

      {charEvents.length === 0 ? (
        <EmptyTab icon="📅" text="暂无事件记录" subText="添加重要事件来构建时间线，或从记忆条目中自动生成。" />
      ) : (
        <div className="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
          {visibleEvents.map((evt) => {
            const relatedMemories = charMemories.filter((m) => evt.relatedMemoryIds?.includes(m.id))
            const isExpanded = expandedEvent === evt.id
            return (
              <div key={evt.id} className="relative">
                {/* 时间线圆点 */}
                <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-ios-blue border-2 border-white dark:border-gray-950" />
                <div className="ios-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedEvent(isExpanded ? null : evt.id)}>
                      <p className="text-[10px] text-ios-blue font-medium mb-1">{formatDate(evt.date)}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{evt.description}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        {relatedMemories.length} 条相关记忆
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => onEdit({ ...evt, type: 'event' })} className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => onDelete('event', evt.id)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
                      {relatedMemories.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">相关记忆</p>
                          {relatedMemories.map((m) => (
                            <p key={m.id} className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-1.5">
                              {m.content}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500">暂无关联记忆</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {/* 加载更多 sentinel（Item 67: 虚拟滚动触发点）*/}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4 relative -ml-6">
              <div className="text-xs text-gray-400 dark:text-gray-500">
                上滑加载更多（{charEvents.length - visibleCount} 条未显示）
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============= Tab 5: 情绪记录 =============
function EmotionTab({ charEmotions, emotionHeatmap, selectedEmotionDay, setSelectedEmotionDay, onDelete, onAdd }) {
  // 生成最近30天的日历
  const calendarDays = useMemo(() => {
    const days = []
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const emotions = emotionHeatmap[dateStr] || []
      days.push({ date: dateStr, day: d.getDate(), weekday: d.getDay(), emotions })
    }
    return days
  }, [emotionHeatmap])

  const getDayColor = (emotions) => {
    if (emotions.length === 0) return 'bg-gray-100 dark:bg-gray-800'
    const maxIntensity = Math.max(...emotions.map((e) => e.intensity === '高' ? 3 : e.intensity === '中' ? 2 : 1))
    if (maxIntensity >= 3) return 'bg-red-400 dark:bg-red-500'
    if (maxIntensity >= 2) return 'bg-orange-300 dark:bg-orange-400'
    return 'bg-yellow-200 dark:bg-yellow-600'
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500">共 {charEmotions.length} 条记录</span>
        <button onClick={onAdd} className="text-xs font-medium text-ios-blue hover:underline">+ 添加</button>
      </div>

      {/* 热力图 */}
      <div className="ios-card p-4">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">近30天情绪热力图</h4>
        <div className="grid grid-cols-7 gap-1">
          {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
            <div key={w} className="text-[10px] text-gray-400 dark:text-gray-500 text-center">{w}</div>
          ))}
          {/* 填充空白 */}
          {Array.from({ length: calendarDays[0]?.weekday || 0 }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {calendarDays.map((day) => (
            <button
              key={day.date}
              onClick={() => setSelectedEmotionDay(selectedEmotionDay === day.date ? null : day.date)}
              className={`aspect-square rounded-lg ${getDayColor(day.emotions)} flex items-center justify-center text-[10px] font-medium transition-colors hover:ring-2 hover:ring-ios-blue ${selectedEmotionDay === day.date ? 'ring-2 ring-ios-blue' : ''} ${
                day.emotions.length > 0 ? 'text-white' : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {day.day}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-3 justify-center">
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <div className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-800" /> 无
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <div className="w-3 h-3 rounded bg-yellow-200 dark:bg-yellow-600" /> 低
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <div className="w-3 h-3 rounded bg-orange-300 dark:bg-orange-400" /> 中
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <div className="w-3 h-3 rounded bg-red-400 dark:bg-red-500" /> 高
          </div>
        </div>
      </div>

      {/* 选中日期的情绪详情 */}
      {selectedEmotionDay && emotionHeatmap[selectedEmotionDay] && (
        <div className="ios-card p-4 animate-fade-in">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{selectedEmotionDay}</h4>
          <div className="space-y-3">
            {emotionHeatmap[selectedEmotionDay].map((e) => (
              <div key={e.id} className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <span className="text-2xl flex-shrink-0">{EMOTION_EMOJIS[e.emotion] || '😶'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{e.emotion}</span>
                    <span className={`w-2 h-2 rounded-full ${EMOTION_INTENSITY_COLORS[e.intensity] || 'bg-gray-400'}`} />
                    <span className="text-[10px] text-gray-400">{e.intensity}</span>
                  </div>
                  {e.trigger && <p className="text-xs text-gray-500 dark:text-gray-400">触发：{e.trigger}</p>}
                  {e.keywords?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {e.keywords.map((k, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{k}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => onDelete('emotion', e.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 flex-shrink-0">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 情绪列表 */}
      {charEmotions.length === 0 ? (
        <EmptyTab icon="💭" text="暂无情绪记录" subText="AI 会在对话中感知情绪，你也可以手动添加情绪记录。" />
      ) : (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">最近记录</h4>
          {charEmotions.slice(0, 20).map((e) => (
            <div key={e.id} className="ios-card p-3 flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">{EMOTION_EMOJIS[e.emotion] || '😶'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{e.emotion}</span>
                  <span className={`w-2 h-2 rounded-full ${EMOTION_INTENSITY_COLORS[e.intensity] || 'bg-gray-400'}`} />
                  <span className="text-[10px] text-gray-400">{formatDate(e.date || e.createdAt)}</span>
                </div>
                {e.trigger && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{e.trigger}</p>}
              </div>
              <button onClick={() => onDelete('emotion', e.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 flex-shrink-0">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============= Tab 6: 深度反思记录 =============
function ReflectionTab({ enhanced, reflectionHistory, character }) {
  const deepReflection = enhanced.deepReflection

  return (
    <div className="p-4 space-y-3">
      <span className="text-xs text-gray-400 dark:text-gray-500">共 {reflectionHistory.length} 条记录</span>

      {reflectionHistory.length === 0 ? (
        <EmptyTab icon="🔍" text="暂无深度反思记录" subText="开启增强记忆后，AI 会在对话后台自动生成深度反思。" />
      ) : (
        <div className="space-y-4">
          {reflectionHistory.map((record, idx) => (
            <div key={idx} className="ios-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">
                  {record.type === 'deepReflection' ? '🧠' : record.type === 'monologue' ? '💭' : record.type === 'associationNetwork' ? '🔗' : '📔'}
                </span>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{record.label}</h4>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">{formatTime(record.generatedAt)}</span>
              </div>

              {record.type === 'deepReflection' && (
                <div className="space-y-3">
                  {record.personality_model && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">性格模型</h5>
                      <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                        {record.personality_model.mbti_likely && <p>MBTI: {record.personality_model.mbti_likely}</p>}
                        {record.personality_model.attachment_style && <p>依恋类型: {record.personality_model.attachment_style}</p>}
                        {record.personality_model.life_stage && <p>人生阶段: {record.personality_model.life_stage}</p>}
                        {record.personality_model.values?.length > 0 && <p>价值观: {record.personality_model.values.join('、')}</p>}
                        {record.personality_model.deep_needs?.length > 0 && <p>深层需求: {record.personality_model.deep_needs.join('、')}</p>}
                      </div>
                    </div>
                  )}
                  {record.relationship_stage && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">关系评估</h5>
                      <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                        <p>阶段: {record.relationship_stage.current}</p>
                        {record.relationship_stage.prediction && <p>预测: {record.relationship_stage.prediction}</p>}
                      </div>
                    </div>
                  )}
                  {record.emotion_peaks?.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">情绪波动</h5>
                      <div className="space-y-2">
                        {record.emotion_peaks.map((peak, i) => (
                          <div key={i} className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="font-medium">{peak.emotion}</span> ({peak.intensity})
                            {peak.trigger && <span className="text-gray-400"> — {peak.trigger}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {record.hidden_insights?.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">隐藏洞察</h5>
                      <div className="space-y-1">
                        {record.hidden_insights.map((insight, i) => (
                          <p key={i} className="text-sm text-gray-600 dark:text-gray-400">{insight}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {record.user_summary && (
                    <div className="bg-ios-blue/5 dark:bg-ios-blue/10 rounded-xl p-3 border border-ios-blue/20">
                      <h5 className="text-xs font-semibold text-ios-blue uppercase mb-2">用户认知摘要</h5>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{record.user_summary}</p>
                    </div>
                  )}
                </div>
              )}

              {record.type === 'monologue' && (
                <div className="bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-900/10 dark:to-purple-900/10 rounded-xl p-4 border border-pink-100 dark:border-pink-900/20">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{character.name} 的内心独白</p>
                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap italic">{record.content}</div>
                </div>
              )}

              {record.type === 'associationNetwork' && (
                <div className="space-y-3">
                  {record.people_network?.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">人物关系图谱</h5>
                      <div className="space-y-2">
                        {record.people_network.map((person, i) => (
                          <div key={i} className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="font-medium text-gray-700 dark:text-gray-300">{person.name}</span>
                            <span className="text-gray-400"> — {person.relation}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {record.event_chains?.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">事件因果链</h5>
                      <div className="space-y-2">
                        {record.event_chains.map((chain, i) => (
                          <div key={i} className="text-sm text-gray-600 dark:text-gray-400">
                            <p className="font-medium text-gray-700 dark:text-gray-300">{chain.title}</p>
                            {chain.narrative && <p className="text-xs mt-1">{chain.narrative}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {record.theme_clusters?.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">主题聚合</h5>
                      <div className="flex flex-wrap gap-2">
                        {record.theme_clusters.map((cluster, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{cluster.theme}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {record.predicted_topics?.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">预测话题</h5>
                      <div className="space-y-1">
                        {record.predicted_topics.map((topic, i) => (
                          <p key={i} className="text-sm text-gray-600 dark:text-gray-400">• {topic}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  )
}

// ============= Tab 7: 预测与建议 =============
function PredictionTab({ enhanced, charMemories }) {
  const smartTopic = enhanced.smartTopic
  const associationNetwork = enhanced.associationNetwork

  // 重要纪念日
  const anniversaries = useMemo(() => {
    return charMemories
      .filter((m) => /第一次|纪念|生日|周年|初见|相遇|认识|那天/.test(m.content))
      .slice(0, 10)
  }, [charMemories])

  return (
    <div className="p-4 space-y-4">

      {/* 角色可能主动开启的话题 */}
      <div className="ios-card p-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <span>💡</span> 角色可能主动开启的话题
        </h4>
        {smartTopic ? (
          <div className="space-y-3">
            <p className="text-[10px] text-gray-400 dark:text-gray-500">生成于 {formatTime(smartTopic.generatedAt)}</p>
            {smartTopic.opening_message && (
              <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/10 dark:to-amber-900/10 rounded-xl p-3 border border-yellow-100 dark:border-yellow-900/20">
                <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{smartTopic.opening_message}"</p>
              </div>
            )}
            {smartTopic.questions_to_ask?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">想问你的问题</p>
                {smartTopic.questions_to_ask.map((q, i) => (
                  <p key={i} className="text-sm text-gray-600 dark:text-gray-400">• {q}</p>
                ))}
              </div>
            )}
            {smartTopic.things_to_share?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">想分享的事</p>
                {smartTopic.things_to_share.map((s, i) => (
                  <p key={i} className="text-sm text-gray-600 dark:text-gray-400">• {s}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">暂无数据，开启增强记忆后自动生成。</p>
        )}
      </div>

      {/* 关联网络预测话题 */}
      {associationNetwork?.predicted_topics?.length > 0 && (
        <div className="ios-card p-4">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <span>🔗</span> 关联网络预测
          </h4>
          <div className="space-y-1">
            {associationNetwork.predicted_topics.map((topic, i) => (
              <p key={i} className="text-sm text-gray-600 dark:text-gray-400">• {topic}</p>
            ))}
          </div>
        </div>
      )}

      {/* 重要纪念日/提醒 */}
      <div className="ios-card p-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <span>📅</span> 重要纪念日 / 提醒
        </h4>
        {anniversaries.length > 0 ? (
          <div className="space-y-2">
            {anniversaries.map((m) => (
              <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <span className="text-lg">🎯</span>
                <p className="text-sm text-gray-700 dark:text-gray-300">{m.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">暂无纪念日记录。AI 会在对话中自动识别重要日期。</p>
        )}
      </div>
    </div>
  )
}

// ============= Tab 8: 场景事件 =============
function SceneEventsTab({ sceneEvents, characterName, onDelete }) {
  const [expandedId, setExpandedId] = useState(null)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500">共 {sceneEvents.length} 个场景事件</span>
      </div>

      {sceneEvents.length === 0 ? (
        <EmptyTab icon="🎬" text="暂无场景事件" subText="多人对话结束后会自动生成场景事件摘要。" />
      ) : (
        <div className="space-y-3">
          {sceneEvents.map((evt) => {
            const isExpanded = expandedId === evt.id
            const preview = evt.summary && evt.summary.length > 50
              ? evt.summary.slice(0, 50) + '...'
              : (evt.summary || '')
            return (
              <div key={evt.id} className="ios-card p-3">
                <div
                  className="cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(evt.date)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium">
                      场景事件
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    参与者：{(evt.participants || []).join('、')}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {isExpanded ? evt.summary : preview}
                  </p>
                  {!isExpanded && evt.summary && evt.summary.length > 50 && (
                    <p className="text-xs text-ios-blue mt-1">点击展开查看完整摘要</p>
                  )}
                </div>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        创建时间：{formatTime(evt.createdAt)}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(evt.id)
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============= 工具函数 =============
// (downloadFile 已移至 src/utils/exportUtils.js 中的 downloadWithFallback)