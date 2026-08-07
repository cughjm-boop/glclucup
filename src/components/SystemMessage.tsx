import React from 'react'

interface SystemMessageProps {
  text: string
  icon?: string
  timestamp?: number
}

/** 系统事件消息（如"三月七加入了聊天"） */
export function SystemMessage({ text, icon, timestamp }: SystemMessageProps) {
  const timeStr = timestamp ? formatTime(timestamp) : ''
  return (
    <div className="mce-system-message" role="status" aria-live="polite">
      <div className="mce-system-line" />
      <div className="mce-system-content">
        {icon && <span className="mce-system-icon">{icon}</span>}
        <span className="mce-system-text">{text}</span>
        {timeStr && <span className="mce-system-time">{timeStr}</span>}
      </div>
      <div className="mce-system-line" />
      <style>{`
        .mce-system-message {
          display: flex; align-items: center; gap: 12px;
          margin: 12px 0; padding: 0 8px;
        }
        .mce-system-line {
          flex: 1; height: 1px;
          background: linear-gradient(90deg, transparent, #48484a, transparent);
        }
        .mce-system-content {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 14px; background: rgba(56,56,58,0.7);
          border-radius: 16px; flex-shrink: 0;
          animation: mce-system-in 0.3s ease-out;
        }
        @keyframes mce-system-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .mce-system-icon { font-size: 14px; }
        .mce-system-text { font-size: 12px; color: #8e8e93; font-weight: 500; }
        .mce-system-time { font-size: 10px; color: #636366; }
      `}</style>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 入场动作文本（显示在消息气泡前） */
export function EntryActionText({ text }: { text: string }) {
  return (
    <div className="mce-entry-action" aria-label="入场动作">
      <span className="mce-entry-text">{text}</span>
      <style>{`
        .mce-entry-action {
          margin: 8px 0 4px; padding: 6px 12px;
          background: rgba(56,56,58,0.4);
          border-left: 3px solid #007aff;
          border-radius: 4px;
          animation: mce-entry-in 0.4s ease-out;
        }
        @keyframes mce-entry-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .mce-entry-text { font-size: 13px; color: #8e8e93; font-style: italic; }
      `}</style>
    </div>
  )
}
