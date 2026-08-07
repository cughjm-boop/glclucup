import { useEffect, useRef, useCallback, useMemo } from 'react'
import FloatingLayer, { Z_INDEX } from './FloatingLayer'

/**
 * MessageActionMenu - 统一消息操作菜单
 *
 * 菜单项：
 *   - 复制（所有消息）
 *   - 追问（仅 AI 回复，最后一条 AI，10分钟时效）
 *   - 重新回答（仅 AI 回复）
 *   - 撤回（仅用户消息，2分钟时效）
 *
 * 预留：编辑、收藏
 *
 * Props:
 *   - open: 是否显示
 *   - position: { x, y } 菜单定位（屏幕坐标）
 *   - message: 目标消息对象
 *   - allMessages: 全部消息列表（用于判断是否为最后一条 AI）
 *   - characterName: 当前角色名
 *   - onClose: 关闭回调
 *   - onCopy: 复制回调
 *   - onFollowUp: 追问回调
 *   - onRegenerate: 重新回答回调
 *   - onRecall: 撤回回调
 */

const RECALL_WINDOW = 2 * 60 * 1000
const QUOTE_WINDOW = 10 * 60 * 1000

export default function MessageActionMenu({
  open,
  position,
  message,
  allMessages,
  characterName,
  onClose,
  onCopy,
  onFollowUp,
  onRegenerate,
  onRecall,
}) {
  const isUser = message?.role === 'user'
  const isRecalled = message?.recalled
  const now = Date.now()
  const isWithinRecallWindow = isUser && !isRecalled && (now - (message?.timestamp || 0) <= RECALL_WINDOW)
  const isWithinQuoteWindow = !isRecalled && (now - (message?.timestamp || 0) <= QUOTE_WINDOW)

  // 检查是否为最后一条 AI 消息（追问限制）
  const isLastAiMessage = useMemo(() => {
    if (!message || message.role !== 'assistant' || isRecalled) return false
    if (!allMessages || allMessages.length === 0) return false
    // 从后往前遍历，找到最后一条未撤回的 AI 消息
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const m = allMessages[i]
      if (m.id === message.id) return true
      if (m.role === 'assistant' && !m.recalled) return false
    }
    return false
  }, [message, allMessages, isRecalled])

  const canFollowUp = !isUser && isLastAiMessage && isWithinQuoteWindow
  const canRegenerate = !isUser && !isRecalled
  const canRecall = isUser && isWithinRecallWindow

  // 点击菜单项
  const handleAction = useCallback((action) => {
    onClose?.()
    switch (action) {
      case 'copy':
        onCopy?.(message)
        break
      case 'followUp':
        if (canFollowUp) onFollowUp?.(message)
        break
      case 'regenerate':
        if (canRegenerate) onRegenerate?.(message)
        break
      case 'recall':
        if (canRecall) onRecall?.(message)
        break
    }
  }, [message, canFollowUp, canRegenerate, canRecall, onCopy, onFollowUp, onRegenerate, onRecall, onClose])

  // 快捷键支持
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleAction('copy')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose, handleAction])

  const copyToClipboard = async () => {
    if (!message?.content) return
    try {
      await navigator.clipboard.writeText(message.content)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = message.content
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }

  return (
    <FloatingLayer
      open={open}
      onClose={onClose}
      zIndex={Z_INDEX.MENU}
      type="menu"
      position={position}
      closeOnOutsideClick={true}
      closeOnScroll={true}
      animation={true}
    >
      {/* 复制（所有消息可用） */}
      <MenuButton
        icon={<CopyIcon />}
        label="复制"
        onClick={() => { copyToClipboard(); handleAction('copy') }}
      />

      {/* 追问（仅 AI 回复，最后一条，10分钟内） */}
      {canFollowUp && (
        <MenuButton
          icon={<FollowUpIcon />}
          label="追问"
          onClick={() => handleAction('followUp')}
          color="text-ios-blue"
        />
      )}

      {/* 重新回答（仅 AI 回复） */}
      {canRegenerate && (
        <MenuButton
          icon={<RegenerateIcon />}
          label="重新回答"
          onClick={() => handleAction('regenerate')}
        />
      )}

      {/* 撤回（仅用户消息，2分钟内） */}
      {canRecall && (
        <MenuButton
          icon={<RecallIcon />}
          label="撤回"
          onClick={() => handleAction('recall')}
          color="text-red-500"
        />
      )}

      {/* 不可操作时的提示（仅在既无追问也无撤回时显示） */}
      {!canFollowUp && !canRegenerate && !canRecall && message && (
        <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 select-none">
          {isUser ? '已超过操作时间' : '仅支持复制'}
        </div>
      )}
    </FloatingLayer>
  )
}

// === 子组件 ===

function MenuButton({ icon, label, onClick, color = 'text-gray-700 dark:text-gray-200' }) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5 transition-colors active:bg-gray-100 dark:active:bg-gray-700 ${color}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// === Icons ===

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function FollowUpIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

function RegenerateIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function RecallIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  )
}
