import { useEffect, useMemo, useState } from 'react'
import useStore from '../store/useStore'
import { useCharacterStateRuntime } from '../hooks/useCharacterStateRuntime'
import { useCharacterArts } from '../hooks/useCharacterArts'
import {
  resolveCharacterArt,
  buildCharacterArtKeys,
  ensureCharacterArt,
} from '../services/characterArtMap'

/**
 * CharacterArt — 角色立绘渲染（纯视觉层）
 *
 * 情绪来源：CharacterStateEngine（五维白名单），绝不解析 AI 文本。
 * 映射优先级：角色ID_情绪 → 角色ID_default → 角色ID → 角色头像。
 * 无任何立绘或加载失败时，显示深灰色角色剪影占位，绝不白屏/红叉。
 * 切换情绪时使用淡入过渡。
 */
export default function CharacterArt({ characterId = null, isLandscape = false }) {
  const stateRuntime = useCharacterStateRuntime(characterId)
  // 订阅立绘映射变化（映射在 service 内部读取，这里仅保证变更时触发重渲染）
  const artMap = useCharacterArts()
  const character = useStore((s) =>
    characterId ? s.characters.find((c) => c.id === characterId) : undefined,
  )

  const emotionKey = stateRuntime.emotion || 'calm'

  // 离开聊天界面（切换到其它视图）时释放内存缓存；回到聊天界面时重新懒加载。
  const isChat = useStore((s) => s.view === 'chat')

  // 懒加载：只加载「当前角色 + 当前情绪」所需候选立绘（按优先级，命中即止）
  useEffect(() => {
    if (!characterId || !isChat) return undefined
    let cancelled = false
    const keys = buildCharacterArtKeys(characterId, emotionKey)
    ;(async () => {
      for (const k of keys) {
        if (cancelled) return
        const src = await ensureCharacterArt(k)
        if (cancelled) return
        if (src) break // 命中最高优先级立绘后停止，避免多余加载
      }
    })()
    return () => {
      cancelled = true
    }
  }, [characterId, emotionKey, isChat])

  // artMap 作为依赖信号：service 懒加载完成并 notify 后，这里重新解析缓存
  const resolvedSrc = useMemo(
    () => resolveCharacterArt(characterId, emotionKey)?.src,
    [characterId, emotionKey, artMap],
  )

  const [failedSrc, setFailedSrc] = useState(null)

  // 降级链：情绪立绘 → 默认立绘 → 角色头像 → 剪影
  const src = resolvedSrc || character?.avatar || null
  const showSilhouette = !src || failedSrc === src

  return (
    <div
      className={`absolute bottom-0 right-0 pointer-events-none select-none ${
        isLandscape ? 'h-[88%] max-h-[94%]' : 'h-[78%] max-h-[90%]'
      }`}
    >
      {/* 剪影占位：内联 SVG，永不加载失败 */}
      {showSilhouette ? (
        <SilhouetteFigure className="h-full w-auto opacity-60" />
      ) : (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          onError={() => setFailedSrc(src)}
          className="h-full w-auto object-contain drop-shadow-2xl animate-fade-in"
          style={{ animationDuration: '0.5s' }}
        />
      )}
    </div>
  )
}

/** 深灰色角色剪影占位（内联 SVG，零外部依赖） */
function SilhouetteFigure({ className = '' }) {
  return (
    <svg viewBox="0 0 300 600" className={className} aria-hidden="true">
      <g fill="#4b5563">
        <circle cx="150" cy="82" r="56" />
        <path d="M150 150 C 82 150 54 232 54 322 L 54 358 C 54 380 74 392 96 381 L 112 371 L 112 522 C 112 548 138 548 138 522 L 138 398 L 162 398 L 162 522 C 162 548 188 548 188 522 L 188 371 L 204 381 C 226 392 246 380 246 358 L 246 322 C 246 232 218 150 150 150 Z" />
      </g>
    </svg>
  )
}