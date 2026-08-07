import React, { useState, useEffect } from 'react'
import type { MultiCharacterEngineV4 } from '../core/multiCharacter/MultiCharacterEngineV4'

interface DebugPanelProps {
  engine: MultiCharacterEngineV4 | null
  conversationId: string
  visible: boolean
  onClose: () => void
}

/** 多人聊天调试面板（开发者工具） */
export function DebugPanel({ engine, conversationId, visible, onClose }: DebugPanelProps) {
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'state' | 'logs' | 'interactions' | 'constraints'>('state')

  useEffect(() => {
    if (!visible || !engine) return
    const update = () => setDebugInfo(engine.getDebugInfo())
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [visible, engine])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (visible) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visible, onClose])

  if (!visible) return null

  const tabs: Array<{ id: typeof activeTab; label: string }> = [
    { id: 'state', label: '状态' },
    { id: 'logs', label: '日志' },
    { id: 'interactions', label: '互动矩阵' },
    { id: 'constraints', label: '约束' },
  ]

  return (
    <div className="mce-debug-overlay" onClick={onClose}>
      <div className="mce-debug-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mce-debug-header">
          <span className="mce-debug-title">🔧 多人聊天调试</span>
          <span className="mce-debug-conv">会话: {conversationId}</span>
          <button className="mce-debug-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="mce-debug-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`mce-debug-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mce-debug-body">
          {activeTab === 'state' && debugInfo && (
            <div className="mce-debug-state">
              <div className="mce-debug-section-title">在场角色 ({debugInfo.present.length})</div>
              {debugInfo.present.map((p: any) => (
                <div key={p.id} className="mce-debug-char-row">
                  <span className="mce-debug-char-name">{p.name}</span>
                  <span className="mce-debug-stat">存在感: {p.presence}</span>
                  <span className="mce-debug-stat">主动性: {p.initiative}</span>
                  <span className="mce-debug-stat">发言{ p.speakCount }次</span>
                  {p.cooldown > 0 && <span className="mce-debug-cooldown">冷却 {p.cooldown}</span>}
                </div>
              ))}
              <div className="mce-debug-section-title">共享记忆: {debugInfo.sharedMemorySize} 条</div>
              <div className="mce-debug-section-title">上次发言: {debugInfo.lastSpeakerId || '无'}</div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="mce-debug-logs">
              <div className="mce-debug-log-empty">日志将在交互时自动追加（本地存储）</div>
              {logs.map((l, i) => (
                <div key={i} className="mce-debug-log-line">{l}</div>
              ))}
            </div>
          )}

          {activeTab === 'interactions' && (
            <div className="mce-debug-interactions">
              <InteractionList present={debugInfo?.present.map((p: any) => p.name) || []} />
            </div>
          )}

          {activeTab === 'constraints' && (
            <div className="mce-debug-constraints">
              <div className="mce-debug-log-empty">约束将在每轮对话生成时计算并注入 Prompt</div>
            </div>
          )}
        </div>

        <style>{`
          .mce-debug-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center;
            z-index: 9999; animation: mce-fade-in 0.2s ease-out;
          }
          @keyframes mce-fade-in { from { opacity: 0; } to { opacity: 1; } }
          .mce-debug-panel {
            width: 90%; max-width: 480px; max-height: 80vh;
            background: #1c1c1e; border-radius: 16px;
            box-shadow: 0 16px 48px rgba(0,0,0,0.5);
            display: flex; flex-direction: column; overflow: hidden;
            border: 1px solid #3a3a3c;
          }
          .mce-debug-header {
            display: flex; align-items: center; gap: 12px;
            padding: 16px; border-bottom: 1px solid #3a3a3c;
          }
          .mce-debug-title { font-size: 15px; font-weight: 600; color: #fff; }
          .mce-debug-conv { font-size: 11px; color: #636366; flex: 1; }
          .mce-debug-close {
            background: none; border: none; color: #8e8e93; font-size: 20px; cursor: pointer;
          }
          .mce-debug-tabs { display: flex; border-bottom: 1px solid #3a3a3c; }
          .mce-debug-tab {
            flex: 1; padding: 10px; background: none; border: none;
            color: #8e8e93; font-size: 13px; cursor: pointer;
            border-bottom: 2px solid transparent;
          }
          .mce-debug-tab.active { color: #007aff; border-bottom-color: #007aff; }
          .mce-debug-body { flex: 1; overflow-y: auto; padding: 16px; }
          .mce-debug-section-title { font-size: 12px; color: #636366; margin: 12px 0 6px; }
          .mce-debug-char-row {
            display: flex; align-items: center; gap: 8px;
            padding: 8px; background: #2c2c2e; border-radius: 8px; margin-bottom: 6px;
            flex-wrap: wrap;
          }
          .mce-debug-char-name { font-weight: 600; color: #fff; min-width: 60px; }
          .mce-debug-stat { font-size: 11px; color: #8e8e93; }
          .mce-debug-cooldown { font-size: 10px; color: #ff9500; }
          .mce-debug-log-empty { color: #636366; font-size: 13px; padding: 20px; text-align: center; }
          .mce-debug-log-line { font-size: 12px; color: #8e8e93; padding: 4px 0; font-family: monospace; }
          .mce-debug-interactions, .mce-debug-constraints { font-size: 12px; color: #8e8e93; }
        `}</style>
      </div>
    </div>
  )
}

/** 互动矩阵列表展示 */
function InteractionList({ present }: { present: string[] }) {
  const { getAllInteractionRules } = require('../core/multiCharacter/InteractionMatrix')
  const rules = getAllInteractionRules()
  const filtered = rules.filter((r: any) => present.includes(r.a) && present.includes(r.b))

  if (filtered.length === 0) {
    return <div className="mce-debug-log-empty">当前在场角色之间没有预定义互动规则</div>
  }

  return (
    <div>
      {filtered.map((r: any, i: number) => (
        <div key={i} className="mce-debug-char-row">
          <span className="mce-debug-char-name">{r.a} ↔ {r.b}</span>
          <span className="mce-debug-stat">语气: {r.tone}</span>
          <span className="mce-debug-stat">频率: {r.frequency}</span>
        </div>
      ))}
    </div>
  )
}
