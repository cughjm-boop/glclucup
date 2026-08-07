// ===== 角色数据库中心 — 扫描概览卡片 =====
//
// 显示扫描结果的四个核心指标：
//   角色总数、通过数量、警告数量、错误数量

import type { ScanReport } from '../tools/validator/types'

interface ScanOverviewCardProps {
  report: ScanReport | null
}

interface StatItemProps {
  value: number
  label: string
  color: string
  icon: React.ReactNode
}

function StatItem({ value, label, color, icon }: StatItemProps) {
  return (
    <div className="flex flex-col items-center p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${color}`}>
        {icon}
      </div>
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {value}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {label}
      </span>
    </div>
  )
}

export default function ScanOverviewCard({ report }: ScanOverviewCardProps) {
  if (!report) {
    return (
      <div className="ios-card p-4 animate-pulse">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex flex-col items-center p-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-3 w-10 bg-gray-100 dark:bg-gray-800 rounded mt-1" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const stats: StatItemProps[] = [
    {
      value: report.totalCharacters,
      label: '角色总数',
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      value: report.passCount,
      label: '通过',
      color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      value: report.warningCount,
      label: '警告',
      color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
    },
    {
      value: report.errorCount,
      label: '错误',
      color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="ios-card p-4">
      <div className="grid grid-cols-4 gap-3">
        {stats.map((stat) => (
          <StatItem key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  )
}