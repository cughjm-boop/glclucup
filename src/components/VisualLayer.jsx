import { useMemo, useState } from 'react'
import { useSceneRuntime } from '../hooks/useSceneRuntime'
import { useSceneBackgrounds } from '../hooks/useSceneBackgrounds'
import { resolveSceneImage } from '../services/sceneImageMap'
import CharacterArt from './CharacterArt'
import fallbackScene from '../assets/scenes/_placeholder.svg'

/**
 * VisualLayer — 视觉层（场景背景）
 *
 * - 读取权威场景状态（SceneManager 订阅）→ 按优先级匹配背景图。
 * - 未匹配到自定义图片时，使用内置深灰渐变占位图。
 * - 图片加载失败时降级为深灰渐变（CSS 背景），绝不白屏/红叉。
 * - 切换背景时使用淡入过渡（opacity transition），不瞬间硬切。
 *
 * 该组件属于「UI 皮肤层」，只做展示，不参与任何聊天/记忆/场景引擎逻辑。
 */
export default function VisualLayer({ className = '', characterId = null, isLandscape = false }) {
  const sceneRuntime = useSceneRuntime(characterId)
  // 订阅背景图映射变化（映射在 service 内部读取，这里仅保证变更时触发重渲染）
  useSceneBackgrounds()

  const location = sceneRuntime.location || ''
  const area = sceneRuntime.area || ''
  const timePeriod = sceneRuntime.timePeriod || ''

  // 目标背景图：优先用户自定义映射，否则内置占位图
  const resolvedSrc = useMemo(
    () => resolveSceneImage(location, area, timePeriod)?.src || fallbackScene,
    [location, area, timePeriod],
  )

  // 用于记录加载失败的 src，失败后不再尝试渲染（露出底层深灰渐变）
  const [failedSrc, setFailedSrc] = useState(null)

  // 当目标 src 变化时，重置失败标记（允许重新尝试新图）
  const currentFailed = failedSrc === resolvedSrc

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950 ${className}`}
      aria-hidden="true"
    >
      {/* 背景图（key 变化触发淡入过渡；失败时不渲染） */}
      {!currentFailed && (
        <img
          key={resolvedSrc}
          src={resolvedSrc}
          alt=""
          draggable={false}
          onError={() => setFailedSrc(resolvedSrc)}
          className="absolute inset-0 w-full h-full object-cover animate-fade-in"
          style={{ animationDuration: '0.7s' }}
        />
      )}

      {/* 角色立绘（情绪表情） */}
      <CharacterArt characterId={characterId} isLandscape={isLandscape} />

      {/* 占位提示（仅当无有效背景图加载时显示，始终轻量） */}
      <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
        <div className="text-center opacity-40">
          <div className="text-2xl mb-2">🎭</div>
          <div className="text-xs text-gray-400">场景视觉层</div>
        </div>
      </div>
    </div>
  )
}