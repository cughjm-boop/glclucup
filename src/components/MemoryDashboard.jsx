import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import useStore from '../store/useStore'
import { getMemoryDashboardStats } from '../services/memoriesV2Service'
import {
  buildAndSaveRelationship,
  getRelationshipSummary,
} from '../services/relationshipBuilder'
import { MemoryTimeline } from '../services/memoryTimeline'
import { downloadWithFallback, formatExportTime, getDateStr } from '../utils/exportUtils'
import {
  getAllMemoriesV2,
  getCoreMemories,
  getEmotionalMemories,
  getDailyMemories,
  addMemoryV2,
  deleteMemoriesByMessageId,
  archiveOldDailyMemories,
  clearAllDailyMemories,
  MEMORY_TIERS,
  exportMemoriesV2,
  searchMemoriesV2,
  getCleanupDays,
  setCleanupDays,
  getOwnedMemories,
  deleteMemoryV2,
  updateMemoryV2,
} from '../services/memoriesV2Service'
import {
  getCharacterNameList,
  findCharacter,
  getCharacterProfile,
} from '../services/characterDataService'
import {
  getCharacterUiRegistry,
  resolveCharacterUi,
  DEFAULT_BUBBLE_COLOR_PROFILES,
} from '../core/ui/CharacterUiRegistry'
import ErrorBoundary from './ErrorBoundary'

// 从 DEFAULT_BUBBLE_COLOR_PROFILES 对象中提取去重的 fallback 色值数组
function getBubbleColorHexList() {
  if (!DEFAULT_BUBBLE_COLOR_PROFILES) return []
  const seen = new Set()
  const result = []
  for (const v of Object.values(DEFAULT_BUBBLE_COLOR_PROFILES)) {
    if (v && typeof v === 'object' && v.fallback && !seen.has(v.fallback)) {
      seen.add(v.fallback)
      result.push(v.fallback)
    }
  }
  return result
}

const SOURCE_LABELS = {
  chat: '聊天',
  import: '导入',
  manual: '手动',
  system: '系统',
  user_edit: '用户修改',
  ai_summary: 'AI 总结',
}

