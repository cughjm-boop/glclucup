import React, { useState, useCallback } from 'react'
import type { CharacterRuntime } from '../core/dispatcher/ConversationRuntime'

interface AvatarProps {
  character: CharacterRuntime
  isActive: boolean
  onClick?: () => void
}

export function Avatar({ character, isActive, onClick }: AvatarProps) {
  const [showCard, setShowCard] = useState(false)

  const emotionColors: Record<string, string> = {
    neutral: '#8e8e93', happy: '#34c759', sad: '#007aff',
    angry: '#ff3b30', curious: '#5ac8fa', shy: '#ff2d55',
    serious: '#5856d6', playful: '#ff9500', tired: '#8e8e93', surprised: '#af52de',
  }

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowCard((v) => !v)
    onClick?.()
  }, [onClick])

  return (
    <div className="v5-avatar-wrap" style={{ zIndex: showCard ? 100 : 1 }}>
      <button
        className={`v5-avatar ${isActive ? 'v5-active' : ''}`}
        onClick={handleClick}
        aria-label={character.characterName}
      >
        <div
          className="v5-avatar-img"
          style={{ background: `linear-gradient(135deg, ${emotionColors[character.emotion] || '#8e8e93'}, #3a3a3c)` }}
        >
          <span>{character.characterName.charAt(0)}</span>
          {isActive && <div className="v5-speaking-dot" />}
        </div>
        <div className="v5-avatar-name">{character.characterName}</div>
        {isActive && <div className="v5-active-ring" />}
      </button>

      {showCard && (
        <div className="v5-card" onClick={(e) => e.stopPropagation()}>
          <div className="v5-card-header">
            <span className="v5-card-title">{character.characterName}</span>
            <button className="v5-card-close" onClick={() => setShowCard(false)}>×</button>
          </div>
          <Row label="位置" value={character.position} />
          <Row label="动作" value={character.action} />
          <Row label="情绪" value={character.emotion} color={emotionColors[character.emotion]} />
          <Row label="服装" value={character.costume} />
          <Row label="武器" value={character.weapon} />
          <BarRow label="存在感" value={character.presence} />
          <BarRow label="主动性" value={character.initiative} />
        </div>
      )}

      <style>{`
        .v5-avatar-wrap { position: relative; display: inline-block; }
        .v5-avatar {
          display: flex; flex-direction: column; align-items: center;
          background: transparent; border: none; cursor: pointer; padding: 4px;
          transition: transform 0.2s;
        }
        .v5-avatar:active { transform: scale(0.95); }
        .v5-avatar-img {
          width: 44px; height: 44px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 600; font-size: 16px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25); position: relative;
        }
        .v5-avatar-name { margin-top: 3px; font-size: 11px; color: #8e8e93; max-width: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .v5-active .v5-avatar-img { box-shadow: 0 0 0 2px var(--ring-color, #34c759), 0 2px 10px rgba(0,0,0,0.3); }
        .v5-active .v5-avatar-name { color: #fff; font-weight: 600; }
        .v5-speaking-dot {
          position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px;
          border-radius: 50%; background: #34c759; border: 2px solid #1c1c1e;
          animation: v5-pulse 1s infinite;
        }
        .v5-active-ring {
          position: absolute; top: -2px; left: 50%; transform: translateX(-50%);
          width: 10px; height: 2px; background: var(--ring-color, #34c759); border-radius: 2px;
          animation: v5-ring 1.2s ease-in-out infinite;
        }
        @keyframes v5-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.3); } }
        @keyframes v5-ring { 0%,100% { opacity:1; transform: translateX(-50%) scaleX(1); } 50% { opacity:0.5; transform: translateX(-50%) scaleX(0.5); } }
        .v5-card {
          position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
          min-width: 180px; background: #1c1c1e; border-radius: 10px; padding: 10px 14px;
          box-shadow: 0 8px 28px rgba(0,0,0,0.5); z-index: 200;
          border: 1px solid #3a3a3c; animation: v5-card-in 0.18s ease-out;
        }
        @keyframes v5-card-in { from { opacity: 0; transform: translateX(-50%) translateY(-6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .v5-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .v5-card-title { font-size: 15px; font-weight: 600; color: #fff; }
        .v5-card-close { background: none; border: none; color: #8e8e93; font-size: 18px; cursor: pointer; }
      `}</style>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, margin: '3px 0' }}>
      <span style={{ color: '#636366', minWidth: 36 }}>{label}</span>
      <span style={{ color: color || '#fff', flex: 1 }}>{value}</span>
    </div>
  )
}

function BarRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, margin: '3px 0' }}>
      <span style={{ color: '#636366', minWidth: 36 }}>{label}</span>
      <div style={{ flex: 1, height: 3, background: '#3a3a3c', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: 'linear-gradient(90deg, #34c759, #30d158)' }} />
      </div>
      <span style={{ color: '#8e8e93', minWidth: 28, textAlign: 'right' }}>{Math.round(value)}</span>
    </div>
  )
}

/** 在场角色头像栏 */
export function AvatarBar({
  characters,
  activeSpeakerId,
}: {
  characters: CharacterRuntime[]
  activeSpeakerId: string | null
}) {
  if (characters.length === 0) return null
  return (
    <div className="v5-avatar-bar" role="list" aria-label="在场角色">
      {characters.map((cr) => (
        <Avatar
          key={cr.characterId}
          character={cr}
          isActive={activeSpeakerId === cr.characterId}
        />
      ))}
      <style>{`
        .v5-avatar-bar {
          display: flex; gap: 6px; padding: 8px 10px; overflow-x: auto;
          background: rgba(28,28,30,0.6); border-radius: 10px;
          -webkit-overflow-scrolling: touch;
        }
      `}</style>
    </div>
  )
}
