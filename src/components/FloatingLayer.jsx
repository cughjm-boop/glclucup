import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * 全局浮层 z-index 层级规范（强制统一引用，禁止组件私自设置 z-index）
 *
 * 记忆相关：
 *   记忆库时间线列表：z-index: 1
 *   记忆卡片/条目：z-index: 2
 *   搜索下拉面板：z-index: 100
 * 通用浮层：
 *   长按菜单遮罩：z-index: 999
 *   详情弹出卡片（Popover）/ 长按菜单：z-index: 1000
 *   底部操作面板（BottomSheet）：z-index: 1100
 *   确认对话框（Dialog）：z-index: 1200
 *   提示消息（Toast）：z-index: 1300
 */
export const Z_INDEX = {
  // 记忆界面层级
  MEMORY_TIMELINE: 1,
  MEMORY_CARD: 2,
  SEARCH_DROPDOWN: 100,

  // 通用浮层
  MENU_OVERLAY: 999,
  MENU: 1000,
  POPOVER: 1000,
  BOTTOM_SHEET: 1100,
  DIALOG: 1200,
  TOAST: 1300,
}

/**
 * FloatingLayer - 统一浮层管理组件
 * 使用 React Portal 渲染到 body，避免被父容器 overflow 裁剪
 *
 * Props:
 *   - open: 是否显示
 *   - onClose: 关闭回调
 *   - zIndex: 层级
 *   - children: 浮层内容
 *   - position: 定位信息 { x, y } 或 'center' 或 'bottom'
 *   - type: 'menu' | 'bottom-sheet' | 'dialog' | 'toast'
 *   - closeOnOutsideClick: 点击外部是否关闭
 *   - closeOnScroll: 滚动时是否关闭
 *   - animation: 是否启用动画
 *   - safeArea: 是否适配安全区
 */
export default function FloatingLayer({
  open,
  onClose,
  zIndex = Z_INDEX.MENU,
  children,
  position,
  type = 'menu',
  closeOnOutsideClick = true,
  closeOnScroll = false,
  animation = true,
  safeArea = true,
}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const layerRef = useRef(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), animation ? 150 : 0)
      return () => clearTimeout(timer)
    }
  }, [open, animation])

  // 点击外部关闭（使用捕获阶段，避免被冒泡吞掉）
  useEffect(() => {
    if (!open || !closeOnOutsideClick) return
    const handler = (e) => {
      if (layerRef.current && !layerRef.current.contains(e.target)) {
        onClose?.()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
      document.addEventListener('touchstart', handler)
    }, 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open, closeOnOutsideClick, onClose])

  // 滚动关闭
  useEffect(() => {
    if (!open || !closeOnScroll) return
    const handler = () => onClose?.()
    window.addEventListener('scroll', handler, true)
    return () => window.removeEventListener('scroll', handler, true)
  }, [open, closeOnScroll, onClose])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // 计算位置
  const getStyle = useCallback(() => {
    const base = { position: 'fixed', zIndex }

    if (type === 'dialog' || type === 'bottom-sheet') {
      return { ...base, inset: 0 }
    }

    if (type === 'toast') {
      const bottom = safeArea ? 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' : '1rem'
      return { ...base, bottom, left: '50%', transform: 'translateX(-50%)' }
    }

    // menu type - 使用 position:fixed + 传入的坐标
    if (position && typeof position.x === 'number') {
      // 预估菜单尺寸用于边界检测
      const MENU_WIDTH = 168
      const MENU_HEIGHT = 200
      const margin = 8

      // 等待下一帧 DOM 渲染后再精确测量
      let x = position.x
      let y = position.y

      // 视口边界约束
      if (x + MENU_WIDTH > window.innerWidth - margin) {
        x = window.innerWidth - MENU_WIDTH - margin
      }
      if (x < margin) x = margin
      if (y + MENU_HEIGHT > window.innerHeight - margin - (safeArea ? (window.visualViewport?.height ? 0 : 0) : 0)) {
        y = window.innerHeight - MENU_HEIGHT - margin - (safeArea ? 20 : 0)
      }
      if (y < margin) y = margin

      return { ...base, left: x, top: y }
    }

    return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }, [position, type, zIndex, safeArea])

  if (!mounted) return null

  const getAnimationStyle = () => {
    if (!animation) return {}
    if (type === 'bottom-sheet') {
      return {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'opacity 150ms ease-out, transform 150ms ease-out',
      }
    }
    if (type === 'dialog') {
      return {
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.95)',
        transition: 'opacity 150ms ease-out, transform 150ms ease-out',
      }
    }
    // menu / toast
    return {
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1)' : 'scale(0.95)',
      transformOrigin: 'top left',
      transition: 'opacity 150ms ease-out, transform 150ms ease-out',
    }
  }

  const animationStyle = getAnimationStyle()
  const positionStyle = getStyle()

  const content = type === 'menu' ? (
    <div
      ref={layerRef}
      style={{ ...positionStyle, ...animationStyle }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] max-w-[220px] select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  ) : type === 'bottom-sheet' ? (
    <div
      ref={layerRef}
      style={{ ...positionStyle, ...animationStyle }}
      className="bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  ) : type === 'dialog' ? (
    <div style={positionStyle} className={`flex items-center justify-center`}>
      <div
        ref={layerRef}
        style={animationStyle}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  ) : (
    <div ref={layerRef} style={{ ...positionStyle, ...animationStyle }}>
      {children}
    </div>
  )

  return createPortal(
    <>
      {closeOnOutsideClick && type !== 'menu' && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          style={{
            zIndex: zIndex - 1,
            opacity: visible ? 1 : 0,
            transition: 'opacity 150ms ease-out',
          }}
          onClick={onClose}
        />
      )}
      {closeOnOutsideClick && type === 'menu' && (
        <div
          className="fixed inset-0"
          style={{ zIndex: zIndex - 1 }}
          onClick={onClose}
        />
      )}
      {content}
    </>,
    document.body
  )
}
