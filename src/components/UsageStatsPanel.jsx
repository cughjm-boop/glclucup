import { useState, useEffect, useCallback } from 'react'
import { getUsageStats, resetMonthlyStats, exportUsageReport } from '../services/costTracker'
import { downloadWithFallback, getDateStr } from '../utils/exportUtils'

export default function UsageStatsPanel({ characters, onClose }) {
  const [stats, setStats] = useState(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showExportFormats, setShowExportFormats] = useState(false)
  const [message, setMessage] = useState(null)

  const refreshStats = useCallback(() => {
    const data = getUsageStats()
    setStats(data)
  }, [])

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  // 获取角色名称
  const getCharName = (charId) => {
    const char = characters?.find((c) => c.id === charId)
    return char?.name || charId.slice(0, 8)
  }

  if (!stats) return null

  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentMonth = stats.monthly[monthKey] || { inputTokens: 0, outputTokens: 0, cost: 0, characterStats: {} }

  const formatTokens = (n) => n.toLocaleString()
  const formatCost = (n) => `¥${n.toFixed(4)}`

  const handleExport = async (format) => {
    try {
      const content = exportUsageReport(format)
      const dateStr = getDateStr()
      const filename = `Token用量报告_${dateStr}.${format}`
      const mimeType = format === 'json' ? 'application/json' : 'text/plain;charset=utf-8'

      const result = await downloadWithFallback(content, filename, mimeType, {
        label: '用量报告',
      })
      if (result.success) {
        setMessage({ type: 'success', text: '导出成功' })
      } else {
        setMessage({ type: 'error', text: result.error || '导出失败' })
      }
      setShowExportFormats(false)
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
      setShowExportFormats(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleReset = () => {
    resetMonthlyStats()
    refreshStats()
    setShowResetConfirm(false)
    setMessage({ type: 'success', text: '本月统计已重置' })
    setTimeout(() => setMessage(null), 3000)
  }

  const charStatsEntries = Object.entries(currentMonth.characterStats || {})

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-safe animate-fade-in">
      <div className="ios-card mx-4 mt-4 w-full max-w-lg max-h-[85vh] overflow-y-auto animate-bounce-in">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400/20 to-blue-400/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">用量统计</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">DeepSeek · 输入1元/百万token · 输出2元/百万token</p>
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

        <div className="p-4 space-y-4">
          {/* 本次会话 */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 p-4 border border-blue-100 dark:border-blue-900/30">
            <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              本次会话
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">输入 Token</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatTokens(stats.sessionInputTokens)}</p>
              </div>
              <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">输出 Token</p>
                <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{formatTokens(stats.sessionOutputTokens)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">本次费用</p>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{formatCost(stats.sessionCost)}</p>
            </div>
          </div>

          {/* 本月累计 */}
          <div className="rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 border border-green-100 dark:border-green-900/30">
            <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              本月累计 ({monthKey})
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">输入 Token</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatTokens(currentMonth.inputTokens)}</p>
              </div>
              <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">输出 Token</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatTokens(currentMonth.outputTokens)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">本月总 Token</p>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {formatTokens(currentMonth.inputTokens + currentMonth.outputTokens)}
              </p>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">本月累计费用</p>
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{formatCost(currentMonth.cost)}</p>
            </div>
          </div>

          {/* 按角色统计 */}
          {charStatsEntries.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                按角色统计
              </h3>
              <div className="space-y-2">
                {charStatsEntries.map(([charId, charStats]) => (
                  <div key={charId} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center text-xs font-semibold text-ios-blue">
                      {getCharName(charId).charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{getCharName(charId)}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        输入 {formatTokens(charStats.inputTokens)} · 输出 {formatTokens(charStats.outputTokens)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">{formatCost(charStats.cost)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowExportFormats(!showExportFormats)}
              className="flex-1 ios-button-secondary text-sm py-2.5"
            >
              导出用量报告
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium text-red-500 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
            >
              重置本月统计
            </button>
          </div>

          {/* 导出格式选择 */}
          {showExportFormats && (
            <div className="ml-4 pl-3 border-l-2 border-ios-blue/30 space-y-1 animate-fade-in">
              <button
                onClick={() => handleExport('json')}
                className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono">JSON</span>
                <span>JSON 格式</span>
              </button>
              <button
                onClick={() => handleExport('txt')}
                className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono">TXT</span>
                <span>TXT 文本格式</span>
              </button>
            </div>
          )}

          {/* 提示信息 */}
          {stats.sessionInputTokens === 0 && stats.sessionOutputTokens === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400 dark:text-gray-500">暂无数据，发送消息后开始统计</p>
            </div>
          )}
        </div>
      </div>

      {/* 重置确认弹窗 */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full animate-scale-in">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">重置本月统计</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              确定要重置本月 Token 统计数据吗？此操作不可撤销。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                确定重置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 提示消息 */}
      {message && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[350] px-5 py-3 rounded-2xl text-white text-sm font-medium shadow-2xl animate-bounce-in"
          style={{ backgroundColor: message.type === 'success' ? '#34C759' : '#EF4444' }}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}