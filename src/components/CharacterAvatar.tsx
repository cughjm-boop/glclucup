import React, { useState, useCallback, useRef } from 'react'
import type { CharacterRuntimeV4 } from '../core/multiCharacter/CharacterRuntimeV4'

interface CharacterAvatarProps {
  runtime: CharacterRuntimeV4
  /** 当前是否为发言者（高亮） */
  isActive: boolean
  /** 是否刚入场（淡入） */
  isEntering?: boolean
  /** 是否刚离场（淡出） */
  isLeaving?: boolean
  onClick?: () => void
}

/** 角色头像卡片 */
export function CharacterAvatar({ runtime, isActive, isEntering, isLeaving, onClick }: CharacterAvatarProps) {
  const [showCard, setShowCard] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback(() => {
    setShowCard((v) => !v)
    onClick?.() => void
  }, [onClick])

  const handleClose = useCallback(() => setShowCard(false), [])

  // 点击外部关闭卡片
  React.useEffect(() => {
    if (!showCard) return
    const handleOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowCard(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showCard])

  const emotionColors: Record<string, string> = {
    neutral: '#8e8e93', happy: '#34c759', sad: '#007aff',
    angry: '#ff3b30', curious: '#5ac8fa', shy: '#ff2d55',
    serious: '#5856d6', playful: '#ff9500', tired: '#8e8e93', surprised: '#af52de',
  }

  const animationClass = isEntering
    ? 'mce-avatar-enter'
    : isLeaving
    ? 'mce-avatar-leave'
    : ''

  return (
    <div className="mce-avatar-wrapper" ref={cardRef}>
      <button
        className={`mce-avatar ${isActive ? 'mce-avatar-active' : ''} ${animationClass}`}
        onClick={handleClick}
        style={{ '--emotion-color': emotionColors[runtime.emotion] || '#8e8e93' } as React.CSSProperties}
      >
        <div className="mce-avatar-img" aria-hidden>
          <span className="mce-avatar-initial">{runtime.characterName.charAt(0)}</span>
          {runtime.isSpeaking && <span className="mce-speaking-indicator" />}
        </div>
        <div className="mce-avatar-name">{runtime.characterName}</div>
        {isActive && <div className="mce-avatar-ring" />}
      </button>

      {showCard && (
        <div className="mce-character-card" role="dialog" aria-label={`${runtime.characterName} 角色卡片`}>
          <div className="mce-card-header">
            <span className="mce-card-name">{runtime.characterName}</span>
            <button className="mce-card-close" onClick={handleClose} aria-label="关闭">×</button>
          </div>
          <div className="mce-card-row">
            <span className="mce-card-label">服装</span>
            <span className="mce-card-value">{runtime.costume}</span>
          </div>
          <div className="mce-card-row">
            <span className="mce-card-label">情绪</span>
            <span className="mce-card-value" style={{ color: emotionColors[runtime.emotion] }}>
              {runtime.emotion}
            </span>
          </div>
          <div className="mce-card-row">
            <span className="mce-card-label">位置</span>
            <span className="mce-card-value">{runtime.position}</span>
          </div>
          <div className="mce-card-row">
            <span className="mce-card-label">动作</span>
            <span className="mce-card-value">{runtime.action}</span>
          </div>
          <div className="mce-card-row">
            <span className="mce-card-label">关系</span>
            <span className="mce-card-value">
              {runtime.relationship.stage} · {runtime.relationship.score}/100
            </span>
          </div>
          <div className="mce-card-row">
            <span className="mce-card-label">存在感</span>
            <div className="mce-card-bar">
              <div className="mce-card-bar-fill" style={{ width: `${runtime.presence}%` }} />
            </div>
          </div>
          <div className="mce-card-row">
            <span className="mce-card-label">主动性</span>
            <div className="mce-card-bar">
              <div className="mce-card-bar-fill" style={{ width: `${runtime.initiative}%` }} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mce-avatar-wrapper { position: relative; display: inline-block; }
        .mce-avatar {
          position: relative;
          display: flex; flex-direction: column; align-items: center;
          background: transparent; border: none; cursor: pointer; padding: 4px;
          transition: transform 0.2s ease;
        }
        .mce-avatar:hover { transform: scale(1.08); }
        .mce-avatar-img {
          width: 48px; height: 48px; border-radius: 50%;
          background: linear-gradient(135deg, var(--emotion-color, #8e8e93), #3a3a3c);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 600; font-size: 18px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .mce-avatar-active .mce-avatar-img {
          box-shadow: 0 0 0 3px var(--emotion-color, #34c759), 0 2px 12px rgba(0,0,0,0.3);
          transform: scale(1.05);
        }
        .mce-avatar-name {
          margin-top: 4px; font-size: 11px; color: #8e8e93; max-width: 56px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center;
        }
        .mce-avatar-active .mce-avatar-name { color: #fff; font-weight: 600; }
        .mce-avatar-ring {
          position: absolute; top: -4px; left: 50%; transform: translateX(-50%);
          width: 12px; height: 3px; border-radius: 2px;
          background: var(--emotion-color, #34c759);
          animation: mce-ring-pulse 1.2s ease-in-out infinite;
        }
        .mce-speaking-indicator {
          position: absolute; bottom: 2px; right: 2px; width: 10px; height: 10px;
          border-radius: 50%; background: #34c759;
          animation: mce-speaking-pulse 1s ease-in-out infinite;
        }
        @keyframes mce-ring-pulse {
          0%, 100% { opacity: 1; transform: translateX(-50%) scaleX(1); }
          50% { opacity: 0.5; transform: translateX(-50%) scaleX(0.6); }
        }
        @keyframes mce-speaking-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }
        @keyframes mce-enter {
          from { opacity: 0; transform: scale(0.5) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes mce-leave {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.8) translateY(-10px); }
        }
        .mce-avatar-enter { animation: mce-enter 0.4s ease-out; }
        .mce-avatar-leave { animation: mce-leave 0.4s ease-in forwards; pointer-events: none; }
        .mce-character-card {
          position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%);
          min-width: 200px; background: #1c1c1e; border-radius: 12px; padding: 12px 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 100;
          border: 1px solid #3a3a3c;
          animation: mce-card-in 0.2s ease-out;
        }
        @keyframes mce-card-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .mce-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .mce-card-name { font-size: 16px; font-weight: 600; color: #fff; }
        .mce-card-close {
          background: none; border: none; color: #8e8e93; font-size: 20px; cursor: pointer; line-height: 1;
        }
        .mce-card-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 12px; }
        .mce-card-label { color: #8e8e93; min-width: 40px; }
        .mce-card-value { color: #fff; flex: 1; }
        .mce-card-bar { flex: 1; height: 4px; background: #3a3a3c; border-radius: 2px; overflow: hidden; }
        .mce-card-bar-fill { height: 100%; background: linear-gradient(90deg, #34c759, #30d158); border-radius: 2px; }
      `}</style>
    </div>
  )
}

/** 在场角色头像栏 */
export function CharacterAvatarBar({
  present,
  activeSpeakerId,
  enteringIds = [],
  leavingIds = [],
}: {
  present: CharacterRuntimeV4[]
  activeSpeakerId: string | null
  enteringIds?: string[]
  leavingIds?: string[]
}) {
  if (present.length === 0) return null
  return (
    <div className="mce-avatar-bar" role="list" aria-label="在场角色">
      {present.map((rt) => (
        <CharacterAvatar
          key={rt.characterId}
          runtime={rt}
          isActive={activeSpeakerId === rt.characterId}
          isEntering={enteringIds.includes(rt.characterId)}
          isLeaving={leavingIds.includes(rt.characterId)}
        />
      ))}
      <style>{`
        .mce-avatar-bar {
          display: flex; gap: 8px; padding: 8px 12px; overflow-x: auto;
          background: rgba(28,28,30,0.6); border-radius: 12px;
          backdrop-filter: blur(10px); -webkit-overflow-scrolling: touch;
        }
      `}</style>
    </div>
  )
}
