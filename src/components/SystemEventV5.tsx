import React from 'react'

interface SystemEventProps {
  text: string
  timestamp?: number
}

/** V5 系统事件消息（如"📢 三月七加入了聊天"） */
export function SystemEvent({ text, timestamp }: SystemEventProps) {
  const timeStr = timestamp ? formatTime(timestamp) : ''
  return (
    <div className="v5-sys" role="status">
      <div className="v5-sys-line" />
      <div className="v5-sys-box">
        <span className="v5-sys-text">{text}</span>
        {timeStr && <span className="v5-sys-time">{timeStr}</span>}
      </div>
      <div className="v5-sys-line" />
      <style>{`
        .v5-sys { display: flex; align-items: center; gap: 10px; margin: 10px 0; padding: 0 6px; }
        .v5-sys-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, #48484a, transparent); }
        .v5-sys-box { display: flex; align-items: center; gap: 6px; padding: 5px 12px; background: rgba(56,56,58,0.7); border-radius: 14px; animation: v5-sys-in 0.3s; }
        @keyframes v5-sys-in { from { opacity:0; transform: translateY(-4px);} to{opacity:1;transform:translateY(0);} }
        .v5-sys-text { font-size: 12px; color: #8e8e93; font-weight: 500; }
        .v5-sys-time { font-size: 10px; color: #636366; }
      `}</style>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
