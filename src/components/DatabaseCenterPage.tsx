// ===== 角色数据库中心 — 主页面 =====
//
// 入口：设置 → 开发者工具 → 角色数据库
//
// 功能：
//   1. 扫描按钮 + 扫描时间显示
//   2. 概览卡片（角色总数、通过、警告、错误）
//   3. 角色完成度列表（进度条）
//   4. 点击角色展开详情面板

import { useState, useCallback } from 'react'
import useStore from '../store/useStore'
import { scanAllCharacters } from '../tools/validator/scan'
import type { ScanReport, CharacterReport } from '../tools/validator/types'
import ScanOverviewCard from './ScanOverviewCard'
import CharacterCompletionList from './CharacterCompletionList'
import CharacterDetailPanel from './CharacterDetailPanel'

export default function DatabaseCenterPage() {
  const { setView } = useStore()

  const [report, setReport] = useState<ScanReport | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  const selectedReport: CharacterReport | null =
    selectedName && report
      ? report.characterReports.find((r) => r.characterName === selectedName) ?? null
      : null

  const handleScan = useCallback(() => {
    setIsScanning(true)
    setSelectedName(null)

    // 使用 requestAnimationFrame 让 UI 先更新 loading 状态
    requestAnimationFrame(() => {
      try {
        const result = scanAllCharacters()
        setReport(result)
      } catch (err) {
        console.error('扫描失败:', err)
      } finally {
        setIsScanning(false)
      }
    })
  }, [])

  const handleSelectCharacter = useCallback((name: string) => {
    setSelectedName((prev) => (prev === name ? null : name))
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedName(null)
  }, [])

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#f2f2f7] dark:bg-gray-950 animate-fade-in"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* ===== 顶部导航栏 ===== */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between
        bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-800/60">
        <button
          onClick={() => setView('settings')}
          className="flex items-center gap-1 text-ios-blue dark:text-ios-blue hover:opacity-80 transition-opacity"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">设置</span>
        </button>

        <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">
          角色数据库
        </h1>

        {/* 占位，保持标题居中 */}
        <div className="w-14" />
      </div>

      {/* ===== 内容区 ===== */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
          {/* 扫描操作区 */}
          <div className="ios-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  数据扫描
                </h2>
                {report && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    上次扫描：{formatTime(report.scanTime)}
                  </p>
                )}
                {!report && !isScanning && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    点击按钮扫描所有角色数据
                  </p>
                )}
              </div>

              <button
                onClick={handleScan}
                disabled={isScanning}
                className="ios-button flex items-center gap-2 text-sm py-2.5 px-5"
              >
                {isScanning ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    扫描中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {report ? '重新扫描' : '开始扫描'}
                  </>
                )}
              </button>
            </div>

            {/* Schema 版本信息 */}
            {report && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                <span>Schema v{report.schemaVersion}</span>
                <span>世界观文件: {report.worldviewCount}</span>
              </div>
            )}
          </div>

          {/* 扫描概览卡片 */}
          <ScanOverviewCard report={report} />

          {/* 角色完成度列表 */}
          <CharacterCompletionList
            reports={report?.characterReports ?? []}
            selectedName={selectedName}
            onSelectCharacter={handleSelectCharacter}
          />
        </div>
      </div>

      {/* 角色详情面板（底部抽屉） */}
      <CharacterDetailPanel
        report={selectedReport}
        onClose={handleCloseDetail}
      />
    </div>
  )
}