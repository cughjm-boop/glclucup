/**
 * VisualLayer — 视觉层占位组件
 * 第一阶段：仅渲染深灰色渐变背景，暂不加载任何图片（立绘 / 背景图）。
 * 后续阶段会在此处接入场景背景图与角色立绘。
 *
 * 该组件属于「UI 皮肤层」，内部出错不应影响聊天逻辑。
 * 通过 className 由 ChatLayout 控制尺寸（横屏占宽 / 竖屏占高）。
 */
export default function VisualLayer({ className = '' }) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950 ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
        <div className="text-center opacity-40">
          <div className="text-2xl mb-2">🎭</div>
          <div className="text-xs text-gray-400">视觉层（占位）</div>
        </div>
      </div>
    </div>
  )
}