const TIER_META = {
  core: { label: '核心档案', icon: '🔒', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  emotional: { label: '情感精华', icon: '❤️', color: 'text-rose-500', bg: 'bg-rose-500/10' },
  daily: { label: '日常记忆', icon: '📝', color: 'text-slate-500', bg: 'bg-slate-500/10' },
}

const MEMORY_TABS = [
  { id: 'between', label: '我们之间', icon: '💎' },
  { id: 'library', label: '记忆库', icon: '📋' },
  { id: 'others', label: '其他角色记忆', icon: '👥' },
  { id: 'manage', label: '记忆管理', icon: '🔧' },
]

export default function MemoryDashboard() {
  const { currentCharacterId, characters, refreshMemoryDashboard, rebuildRelationship, getMemoryTimeline, getSetting, setSetting } = useStore()
  const [stats, setStats] = useState(null)
  const [relationship, setRelationship] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [activeTab, setActiveTab] = useState('between')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const currentChar = characters.find((c) => c.id === currentCharacterId)

  const loadData = async () => {
    if (!currentCharacterId) return
    setIsRefreshing(true)
    try {
      const s = getMemoryDashboardStats(currentCharacterId)
      setStats(s)
      const r = getRelationshipSummary(currentCharacterId)
      setRelationship(r)
      const tl = new MemoryTimeline(currentCharacterId)
      setTimeline({
        events: tl.build(),
        milestones: tl.getMilestones(),
        stats: tl.getStats(),
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharacterId])

  if (!currentCharacterId) {
    return (
      <div className="p-6 text-center text-slate-500 dark:text-slate-400">
        请先选择一个角色
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await rebuildRelationship(currentCharacterId)
              loadData()
            }}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            重建关系
          </button>
          <button
            onClick={loadData}
            disabled={isRefreshing}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {isRefreshing ? '刷新中…' : '刷新'}
          </button>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 dark:text-slate-400">记忆健康度</div>
          <div className={`text-lg font-bold ${
            (stats?.healthScore || 0) >= 90 ? 'text-emerald-500' :
            (stats?.healthScore || 0) >= 70 ? 'text-amber-500' :
            'text-rose-500'
          }`}>
            {stats?.healthScore ?? '--'}%
          </div>
        </div>
      </div>

      {/* 三个主标签 */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
        {MEMORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 标签内容 */}
      {activeTab === 'between' && (
        <BetweenTab stats={stats} relationship={relationship} onRebuild={async () => { rebuildRelationship(currentCharacterId); loadData() }} />
      )}
      {activeTab === 'library' && (
        <LibraryTab stats={stats} timeline={timeline} characterId={currentCharacterId} />
      )}
      {activeTab === 'others' && (
        <ErrorBoundary message="其他角色记忆功能加载失败，请稍后重试">
          <OthersTab characterId={currentCharacterId} mainCharName={currentChar?.name} onRefresh={loadData} />
        </ErrorBoundary>
      )}
      {activeTab === 'manage' && (
        <ManageTab
          stats={stats}
          characterId={currentCharacterId}
          characterName={currentChar?.name}
          onRefresh={loadData}
          cleanupDays={getCleanupDays(currentCharacterId)}
          onSetCleanupDays={(days) => setCleanupDays(currentCharacterId, days)}
        />
      )}
    </div>
  )
}

// ============= 💎 我们之间 =============
function BetweenTab({ stats, relationship, onRebuild }) {
  return (
    <div className="space-y-4">
      {/* 健康度卡片 */}
      <HealthCard stats={stats} />

      {/* 关系卡片 */}
      {relationship ? (
        <div className="space-y-3">
          {/* 阶段卡片 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl">{relationship.stage.icon}</div>
              <div className="flex-1">
                <div className="text-xs text-slate-500 dark:text-slate-400">当前阶段</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{relationship.stage.label}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">{relationship.stage.desc}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">阶段进度</div>
                <div className="text-lg font-bold text-indigo-500">{relationship.stage.progress}%</div>
              </div>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${relationship.stage.progress}%` }} />
            </div>
          </div>

          {/* 情感基调 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">情感基调</div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{relationship.emotionTone.label}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">({Math.round(relationship.emotionTone.positiveRatio * 100)}% 积极)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{relationship.emotionTone.details}</p>
          </div>

          {/* 关系特征 */}
          {relationship.features.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">关系特征</div>
              <div className="flex flex-wrap gap-2">
                {relationship.features.map((f, i) => (
                  <span key={i} className="px-2 py-1 text-xs rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 里程碑 */}
          {relationship.milestones.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">✨ 重要时刻</div>
              <ul className="space-y-2">
                {relationship.milestones.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex items-start gap-2 text-sm">
                    <span className="text-amber-500 mt-0.5">✨</span>
                    <span className="text-slate-700 dark:text-slate-200">{m.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 统计数据 */}
          <div className="grid grid-cols-3 gap-2">
            <StatCell label="互动天数" value={relationship.interactionData.durationDays} />
            <StatCell label="消息总数" value={relationship.interactionData.userMessages} />
            <StatCell label="日均互动" value={relationship.interactionData.dailyAvg} />
          </div>

          {/* 摘要文本 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">关系摘要</div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{relationship.summary}</p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">暂无关系数据</p>
          <button
            onClick={onRebuild}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
          >
            立即重建关系
          </button>
        </div>
      )}
    </div>
  )
}

// ============= 📋 记忆库 =============
function LibraryTab({ stats, timeline, characterId }) {
  const [activeSubTab, setActiveSubTab] = useState('timeline')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef(null)
  const isSearchActive = searchKeyword.trim().length > 0

  const handleSearch = useCallback((value) => {
    setSearchKeyword(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setSearchResults(null)
      return
    }
    setIsSearching(true)
    debounceRef.current = setTimeout(() => {
      const results = searchMemoriesV2(characterId, value.trim())
      setSearchResults(results)
      setIsSearching(false)
    }, 300)
  }, [characterId])

  // 清理
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  return (
    <div className="space-y-4">
      {/* 搜索框 */}
      <div className="relative">
        <input
          type="text"
          placeholder="搜索记忆..."
          value={searchKeyword}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {searchKeyword && (
          <button
            onClick={() => handleSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-400 dark:hover:bg-slate-500"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 搜索结果 */}
      {isSearchActive ? (
        <div className="space-y-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {isSearching ? '搜索中...' : `找到 ${searchResults?.length || 0} 条结果`}
          </div>
          {isSearching ? (
            <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">搜索中...</div>
          ) : searchResults && searchResults.length > 0 ? (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {searchResults.map((m) => (
                <SearchResultCard key={m.id} memory={m} characterId={characterId} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
              没有找到匹配的记忆
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 三层记忆金字塔概览 */}
          {stats && (
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(stats.breakdown).map(([key, count]) => {
                const meta = TIER_META[key] || { label: key, icon: '•', color: 'text-slate-500', bg: 'bg-slate-500/10' }
                return (
                  <div key={key} className={`rounded-lg ${meta.bg} p-3 text-center`}>
                    <div className="text-lg">{meta.icon}</div>
                    <div className={`text-xl font-bold ${meta.color}`}>{count}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{meta.label}</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 子标签 */}
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
            {[
              { key: 'timeline', label: '时间线' },
              { key: 'sources', label: '来源分布' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveSubTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2 ${
                  activeSubTab === tab.key
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 内容 */}
          {activeSubTab === 'timeline' && <TimelineSection timeline={timeline} />}
          {activeSubTab === 'sources' && <SourcesSection stats={stats} />}
        </>
      )}
    </div>
  )
}

// 搜索结果卡片
function SearchResultCard({ memory, characterId }) {
  const tierMeta = TIER_META[memory.tier] || TIER_META.daily
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs px-1.5 py-0.5 rounded ${tierMeta.bg} ${tierMeta.color}`}>
          {tierMeta.icon} {tierMeta.label}
        </span>
        {memory.category && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400">{memory.category}</span>
        )}
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-200">{memory.content}</p>
      {memory.createdAt && (
        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{formatMemoryTime(memory.createdAt)}</div>
      )}
    </div>
  )
}

function TimelineSection({ timeline }) {
  if (!timeline) {
    return <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">暂无时间轴数据</div>
  }

  const { events, milestones, stats } = timeline

  if (!events || events.length === 0) {
    return <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">还没有重要事件</div>
  }

  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000

  // 折叠分组逻辑
  const { flatItems, groups } = useMemo(() => {
    // 分离不折叠项（里程碑/关系类型 ≈ 核心/情感记忆）
    const noFold = []
    const foldable = []
    for (const e of events) {
      if (e.type === 'milestone' || e.type === 'relation') {
        noFold.push(e)
      } else {
        foldable.push(e)
      }
    }

    // 对可折叠项按时间规则分组
    const g = []
    let currentGroup = null
    const sorted = [...foldable].sort((a, b) => a.timestamp - b.timestamp)

    for (const e of sorted) {
      const diffDays = Math.floor((now - e.timestamp) / DAY_MS)
      let groupKey

      if (diffDays <= 7) {
        // ≤7天：逐条不折叠，归入 flat
        noFold.push(e)
        continue
      } else if (diffDays <= 30) {
        // 8-30天：按天分组
        const d = new Date(e.timestamp)
        groupKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
      } else if (diffDays <= 180) {
        // 1-6个月：按周分组
        const d = new Date(e.timestamp)
        const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
        groupKey = `${d.getFullYear()}年${d.getMonth() + 1}月第${Math.ceil(d.getDate() / 7)}周`
      } else {
        // 6个月以上：按月分组
        const d = new Date(e.timestamp)
        groupKey = `${d.getFullYear()}年${d.getMonth() + 1}月`
      }

      if (currentGroup && currentGroup.key === groupKey) {
        currentGroup.items.push(e)
      } else {
        if (currentGroup) g.push(currentGroup)
        currentGroup = { key: groupKey, items: [e] }
      }
    }
    if (currentGroup) g.push(currentGroup)

    return { flatItems: noFold.sort((a, b) => b.timestamp - a.timestamp), groups: g }
  }, [events, now])

  const [expandedGroups, setExpandedGroups] = useState({})
  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-4">
      {/* 时间轴统计 */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatCell label="事件总数" value={stats.totalEvents} />
          <StatCell label="里程碑" value={milestones?.length || 0} />
          <StatCell label="跨度(天)" value={stats.durationDays} />
        </div>
      )}

      {/* 时间轴列表 */}
      <div className="relative space-y-4">
        {/* 不折叠项：核心档案 / 情感精华 */}
        {flatItems.length > 0 && (
          <div>
            <div className="sticky top-0 bg-[#f2f2f7] dark:bg-gray-950 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              重要时刻 · 逐条展示
            </div>
            <ol className="relative border-l-2 border-amber-200 dark:border-amber-800 ml-2 space-y-3">
              {flatItems.map((e, i) => (
                <li key={e.id || i} className="ml-4">
                  <div className="absolute -left-[7px] w-3 h-3 rounded-full bg-amber-500 border-2 border-[#f2f2f7] dark:border-gray-950" />
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{e.timeLabel}</div>
                  <div className="text-sm text-slate-700 dark:text-slate-200">{e.description}</div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 折叠分组：日常记忆 */}
        {groups.length > 0 && (
          <div>
            <div className="sticky top-0 bg-[#f2f2f7] dark:bg-gray-950 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              日常记忆 · 按时间折叠
            </div>
            <div className="space-y-2">
              {groups.map((g) => (
                <div key={g.key} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                  <button
                    onClick={() => toggleGroup(g.key)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {g.key}，{g.items.length} 条记忆
                    </span>
                    <svg
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandedGroups[g.key] ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div
                    className={`transition-all duration-200 overflow-hidden ${expandedGroups[g.key] ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    <ol className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-4 space-y-2 pb-3">
                      {g.items.map((e, i) => (
                        <li key={e.id || i} className="ml-4 pr-3">
                          <div className="absolute -left-[7px] w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-white dark:border-slate-800" />
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{e.timeLabel}</div>
                          <div className="text-sm text-slate-700 dark:text-slate-200">{e.description}</div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SourcesSection({ stats }) {
  if (!stats) return null

  const bySource = stats.bySource || {}
  const total = Object.values(bySource).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 dark:text-slate-400">记忆来源分布</div>
      {Object.entries(bySource).map(([source, count]) => {
        const pct = Math.round((count / total) * 100)
        return (
          <div key={source} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {SOURCE_LABELS[source] || source}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{count} 条 · {pct}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============= 🔧 记忆管理 =============
function ManageTab({ stats, characterId, characterName, onRefresh, cleanupDays, onSetCleanupDays }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newMemory, setNewMemory] = useState({ category: 'personal_info', content: '', tier: 'daily' })
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showArchiveResult, setShowArchiveResult] = useState(null)

  const handleAddMemory = () => {
    if (!newMemory.content.trim()) return
    addMemoryV2(characterId, {
      content: newMemory.content.trim(),
      category: newMemory.category,
      tier: newMemory.tier,
      source: 'manual',
      confidence: 1.0,
      importance: 0.8,
    })
    setNewMemory({ category: 'personal_info', content: '', tier: 'daily' })
    setShowAddModal(false)
    onRefresh()
  }

  const handleArchive = () => {
    const result = archiveOldDailyMemories(characterId, cleanupDays || 30)
    setShowArchiveResult({
      type: 'archive',
      archived: result.archivedCount,
      deleted: result.deletedCount,
    })
    onRefresh()
    setTimeout(() => setShowArchiveResult(null), 4000)
  }

  const handleClearDaily = () => {
    const count = clearAllDailyMemories(characterId)
    setShowArchiveResult({ type: 'clear', count })
    setShowClearConfirm(false)
    onRefresh()
    setTimeout(() => setShowArchiveResult(null), 4000)
  }

  const handleExport = async (format) => {
    const safeName = (characterName || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')
    const dateStr = getDateStr()
    const result = exportMemoriesV2(characterId)
    
    let content, filename, mimeType
    if (format === 'json') {
      content = JSON.stringify({
        characterName,
        exportedAt: formatExportTime(Date.now()),
        ...result,
      }, null, 2)
      filename = `${safeName}_记忆_${dateStr}.json`
      mimeType = 'application/json'
    } else {
      const lines = []
      lines.push(`# ${characterName} 记忆导出`)
      lines.push(`导出时间：${formatExportTime(Date.now())}`)
      lines.push('')
      lines.push('## 核心档案')
      result.core?.forEach((m) => lines.push(`- ${m.content} [${m.category || '未分类'}]`))
      lines.push('')
      lines.push('## 情感精华')
      result.emotional?.forEach((m) => lines.push(`- ${m.content} [${m.category || '未分类'}]`))
      lines.push('')
      lines.push('## 日常琐事')
      result.daily?.forEach((m) => lines.push(`- ${m.content} [${m.category || '未分类'}]`))
      content = lines.join('\n')
      filename = `${safeName}_记忆_${dateStr}.txt`
      mimeType = 'text/plain'
    }
    
    downloadWithFallback(content, filename, mimeType)
  }

  return (
    <div className="space-y-3">
      {/* 统计 */}
      {stats && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.totalCount}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">总记忆</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.lockedCount}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">锁定</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.confirmedCount}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">已确认</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.healthScore}%</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">健康度</div>
            </div>
          </div>
        </div>
      )}

      {/* 手动添加 */}
      <button
        onClick={() => setShowAddModal(true)}
        className="w-full ios-card p-4 text-left hover:scale-[1.01] active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
            <span className="text-xl">➕</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">手动添加记忆</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">手动添加核心档案或重要记忆</div>
          </div>
        </div>
      </button>

      {/* 归档设置 */}
      <div className="ios-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
            <span className="text-xl">📦</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">日常记忆归档</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">超过设定天数的日常记忆自动压缩</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">保留天数：</span>
          <select
            value={cleanupDays || 30}
            onChange={(e) => onSetCleanupDays(Number(e.target.value))}
            className="flex-1 px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
          >
            <option value={7}>7 天</option>
            <option value={15}>15 天</option>
            <option value={30}>30 天</option>
            <option value={60}>60 天</option>
            <option value={90}>90 天</option>
          </select>
          <button
            onClick={handleArchive}
            className="px-3 py-1 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            立即归档
          </button>
        </div>
      </div>

      {/* 清理设置 */}
      <button
        onClick={() => setShowClearConfirm(true)}
        className="w-full ios-card p-4 text-left hover:scale-[1.01] active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
            <span className="text-xl">🗑️</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">清空日常记忆</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">删除所有日常琐事记忆（核心档案保留）</div>
          </div>
        </div>
      </button>

      {/* 导出 */}
      <div className="ios-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
            <span className="text-xl">📤</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">导出记忆</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">按三层分类导出所有记忆</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
          >
            JSON 格式
          </button>
          <button
            onClick={() => handleExport('txt')}
            className="px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
          >
            TXT 文本
          </button>
        </div>
      </div>

      {/* 结果提示 */}
      {showArchiveResult && (
        <div className="rounded-xl p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs text-center animate-fade-in">
          {showArchiveResult.type === 'archive'
            ? `✅ 归档完成：压缩 ${showArchiveResult.archived} 条，删除 ${showArchiveResult.deleted} 条过期记忆`
            : `✅ 已清空 ${showArchiveResult.count} 条日常记忆`}
        </div>
      )}

      {/* 添加记忆模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="ios-card w-full max-w-sm p-4 animate-bounce-in">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">添加记忆</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">记忆层级</label>
                <select
                  value={newMemory.tier}
                  onChange={(e) => setNewMemory({ ...newMemory, tier: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                >
                  <option value="core">🔒 核心档案（永久保留）</option>
                  <option value="emotional">❤️ 情感精华（永久保留）</option>
                  <option value="daily">📝 日常琐事（30天归档）</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">分类</label>
                <select
                  value={newMemory.category}
                  onChange={(e) => setNewMemory({ ...newMemory, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                >
                  <option value="personal_info">个人信息</option>
                  <option value="hobby">爱好</option>
                  <option value="preferences">偏好</option>
                  <option value="relationship">关系</option>
                  <option value="experience">经历事件</option>
                  <option value="promise">承诺</option>
                  <option value="user_expectation">用户期望</option>
                  <option value="character_info">角色信息</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">记忆内容</label>
                <textarea
                  value={newMemory.content}
                  onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                  rows={3}
                  placeholder="输入要记录的内容..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddMemory}
                disabled={!newMemory.content.trim()}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清空确认 */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="ios-card w-full max-w-sm p-5 animate-bounce-in">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">确认清空</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
              确定要清空所有「日常琐事」记忆吗？<br/>
              核心档案和情感精华将被保留，此操作不可撤销。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleClearDaily}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 transition-colors"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============= 通用子组件 =============
function HealthCard({ stats }) {
  if (!stats) {
    return (
      <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-4 animate-pulse h-28" />
    )
  }

  const score = stats.healthScore
  const scoreColor =
    score >= 90 ? 'text-emerald-500' :
    score >= 70 ? 'text-amber-500' :
    'text-rose-500'

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">记忆健康度</div>
          <div className={`text-3xl font-bold ${scoreColor}`}>{score}%</div>
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <div>总记忆 <span className="font-semibold text-slate-700 dark:text-slate-200">{stats.totalCount}</span></div>
          <div>问题 <span className="font-semibold text-rose-500">{stats.healthIssues}</span></div>
        </div>
      </div>

      <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            score >= 90 ? 'bg-emerald-500' :
            score >= 70 ? 'bg-amber-500' :
            'bg-rose-500'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* 问题列表 */}
      {(stats.lowConfidenceCount > 0 || stats.duplicateGroups > 0 || stats.unresolvedConflicts > 0) && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-1.5 text-xs">
          {stats.lowConfidenceCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">⚠️ 低可信度记忆</span>
              <span className="text-slate-700 dark:text-slate-200 font-medium">{stats.lowConfidenceCount} 条</span>
            </div>
          )}
          {stats.duplicateGroups > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">🔁 重复记忆组</span>
              <span className="text-slate-700 dark:text-slate-200 font-medium">{stats.duplicateGroups} 组</span>
            </div>
          )}
          {stats.unresolvedConflicts > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">⚡ 未解决冲突</span>
              <span className="text-rose-500 font-medium">{stats.unresolvedConflicts} 个</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCell({ label, value }) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-center">
      <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{value}</div>
      <div className="text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

// ============ 其他角色记忆 Tab（多人聊天 V2） ============
function OthersTab({ characterId, mainCharName, onRefresh }) {
  const allNames = useMemo(() => {
    const raw = (getCharacterNameList?.() || []).filter(Boolean)
    // 把主角色放在最后，其他放在前面，避免默认切到主角色
    const others = raw.filter((n) => n !== mainCharName)
    return [...others, mainCharName]
  }, [mainCharName])
  const [selectedName, setSelectedName] = useState(allNames[0] || mainCharName)
  const [forceTick, setForceTick] = useState(0)
  const refresh = () => { setForceTick((v) => v + 1); onRefresh?.() }

  // 订阅 CharacterUiRegistry 外观变更 → 立即重绘
  useEffect(() => {
    const reg = getCharacterUiRegistry()
    const unsub = reg.subscribe(refresh)
    return () => { try { unsub() } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedName])

  // 切换角色列表变动时保护 selectedName
  useEffect(() => {
    if (!allNames.length) return
    if (!allNames.includes(selectedName)) setSelectedName(allNames[0])
  }, [allNames, selectedName])

  const registry = getCharacterUiRegistry()
  const override = registry.getOverride(selectedName)
  const official = findCharacter(selectedName)
  const ui = resolveCharacterUi(
    selectedName,            // 用名字作为 speakerId（匹配现有逻辑）
    official?.name || selectedName,
    official?.avatar || '',
    false,
  )
  const bubbleColor = override?.bubbleColor || ui.bubbleColor || ''

  // 基础信息编辑（displayName / note）——只改 UI 层，不改官方设定
  const [displayName, setDisplayName] = useState(override?.displayName || '')
  const [note, setNote] = useState(override?.note || '')
  useEffect(() => {
    setDisplayName(override?.displayName || '')
    setNote(override?.note || '')
  }, [selectedName, forceTick, override?.displayName, override?.note])

  // 自定义头像
  const [customAvatar, setCustomAvatar] = useState(override?.avatar || '')
  useEffect(() => { setCustomAvatar(override?.avatar || '') }, [selectedName, forceTick, override?.avatar])

  const fileInputRef = useRef(null)
  const onPickAvatar = () => fileInputRef.current?.click()
  const onAvatarFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setCustomAvatar(dataUrl)
    }
    reader.readAsDataURL(f)
  }

  // 该角色自己的记忆（按 owner/participants 严格隔离）
  const charMemories = useMemo(() => {
    try {
      return getOwnedMemories(characterId, selectedName) || []
    } catch (e) {
      console.warn('[OthersTab] getOwnedMemories failed', e)
      return []
    }
  }, [characterId, selectedName, forceTick])

  // 空状态保护：没有任何可选角色时
  if (!selectedName || !allNames.length) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 text-center">
        <div className="text-3xl mb-3">👥</div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">暂无多人记忆 / 关系图谱数据</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          添加其他角色并在多人会话中聊天后，这里将显示各角色的独立记忆
        </div>
      </div>
    )
  }

  const coreList = charMemories.filter((m) => m.tier === 'core')
  const emoList = charMemories.filter((m) => m.tier === 'emotional')
  const dailyList = charMemories.filter((m) => m.tier === 'daily')

  const ownedCount = charMemories.filter((m) => m.owner === selectedName).length
  const participantCount = charMemories.length - ownedCount

  // ========== 保存/重置 外观 ==========
  const saveUiOverride = () => {
    const next = {
      ...(override || {}),
    }
    if (displayName.trim()) next.displayName = displayName.trim()
    else delete next.displayName
    if (note.trim()) next.note = note.trim()
    else delete next.note
    if (customAvatar) next.avatar = customAvatar
    else delete next.avatar
    // bubbleColor 单独在下面点选直接保存，这里保持
    if (bubbleColor) next.bubbleColor = bubbleColor
    else delete next.bubbleColor
    registry.setOverride(selectedName, Object.keys(next).length ? next : null)
    refresh()
  }
  const resetUiOverride = () => {
    registry.setOverride(selectedName, null)
    refresh()
  }
  const pickBubbleColor = (hex) => {
    const next = { ...(override || {}) }
    if (hex) next.bubbleColor = hex
    else delete next.bubbleColor
    registry.setOverride(selectedName, Object.keys(next).length ? next : null)
    refresh()
  }

  // ========== 手动加记忆（owner 固定为当前选中角色，下拉锁死，避免用户误把别人记忆写到他人 owner 下） ==========
  const [showAdd, setShowAdd] = useState(false)
  const [newMem, setNewMem] = useState({ tier: 'daily', category: 'experience', content: '' })
  const submitAdd = () => {
    if (!newMem.content.trim()) return
    try {
      const participants = Array.from(new Set(['User', selectedName]))
      const written = addMemoryV2(characterId, {
        tier: newMem.tier,
        category: newMem.category,
        content: newMem.content.trim(),
        source: 'manual',
        confidence: 1.0,
        // ===== 🔒 显式传 owner（B-1 守卫严格模式下多人会话缺 owner 会被拒；这里显式传，确保能写入）=====
        owner: selectedName,
        participants,
        // ===== 告诉守卫：当前 activeCharacters 从 store 读（多人时守卫会验证 owner 是否符合）=====
        multiActive: (() => {
          try {
            const s = (typeof useStore.getState === 'function' ? useStore.getState() : useStore())
            return Array.isArray(s.activeCharacters) ? [...s.activeCharacters] : null
          } catch { return null }
        })(),
        fallbackSpeaker: selectedName,
        strictWriteGuard: true,
        _writeGuardMeta: `MemoryDashboard.OthersTab[${selectedName}]`,
      })
      if (!written) {
        // 守卫拒绝写入 → 提示用户
        alert('写入被「多人记忆写入守卫」拒绝：因为当前处于多人会话，但无法确定 owner 合法。请确认 owner=' + selectedName)
        return
      }
      setNewMem({ tier: 'daily', category: 'experience', content: '' })
      setShowAdd(false)
      refresh()
    } catch (e) {
      console.warn('[OthersTab] addMemoryV2 failed', e)
    }
  }

  // 删除记忆
  const onDel = (id) => {
    try { deleteMemoryV2(characterId, id); refresh() } catch (e) { console.warn(e) }
  }

  // 编辑记忆内容（小功能：双击编辑 content；直接替换一条）
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const startEdit = (m) => { setEditingId(m.id); setEditContent(m.content || '') }
  const saveEdit = () => {
    if (!editingId) return
    try {
      updateMemoryV2(characterId, editingId, (old) => ({
        ...old,
        content: editContent,
        source: 'user_edit',
        lastUpdatedAt: Date.now(),
      }))
      refresh()
    } catch (e) { console.warn(e) }
    setEditingId(null); setEditContent('')
  }

  // 导出该角色记忆
  const exportChar = () => {
    try {
      const all = getOwnedMemories(characterId, selectedName) || []
      const obj = {
        exportedAt: new Date().toISOString(),
        character: selectedName,
        bucketCharacterId: characterId,
        core: all.filter((m) => m.tier === 'core'),
        emotional: all.filter((m) => m.tier === 'emotional'),
        daily: all.filter((m) => m.tier === 'daily'),
      }
      const json = JSON.stringify(obj, null, 2)
      const safe = encodeURIComponent(selectedName.replace(/\s+/g, '_'))
      downloadWithFallback(
        `memory_${safe}_${formatExportTime()}.json`,
        `data:application/json;charset=utf-8,${encodeURIComponent(json)}`,
        json,
      )
    } catch (e) {
      alert('导出失败：' + (e?.message || e))
    }
  }

  // 官方锁定字段：身份、基本信息、性格、战斗、默认服装 —— 只读
  const officialProfileText = getCharacterProfile(selectedName)
  const officialIdentity = official?.identity || official?.官方档案?.身份 || ''
  const officialBasic = official?.基本信息 || official?.官方档案?.基本信息 || ''
  const officialPersonality = official?.personality || official?.性格 || official?.官方档案?.性格 || ''
  const officialCombat = official?.战斗相关 || official?.官方档案?.战斗相关 || ''
  const officialDefaultOutfit = official?.wardrobe?.默认?.outfit
    || official?.服装?.默认?.outfit
    || official?.官方档案?.服装?.默认
    || ''

  return (
    <div className="space-y-4">
      {/* 角色选择器 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">选择角色查看独立记忆</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">每个角色的记忆严格隔离：只看自己的 owner/participants 记录</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
            >+ 手动加记忆</button>
            <button
              onClick={exportChar}
              disabled={!charMemories.length}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >导出 JSON</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {allNames.map((n) => {
            const prof = findCharacter(n)
            const uiN = resolveCharacterUi(n, prof?.name || n, prof?.avatar || '', false)
            const active = selectedName === n
            return (
              <button
                key={n}
                onClick={() => setSelectedName(n)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all border ${
                  active
                    ? 'border-indigo-400 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-300/40'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <div
                  className="w-6 h-6 rounded-full bg-center bg-cover ring-1 ring-slate-200/60 dark:ring-slate-700/60 flex items-center justify-center text-[12px]"
                  style={{ backgroundImage: uiN.avatar ? `url(${uiN.avatar})` : undefined, backgroundColor: uiN.avatar ? undefined : (uiN.bubbleColor || '#94a3b8') }}
                >{!uiN.avatar ? (uiN.displayName || n).slice(0, 1) : ''}</div>
                <span className="font-medium">{uiN.displayName || n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 角色头图 + 统计 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-2xl bg-center bg-cover ring-1 ring-slate-200/60 dark:ring-slate-700/60 flex items-center justify-center text-3xl shrink-0"
            style={{ backgroundImage: ui.avatar ? `url(${ui.avatar})` : undefined, backgroundColor: ui.avatar ? undefined : (ui.bubbleColor || '#94a3b8') }}
          >{!ui.avatar ? (ui.displayName || selectedName).slice(0, 1) : ''}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{ui.displayName || selectedName}</div>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-300 font-medium">🔒 官方设定锁定</span>
              {bubbleColor && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bubbleColor, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }} />
                  气泡颜色
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              {officialProfileText || '未在 sr_characters.json 中找到该角色档案（仅为临时客串角色）'}
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
              <StatCell label="总计记忆" value={charMemories.length} />
              <StatCell label="owner 归属" value={ownedCount} />
              <StatCell label="参与事件" value={participantCount} />
              <StatCell label="核心档案" value={coreList.length} />
            </div>
          </div>
        </div>
      </div>

      {/* 快捷外观设置：头像/昵称/气泡颜色 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">快捷外观修改（仅 UI，不影响官方数据）</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 头像 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs text-slate-500 dark:text-slate-400">自定义头像</label>
              <div className="flex gap-2">
                <button onClick={onPickAvatar} className="text-[11px] px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">选择图片</button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFileChange} />
                <button
                  onClick={() => setCustomAvatar('')}
                  disabled={!customAvatar}
                  className="text-[11px] px-2 py-1 rounded-md border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-500/5 disabled:opacity-40"
                >清空</button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-16 h-16 rounded-2xl bg-center bg-cover ring-1 ring-slate-200/60 dark:ring-slate-700/60 flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundImage: customAvatar ? `url(${customAvatar})` : undefined, backgroundColor: customAvatar ? undefined : (ui.bubbleColor || '#94a3b8') }}
              >{!customAvatar ? (ui.displayName || selectedName).slice(0, 1) : ''}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">支持 PNG/JPG/WEBP 等图片；保存后立即生效。</div>
            </div>
          </div>
          {/* 昵称 + 备注 */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">自定义昵称（displayName，不改官方 name）</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="留空则使用官方名字"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">备注（本地，不影响 AI 人格）</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：这个三月七我想让她更调皮一点..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              />
            </div>
          </div>
          {/* 气泡颜色 */}
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs text-slate-500 dark:text-slate-400">聊天气泡颜色（点击立即保存）</label>
              <button
                onClick={() => pickBubbleColor('')}
                disabled={!bubbleColor}
                className="text-[11px] px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40"
              >恢复默认</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {getBubbleColorHexList().map((hex) => (
                <button
                  key={hex}
                  onClick={() => pickBubbleColor(hex)}
                  className={`w-9 h-9 rounded-full transition-all ${bubbleColor === hex ? 'ring-2 ring-offset-2 ring-slate-900/70 dark:ring-white/70' : 'ring-1 ring-slate-200/70 dark:ring-slate-700/70'}`}
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))}
              <label className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                <span>自定义</span>
                <input
                  type="color"
                  value={bubbleColor || '#86efac'}
                  onChange={(e) => pickBubbleColor(e.target.value)}
                  className="w-5 h-5 bg-transparent border-none p-0 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={saveUiOverride} className="flex-1 py-2 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition-colors">保存外观</button>
          <button onClick={resetUiOverride} className="flex-1 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">重置为官方默认</button>
        </div>
      </div>

      {/* 基础信息编辑（保留官方锁定逻辑） */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">基础信息</div>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-300 font-medium">🔒 核心官方字段不可编辑</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <InfoField label="官方姓名" locked value={official?.name || selectedName} />
          <InfoField label="身份 / 定位" locked value={officialIdentity || '—'} />
          <InfoField label="基本信息" locked multiline value={officialBasic || '—'} />
          <InfoField label="性格 / 说话风格" locked multiline value={officialPersonality || '—'} />
          <InfoField label="战斗相关" locked multiline value={officialCombat || '—'} />
          <InfoField label="默认服装（wardrobe.默认.outfit）" locked value={officialDefaultOutfit || '—'} />
        </div>
      </div>

      {/* 三层独立记忆 */}
      <div className="space-y-4">
        <MemoryTierCard
          tier="core"
          title="🔒 核心档案"
          subtitle="永久保留，该角色自己的身份 / 喜好 / 关系等"
          list={coreList}
          editingId={editingId}
          editContent={editContent}
          setEditContent={setEditContent}
          onStartEdit={startEdit}
          onSaveEdit={saveEdit}
          onCancelEdit={() => setEditingId(null)}
          onDelete={onDel}
        />
        <MemoryTierCard
          tier="emotional"
          title="❤️ 情感精华"
          subtitle="该角色亲身参与的重要情感节点"
          list={emoList}
          editingId={editingId}
          editContent={editContent}
          setEditContent={setEditContent}
          onStartEdit={startEdit}
          onSaveEdit={saveEdit}
          onCancelEdit={() => setEditingId(null)}
          onDelete={onDel}
        />
        <MemoryTierCard
          tier="daily"
          title="📝 日常琐事"
          subtitle="该角色亲身参与的日常闲聊 / 场景事件"
          list={dailyList}
          editingId={editingId}
          editContent={editContent}
          setEditContent={setEditContent}
          onStartEdit={startEdit}
          onSaveEdit={saveEdit}
          onCancelEdit={() => setEditingId(null)}
          onDelete={onDel}
        />
      </div>

      {/* 添加记忆 Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="ios-card w-full max-w-sm p-4 animate-bounce-in">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">为「{selectedName}」添加记忆</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">owner 固定为该角色，participants 自动包含 User 与她。</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">记忆层级</label>
                <select value={newMem.tier} onChange={(e) => setNewMem({ ...newMem, tier: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                  <option value="core">🔒 核心档案（永久保留）</option>
                  <option value="emotional">❤️ 情感精华（永久保留）</option>
                  <option value="daily">📝 日常琐事（30天归档）</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">分类</label>
                <select value={newMem.category} onChange={(e) => setNewMem({ ...newMem, category: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                  <option value="personal_info">个人信息</option>
                  <option value="hobby">爱好</option>
                  <option value="preferences">偏好</option>
                  <option value="relationship">关系</option>
                  <option value="experience">经历事件</option>
                  <option value="promise">承诺</option>
                  <option value="user_expectation">用户期望</option>
                  <option value="character_info">角色信息</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">记忆内容</label>
                <textarea
                  value={newMem.content}
                  onChange={(e) => setNewMem({ ...newMem, content: e.target.value })}
                  rows={3}
                  placeholder="例如：昨天跟用户和流萤一起去了海边，堆了一个沙堡..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">取消</button>
              <button onClick={submitAdd} disabled={!newMem.content.trim()} className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 transition-colors">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoField({ label, value, locked, multiline }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
        {locked && <span className="text-[10px] px-1 rounded bg-rose-500/10 text-rose-600 dark:text-rose-300 font-medium">官方锁定</span>}
      </div>
      <div className={`text-sm text-slate-700 dark:text-slate-200 ${multiline ? 'whitespace-pre-wrap' : 'truncate'}`}>
        {typeof value === 'object' ? (Array.isArray(value) ? value.join('、') : JSON.stringify(value, null, 0).slice(0, 200)) : (value || '—')}
      </div>
    </div>
  )
}

function MemoryTierCard({ tier, title, subtitle, list, editingId, editContent, setEditContent, onStartEdit, onSaveEdit, onCancelEdit, onDelete }) {
  const conf = MEMORY_TIERS[tier]
  if (!list || !list.length) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-sm font-semibold ${conf?.color || 'text-slate-700'}`}>{title}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-500 dark:text-slate-400">暂时没有属于该角色的记忆，等她参与对话后会自动记录。</div>
      </div>
    )
  }
  const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className={`text-sm font-semibold ${conf?.color || 'text-slate-700'}`}>
            {title} <span className="text-slate-400 dark:text-slate-500 text-xs font-normal ml-1">×{sorted.length}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
        </div>
      </div>
      <ul className="space-y-2">
        {sorted.map((m) => (
          <li key={m.id} className={`rounded-lg border border-slate-200 dark:border-slate-700 ${conf?.bg || ''} px-3 py-2 text-sm`}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Tag text={m.category || 'other'} />
                <Tag tone="slate" text={m.owner ? `owner:${m.owner}` : '通用'} />
                {Array.isArray(m.participants) && m.participants.length > 0 && (
                  <Tag tone="indigo" text={`参与:${m.participants.slice(0, 4).join('/')}${m.participants.length > 4 ? `+${m.participants.length - 4}` : ''}`} />
                )}
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatMemoryTime(m.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editingId !== m.id && (
                  <button onClick={() => onStartEdit(m)} className="text-[10px] px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">编辑</button>
                )}
                <button onClick={() => onDelete(m.id)} className="text-[10px] px-2 py-1 rounded-md border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-500/5">删除</button>
              </div>
            </div>
            {editingId === m.id ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={onCancelEdit} className="text-[11px] px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">取消</button>
                  <button onClick={onSaveEdit} className="text-[11px] px-3 py-1 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white">保存</button>
                </div>
              </div>
            ) : (
              <div className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{m.content}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Tag({ text, tone = 'slate' }) {
  const map = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700/70 dark:text-slate-300',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${map[tone] || map.slate}`}>{text}</span>
  )
}
function formatMemoryTime(t) {
  if (!t) return '—'
  try {
    const d = new Date(t)
    if (isNaN(+d)) return '—'
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd} ${hh}:${mi}`
  } catch { return '—' }
}
