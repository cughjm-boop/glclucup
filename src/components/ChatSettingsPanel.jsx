import { useState, useEffect, useRef } from 'react'
import CostControlPanel from './CostControlPanel'

// 角色外观设置（仅修改 UI，不影响角色真实数据）
import {
  getCharacterUiRegistry,
} from '../core/ui/CharacterUiRegistry'
import useStore from '../store/useStore'

export default function ChatSettingsPanel({ character, onSearch, onExport, onEdit, onMemoryDashboard, onUsageStats, hasMessages, onClose }) {
  const [showExportFormats, setShowExportFormats] = useState(false)
  const [showCostControl, setShowCostControl] = useState(false)
  const [showCharacterUi, setShowCharacterUi] = useState(false)
  // A-2：调度器过滤日志折叠条显示开关
  const showDispatcherLogs = useStore((s) => s.showDispatcherLogs)
  const setShowDispatcherLogs = useStore((s) => s.setShowDispatcherLogs)
  const clearDispatcherLogs = useStore((s) => s.clearDispatcherLogs)
  // C-2：长沉默客串自动退场设置
  const [autoDismissMin, setAutoDismissMin] = useState(() => {
    try {
      const s = useStore.getState().getAutoDismissSettings?.()
      return s ? s.minutes : 30
    } catch (_) { return 30 }
  })

  // 角色外观表单
  const reg = getCharacterUiRegistry()
  const initOverride = character?.id ? reg.getOverride(character.id) : {}
  const [displayNameInput, setDisplayNameInput] = useState(initOverride.displayName || '')
  const [avatarOverride, setAvatarOverride] = useState(initOverride.avatarOverride || '')
  const [bubbleColorKey, setBubbleColorKey] = useState(initOverride.bubbleColorKey || '')
  const colorKeys = reg.listColorKeys()
  const [, forceTick] = useState(0)
  const fileInputRef = useRef(null)

  // 每次打开时初始化
  useEffect(() => {
    if (!showCharacterUi || !character?.id) return
    const ov = reg.getOverride(character.id)
    setDisplayNameInput(ov.displayName || '')
    setAvatarOverride(ov.avatarOverride || '')
    setBubbleColorKey(ov.bubbleColorKey || '')
  }, [showCharacterUi, character?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveCharacterUi = () => {
    if (!character?.id) return
    reg.setOverride(character.id, {
      displayName: displayNameInput.trim() ? displayNameInput.trim() : undefined,
      avatarOverride: avatarOverride || undefined,
      bubbleColorKey: bubbleColorKey || undefined,
    })
    forceTick((v) => v + 1)
  }

  const resetCharacterUi = () => {
    if (!character?.id) return
    reg.clearOverride(character.id)
    setDisplayNameInput('')
    setAvatarOverride('')
    setBubbleColorKey('')
    forceTick((v) => v + 1)
  }

  const onAvatarFilePick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result
      if (typeof res === 'string') {
        setAvatarOverride(res)
      }
    }
    reader.readAsDataURL(f)
  }

  const [showDispatcherLogsSection, setShowDispatcherLogsSection] = useState(false)
  const [showAutoDismissSection, setShowAutoDismissSection] = useState(false)
  const menuItems = [
    {
      id: 'appearance',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      ),
      label: '角色外观（仅 UI）',
      desc: '修改头像、昵称、聊天框颜色，不影响角色数据',
      onClick: () => { setShowCostControl(false); setShowCharacterUi((v) => !v); setShowDispatcherLogsSection(false); setShowAutoDismissSection(false) },
      expanded: showCharacterUi,
    },
    {
      id: 'dispatcherLogs',
      icon: '🧾',
      label: '调度器过滤日志',
      desc: showDispatcherLogs ? '已开启：聊天页下方显示折叠条' : '已关闭：不显示越权/代答/重写记录',
      onClick: () => { setShowCostControl(false); setShowCharacterUi(false); setShowAutoDismissSection(false); setShowDispatcherLogsSection((v) => !v) },
      expanded: showDispatcherLogsSection,
    },
    {
      id: 'autoDismiss',
      icon: '⏲️',
      label: '长沉默客串自动退场',
      desc: autoDismissMin === 0 ? '已关闭：客串角色不会被自动送走' : `${autoDismissMin} 分钟没说话的客串会自动退场`,
      onClick: () => { setShowCostControl(false); setShowCharacterUi(false); setShowDispatcherLogsSection(false); setShowAutoDismissSection((v) => !v) },
      expanded: showAutoDismissSection,
    },
    {
      id: 'search',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      label: '查找聊天内容',
      desc: '在当前对话中搜索关键词',
      onClick: onSearch,
    },
    {
      id: 'export',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      label: '导出聊天记录',
      desc: '将当前对话导出为文件',
      disabled: !hasMessages,
      onClick: () => setShowExportFormats(true),
    },
    {
      id: 'edit',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      label: '编辑角色',
      desc: '修改角色名称、头像、设定等',
      onClick: onEdit,
    },
    {
      id: 'memoryDashboard',
      icon: '💎',
      label: '记忆仪表盘',
      desc: '三层记忆金字塔：核心档案、情感精华、日常琐事',
      onClick: onMemoryDashboard,
    },
    {
      id: 'cost',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      label: '成本控制',
      desc: '查看 Token 消耗，切换记忆模式',
      onClick: () => { setShowCharacterUi(false); setShowCostControl(true) },
    },
    {
      id: 'usageStats',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      label: '用量统计',
      desc: '查看 Token 消耗和费用估算',
      onClick: onUsageStats,
    },
  ]

  const placeholderItems = []

  const currentAvatar = avatarOverride || character?.avatar
  const currentDisplayName = displayNameInput.trim() ? displayNameInput : character?.name || 'AI'

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-safe animate-fade-in">
      <div className="ios-card mx-4 mt-4 w-full max-w-lg animate-bounce-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center">
              {currentAvatar ? (
                <img src={currentAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-ios-blue">
                  {String(currentDisplayName || '?').charAt(0)}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                聊天设置
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {currentDisplayName || character?.name || '当前角色'}
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

        {/* Active features */}
        <div className="p-4 space-y-1">
          {menuItems.map((item) => (
            <div key={item.id}>
              <button
                onClick={item.onClick}
                disabled={item.disabled}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                  item.disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : item.expanded
                      ? 'bg-gray-100 dark:bg-gray-800/70'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</p>
                </div>
                <svg className={`w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 transition-transform ${item.expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* —— 角色外观设置展开（M4：头像/昵称/颜色） —— */}
              {item.id === 'appearance' && item.expanded && character?.id && (
                <div className="ml-13 pl-3 border-l-2 border-ios-blue/30 mt-1 mb-2 space-y-4 animate-fade-in">
                  {/* 预览 */}
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">预览</p>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center shadow-inner ring-1 ring-black/5 dark:ring-white/5">
                        {currentAvatar ? (
                          <img src={currentAvatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-semibold text-ios-blue">
                            {String(currentDisplayName).charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {currentDisplayName}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          仅 UI 展示，角色的真实身份、记忆、设定不会被改变。
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 昵称 */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 block">昵称（覆盖显示名）</label>
                    <input
                      className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-ios-blue/40"
                      placeholder={`原名字：${character?.name || ''}`}
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                    />
                  </div>

                  {/* 头像 */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 block">头像（覆盖原头像）</label>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center ring-1 ring-black/5 dark:ring-white/5 flex-shrink-0">
                        {avatarOverride ? (
                          <img src={avatarOverride} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">无</span>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-ios-blue text-white hover:opacity-90 transition-opacity"
                        >
                          从本地上传
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={onAvatarFilePick}
                        />
                        <button
                          onClick={() => setAvatarOverride('')}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                          清除
                        </button>
                      </div>
                    </div>
                    <input
                      className="mt-2 w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-ios-blue/40 font-mono"
                      placeholder="或粘贴头像图片 URL（http://…/https://…）"
                      value={avatarOverride && avatarOverride.startsWith('data:') ? '(本地文件，已填写)' : avatarOverride || ''}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        if (v !== '(本地文件，已填写)') setAvatarOverride(v)
                      }}
                    />
                  </div>

                  {/* 聊天框颜色 */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5 block">聊天框颜色（不随机，固定选择）</label>
                    <div className="grid grid-cols-2 gap-2">
                      {colorKeys.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => setBubbleColorKey(c.key === bubbleColorKey ? '' : c.key)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-all ${
                            c.key === bubbleColorKey
                              ? 'ring-2 ring-ios-blue bg-ios-blue/5 dark:bg-ios-blue/10'
                              : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span
                            className="w-5 h-5 rounded-full border border-black/10 dark:border-white/10 flex-shrink-0"
                            style={{ background: c.preview }}
                          />
                          <span className="truncate text-gray-800 dark:text-gray-200">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 按钮 */}
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      onClick={resetCharacterUi}
                      className="px-3 py-2 rounded-xl text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      重置
                    </button>
                    <button
                      onClick={saveCharacterUi}
                      className="px-3 py-2 rounded-xl text-xs font-medium bg-ios-blue text-white hover:opacity-90 transition-opacity"
                    >
                      保存（立即生效）
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Export format picker */}
          {showExportFormats && (
            <div className="ml-13 pl-3 border-l-2 border-ios-blue/30 space-y-1 animate-fade-in">
              <button
                onClick={() => { onExport('json'); setShowExportFormats(false); onClose() }}
                className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono">JSON</span>
                <span>JSON 格式</span>
              </button>
              <button
                onClick={() => { onExport('txt'); setShowExportFormats(false); onClose() }}
                className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono">TXT</span>
                <span>TXT 文本格式</span>
              </button>
            </div>
          )}

          {/* —— A-2：调度器过滤日志展开 —— */}
          {showDispatcherLogsSection && (
            <div className="ml-13 pl-3 border-l-2 border-ios-blue/30 mt-1 mb-2 space-y-3 animate-fade-in">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">显示过滤日志折叠条</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">有内容时在聊天页下方出现，查看越权发言、代答、重写次数、自动修正等透明化信息</p>
                  </div>
                  <button
                    onClick={() => setShowDispatcherLogs(!showDispatcherLogs)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${showDispatcherLogs ? 'bg-ios-blue' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${showDispatcherLogs ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { clearDispatcherLogs(character?.id) }}
                    className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    清除当前角色日志
                  </button>
                  <button
                    onClick={() => { clearDispatcherLogs() }}
                    className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    清除全部日志
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* —— C-2：长沉默客串自动退场展开 —— */}
          {showAutoDismissSection && (
            <div className="ml-13 pl-3 border-l-2 border-ios-blue/30 mt-1 mb-2 space-y-3 animate-fade-in">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 space-y-3">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  超过阈值不说话的客串角色，会自动离开并插一条系统消息。
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 0, label: '关闭', desc: '不会自动退场' },
                    { v: 15, label: '15 分钟', desc: '短会首选' },
                    { v: 30, label: '30 分钟', desc: '推荐默认' },
                    { v: 60, label: '60 分钟', desc: '长会话首选' },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => {
                        setAutoDismissMin(opt.v)
                        try {
                          useStore.getState().setAutoDismissSettings?.({ minutes: opt.v })
                        } catch (_) {}
                      }}
                      className={`p-2.5 rounded-xl text-left transition-all ${
                        autoDismissMin === opt.v
                          ? 'ring-2 ring-ios-blue bg-ios-blue/5 dark:bg-ios-blue/10'
                          : 'bg-white dark:bg-gray-800/70 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-100 dark:border-gray-700'
                      }`}
                    >
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{opt.label}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  ⓘ 主角色不会被自动退场；每个客串"自己的最后发言时间"独立计算，召唤后从未发言则从召唤时起算。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Divider + reserved area */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wide">
            更多功能（即将推出）
          </p>
          <div className="space-y-1">
            {placeholderItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl opacity-50"
              >
                <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg flex-shrink-0">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-4">
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            聊天设置仅对当前对话生效，不同角色相互独立
          </p>
        </div>
      </div>

      {/* Cost control panel */}
      {showCostControl && (
        <CostControlPanel onClose={() => setShowCostControl(false)} />
      )}
    </div>
  )
}
