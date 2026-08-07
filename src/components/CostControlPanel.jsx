import { useState } from 'react'
import useStore from '../store/useStore'
import { MEMORY_MODES, getCurrentMonthCost } from '../services/costTracker'

function formatCost(cost) {
  if (cost < 0.01) return '< 0.01 元'
  return `${cost.toFixed(2)} 元`
}

function formatTokens(tokens) {
  if (tokens < 1000) return `${tokens}`
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`
  return `${(tokens / 1000000).toFixed(1)}M`
}

export default function CostControlPanel({ onClose }) {
  const { memoryMode, setMemoryMode: setMode, refreshCostData } = useStore()
  const [showConfirmSwitch, setShowConfirmSwitch] = useState(null)

  const monthCost = getCurrentMonthCost()
  const currentConfig = MEMORY_MODES[memoryMode] || MEMORY_MODES.standard
  const budgetUsed = Math.min((monthCost.cost / currentConfig.budget) * 100, 100)

  const handleSwitchMode = (mode) => {
    setShowConfirmSwitch(mode)
  }

  const confirmSwitch = () => {
    if (showConfirmSwitch) {
      setMode(showConfirmSwitch)
      refreshCostData()
      setShowConfirmSwitch(null)
    }
  }

  const taskLabels = {
    deepReflection: '深度反思',
    associationNetwork: '关联网络',
    emotionSensing: '情绪感知',
    monologue: '内心独白',
    smartTopic: '智能话题',
    anniversary: '纪念日提醒',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-safe animate-fade-in overflow-y-auto py-8">
      <div className="ios-card mx-4 w-full max-w-lg animate-bounce-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                记忆系统成本控制
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                基于 DeepSeek 定价 · 输入 1元/M token · 输出 2元/M token
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
          {/* Budget overview */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              当月消耗 ({currentConfig.icon} {currentConfig.label}模式)
            </h3>
            <div className="space-y-3">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>{formatCost(monthCost.cost)} / {formatCost(currentConfig.budget)}</span>
                  <span>{budgetUsed.toFixed(0)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      budgetUsed > 80 ? 'bg-red-500' : budgetUsed > 50 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${budgetUsed}%` }}
                  />
                </div>
              </div>

              {/* Detail stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">输入 Token</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {formatTokens(monthCost.inputTokens || 0)}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">输出 Token</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {formatTokens(monthCost.outputTokens || 0)}
                  </p>
                </div>
              </div>

              {/* Task breakdown */}
              {monthCost.tasks && Object.keys(monthCost.tasks).length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">各任务消耗</p>
                  <div className="space-y-1">
                    {Object.entries(monthCost.tasks).map(([task, info]) => (
                      <div key={task} className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">
                          {taskLabels[task] || task}
                        </span>
                        <span className="text-gray-500 dark:text-gray-500">
                          {info.count}次 · {formatCost(info.cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mode selection */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              选择模式
            </h3>
            <div className="space-y-2">
              {Object.entries(MEMORY_MODES).map(([key, config]) => {
                const isActive = memoryMode === key
                return (
                  <button
                    key={key}
                    onClick={() => !isActive && handleSwitchMode(key)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                      isActive
                        ? 'bg-ios-blue/10 border border-ios-blue/30'
                        : 'bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-xl">{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          {config.label}
                        </p>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ios-blue text-white font-medium">
                            当前
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {config.desc}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      ￥{config.budget}/月
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mode features */}
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              当前模式功能状态
            </h3>
            <div className="space-y-1.5">
              {Object.entries(taskLabels).map(([key, label]) => {
                const value = currentConfig[key]
                let status
                if (value === true) status = { text: '开启', color: 'text-green-600 dark:text-green-400' }
                else if (value === 0) status = { text: '禁用', color: 'text-red-400 dark:text-red-500' }
                else if (typeof value === 'number') status = { text: `每${value}天`, color: 'text-gray-500 dark:text-gray-400' }
                else status = { text: '—', color: 'text-gray-400' }

                return (
                  <div key={key} className="flex justify-between items-center py-1.5">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
                    <span className={`text-xs font-medium ${status.color}`}>{status.text}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-4">
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            超出预算后增强功能自动暂停，正常聊天不受影响
          </p>
        </div>
      </div>

      {/* Confirm switch modal */}
      {showConfirmSwitch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="ios-card mx-4 p-6 max-w-sm animate-bounce-in">
            <p className="text-sm text-gray-700 dark:text-gray-300 text-center mb-4">
              切换到 {MEMORY_MODES[showConfirmSwitch]?.label} 模式？
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mb-4">
              {MEMORY_MODES[showConfirmSwitch]?.desc}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmSwitch(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-400"
              >
                取消
              </button>
              <button
                onClick={confirmSwitch}
                className="flex-1 py-2.5 rounded-xl bg-ios-blue text-white text-sm font-medium"
              >
                确认切换
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}