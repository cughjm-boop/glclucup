import useStore from '../store/useStore'
import useOrientation from '../hooks/useOrientation'
import VisualLayer from './VisualLayer'

/**
 * ChatLayout — 聊天气视觉小说布局容器（纯 UI 皮肤层）
 *
 * - 视觉小说模式关闭时：直接透传 children，保持原有纯文字聊天布局（零改动）。
 * - 视觉小说模式开启时：
 *   竖屏：VisualLayer 在上（30% 高），ChatArea 在下（70% 高）
 *   横屏：VisualLayer 在左（45% 宽），ChatArea 在右（55% 宽）
 *
 * 【绝对底线】切换横竖屏只会改变根容器的 flex 方向（className），children（聊天区域）
 * 始终位于树中的同一位置，因此聊天组件不会重挂载，输入框文字、聊天记录、滚动位置原封不动。
 */
export default function ChatLayout({ children }) {
  const visualNovelMode = useStore((s) => s.settings?.visualNovelMode === true)
  const { isLandscape } = useOrientation()

  if (!visualNovelMode) {
    return <>{children}</>
  }

  return (
    <div
      className={`flex-1 flex w-full min-w-0 min-h-0 overflow-hidden ${
        isLandscape ? 'flex-row' : 'flex-col'
      }`}
    >
      {/* 视觉层：横屏占左 45% 宽（贴左安全区），竖屏占上 30% 高（贴顶安全区） */}
      <VisualLayer
        className={`shrink-0 ${
          isLandscape ? 'h-full w-[45%] pl-safe' : 'w-full h-[30%] pt-safe'
        }`}
      />

      {/* 聊天区域：始终占据剩余空间；children 原有结构保持不动 */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">{children}</div>
    </div>
  )
}