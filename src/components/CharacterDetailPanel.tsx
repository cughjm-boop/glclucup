// ===== 角色数据库中心 — 角色详情面板 =====
//
// 显示单个角色的完整校验详情：
//   - 完成度百分比
//   - 缺失字段列表
//   - 错误/警告描述
//   - 预留"自动修复"按钮

import type { CharacterReport } from '../tools/validator/types'

interface CharacterDetailPanelProps {
  report: CharacterReport | null
  onClose: () => void
}

function IssueItem({
  description,
  severity,
}: {
  description: string
  severity: 'error' | 'warning' | 'info'
}) {
  const iconMap = {
    error: (
      <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    info: (
      <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  }

  const bgMap = {
    error: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30',
    warning: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30',
    info: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30',
  }

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${bgMap[severity]}`}>
      {iconMap[severity]}
      <span className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
        {description}
      </span>
    </div>
  )
}

export default function CharacterDetailPanel({ report, onClose }: CharacterDetailPanelProps) {
  if (!report) return null

  const pct = report.completionPercentage
  const allIssues = [...report.errors, ...report.warnings]

  return (
    <>
      {/* 半透明遮罩 */}
      <div
        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* 底部滑出面板 */}
      <div className="fixed inset-x-0 bottom-0 z-30 animate-slide-up"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        <div className="ios-card mx-3 mb-3 max-h-[60vh] overflow-hidden flex flex-col rounded-t-3xl rounded-b-2xl">
          {/* 拖拽手柄 */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-8 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>

          {/* 头部 */}
          <div className="px-5 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {report.characterName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 w-24 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-sm font-bold ${
                  pct >= 100 ? 'text-green-600 dark:text-green-400' : pct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {pct}%
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 滚动内容区 */}
          <div className="overflow-y-auto px-5 pb-5 space-y-4">
            {/* 缺失字段 */}
            {report.missingFields.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  缺失字段 ({report.missingFields.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {report.missingFields.map((field) => (
                    <span
                      key={field}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/30"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 无问题提示 */}
            {allIssues.length === 0 && report.missingFields.length === 0 && (
              <div className="text-center py-6">
                <svg className="w-10 h-10 mx-auto text-green-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-gray-500 dark:text-gray-400">角色数据完整，无问题</p>
              </div>
            )}

            {/* 错误列表 */}
            {report.errors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-red-500 dark:text-red-400 uppercase tracking-wide mb-2">
                  错误 ({report.errors.length})
                </h4>
                <div className="space-y-1.5">
                  {report.errors.map((err, i) => (
                    <IssueItem key={`err-${i}`} description={err.description} severity="error" />
                  ))}
                </div>
              </div>
            )}

            {/* 警告列表 */}
            {report.warnings.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-amber-500 dark:text-amber-400 uppercase tracking-wide mb-2">
                  警告 ({report.warnings.length})
                </h4>
                <div className="space-y-1.5">
                  {report.warnings.map((warn, i) => (
                    <IssueItem key={`warn-${i}`} description={warn.description} severity="warning" />
                  ))}
                </div>
              </div>
            )}

            {/* 自动修复按钮（预留，暂不可用） */}
            <div className="pt-2">
              <button
                disabled
                className="w-full py-3 rounded-full text-sm font-semibold bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                自动修复（即将推出）
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}