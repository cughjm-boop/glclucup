// ===== 角色数据库中心 — 角色完成度列表 =====
//
// 显示所有角色的完成度进度条列表。
// 点击角色名称可展开详情（通过 onSelectCharacter 回调）。

import type { CharacterReport } from '../tools/validator/types'

interface CharacterCompletionListProps {
  reports: CharacterReport[]
  selectedName: string | null
  onSelectCharacter: (name: string) => void
}

/** 根据完成度百分比返回颜色类 */
function getProgressColor(pct: number): string {
  if (pct >= 100) return 'bg-green-500'
  if (pct >= 75) return 'bg-emerald-500'
  if (pct >= 50) return 'bg-amber-500'
  if (pct >= 25) return 'bg-orange-500'
  return 'bg-red-500'
}

/** 根据完成度百分比返回文字颜色 */
function getTextColor(pct: number): string {
  if (pct >= 100) return 'text-green-600 dark:text-green-400'
  if (pct >= 75) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400'
  if (pct >= 25) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

function CharacterRow({
  report,
  isSelected,
  onSelect,
}: {
  report: CharacterReport
  isSelected: boolean
  onSelect: () => void
}) {
  const pct = report.completionPercentage
  const hasIssues = report.errors.length > 0 || report.warnings.length > 0

  return (
    <button
      onClick={onSelect}
      className={`w-full px-4 py-3 flex items-center gap-3 transition-colors active:bg-gray-100 dark:active:bg-gray-800 ${
        isSelected
          ? 'bg-ios-blue/5 dark:bg-ios-blue/10 border-l-2 border-ios-blue'
          : 'border-l-2 border-transparent'
      }`}
    >
      {/* 角色名 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {report.characterName}
          </span>
          {hasIssues && (
            <span className="flex-shrink-0 flex items-center gap-1">
              {report.errors.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              )}
              {report.warnings.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </span>
          )}
        </div>

        {/* 进度条 */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getProgressColor(pct)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-xs font-semibold tabular-nums ${getTextColor(pct)}`}>
            {pct}%
          </span>
        </div>
      </div>

      {/* 展开箭头 */}
      <svg
        className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform flex-shrink-0 ${
          isSelected ? 'rotate-90' : ''
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

export default function CharacterCompletionList({
  reports,
  selectedName,
  onSelectCharacter,
}: CharacterCompletionListProps) {
  if (reports.length === 0) {
    return (
      <div className="ios-card p-8 text-center">
        <svg
          className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-sm text-gray-500 dark:text-gray-400">暂无角色数据</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">点击上方"开始扫描"按钮进行分析</p>
      </div>
    )
  }

  return (
    <div className="ios-card overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
      {/* 列表头 */}
      <div className="px-4 py-2.5 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/30">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          角色完成度
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {reports.length} 个角色
        </span>
      </div>

      {/* 角色列表 */}
      <div className="max-h-[calc(100vh-480px)] overflow-y-auto">
        {reports.map((report) => (
          <CharacterRow
            key={report.characterName}
            report={report}
            isSelected={selectedName === report.characterName}
            onSelect={() => onSelectCharacter(report.characterName)}
          />
        ))}
      </div>
    </div>
  )
}