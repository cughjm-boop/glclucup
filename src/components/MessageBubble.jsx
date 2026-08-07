import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import FloatingLayer, { Z_INDEX } from './FloatingLayer'
import MessageActionMenu from './MessageActionMenu'

// 角色 UI 注册中心（V2）：提供 固定颜色/昵称覆盖/头像覆盖 —— 仅改 UI，不改角色真实数据
import {
  getCharacterUiRegistry,
  resolveCharacterUi,
} from '../core/ui/CharacterUiRegistry'

// 五维状态 Engine（V2）：取角色的 emoji/心情 显示
import { getCharacterStateManager } from '../core/character/CharacterStateManager'

function formatFullTime(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}`
}

function formatShortTime(ts) {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

const RECALL_WINDOW = 2 * 60 * 1000 // 2分钟
const QUOTE_WINDOW = 10 * 60 * 1000 // 10分钟

/**
 * 从一个 speakerName 解析出 characterId（兼容老版本 message 没有 speakerId 的情况）
 *  - 优先用 message.speakerId（V2 新字段，主键）
 *  - 否则在 characters/activeGuestStates 里按名字匹配
 */
function resolveSpeakerId(message, character, guestCharacterStates = {}) {
  if (message.speakerId && message.speakerId !== '__user__') return message.speakerId
  if (message.role === 'user') return '__user__'

  const speakerName = message.speaker || null
  if (!speakerName) return character?.id || ''

  // 主角色名字
  if (character?.name && speakerName === character.name) return character.id

  // guest 角色：在 guestCharacterStates 里找
  const guestEntries = Object.entries(guestCharacterStates || {})
  for (const [id, st] of guestEntries) {
    if (st && st.name === speakerName) return id
  }

  // 兜底：用名字当 key（UI 里也会按名字匹配颜色映射）
  return `__name__${speakerName}`
}

/**
 * 取这个角色当前的心情 emoji + 名字（供气泡头部状态显示）
 */
function resolveEmotionBadge(speakerId, character, guestCharacterStates = {}) {
  if (!speakerId || speakerId === '__user__') return null
  try {
    const manager = getCharacterStateManager(speakerId)
    const s = manager.getState()
    if (!s || !s.emotion) return null
    const emo = manager.getEmotionMeta(s.emotion)
    if (!emo) return null
    const level = s.emotionLevel && s.emotionLevel >= 2 ? `(${s.emotionLevel})` : ''
    return {
      emoji: emo.emoji || '',
      name: emo.name || '',
      level,
    }
  } catch {
    // CharacterStateManager 不存在（例如 guest 角色没在这个桶） → 退而求其次用 legacy 数据
    let st = null
    if (speakerId && guestCharacterStates && guestCharacterStates[speakerId]) {
      st = guestCharacterStates[speakerId]
    } else if (character?.id === speakerId) {
      st = null // characterState 外层再看
    }
    if (st?.emotionEmoji) {
      return { emoji: st.emotionEmoji, name: st.emotionName || '', level: '' }
    }
    return null
  }
}

const MessageBubble = memo(function MessageBubble({
  message,
  character,
  prevTimestamp,
  highlighted,
  messageRef,
  onRecall,
  onFollowUp,
  onRegenerate,
  onScrollToMessage,
  allMessages,
  isReplyToFollowUp,
  // 多人聊天 V2：在场的 guest 角色状态（每个角色独立五维状态）
  guestCharacterStates = {},
}) {
  const isUser = message.role === 'user'
  const isRecalled = message.recalled
  const hasQuoteTarget = message.quoteTarget && message.quoteTarget.messageId

  // ====== 多人聊天 V2：speakerId 是主键，name/id 独立解析 ======
  const speakerId = resolveSpeakerId(message, character, guestCharacterStates)
  const isGuestSpeaker = !isUser && speakerId && speakerId !== character?.id

  // 角色的独立头像/独立昵称/独立气泡颜色（CharacterUiRegistry — 仅 UI，不影响数据）
  //  - 用户：固定蓝色
  //  - 主角色：character.id + character.name
  //  - 客串角色：speakerId + speakerName
  const baseAvatar = isUser
    ? null
    : isGuestSpeaker
      ? guestCharacterStates?.[speakerId]?.avatar || null
      : character?.avatar || null
  const baseName = isUser
    ? '我'
    : isGuestSpeaker
      ? (guestCharacterStates?.[speakerId]?.name || message.speaker || character?.name || 'AI')
      : (character?.name || 'AI')
  const ui = resolveCharacterUi(speakerId, baseName, baseAvatar, isUser)

  // 角色五维状态（emoji + 心情）
  const emotionBadge = resolveEmotionBadge(speakerId, character, guestCharacterStates)
  // legacy characterState fallback（主角色）
  const legacyEmo = !isUser && speakerId === character?.id
    ? (character?.emotionEmoji ? { emoji: character.emotionEmoji, name: character.emotionName || '', level: '' } : null)
    : null
  const finalBadge = emotionBadge || legacyEmo

  // 角色五维状态里的 pose（显示在名字下方小字，多人场景用）
  const poseLine = (() => {
    if (isUser) return ''
    // guest characterStates 优先
    const g = guestCharacterStates?.[speakerId]
    if (g?.pose) {
      return [g.pose, g.expression].filter(Boolean).join(' / ')
    }
    if (speakerId && speakerId === character?.id) {
      return null
    }
    return ''
  })()

  const [showFullTime, setShowFullTime] = useState(false)
  const [menuState, setMenuState] = useState({ open: false, position: { x: 0, y: 0 } })
  const [showConfirm, setShowConfirm] = useState(false)
  const [recallError, setRecallError] = useState(null)
  const [recallFading, setRecallFading] = useState(false)
  const [recallHidden, setRecallHidden] = useState(false)
  // UI 注册表订阅，确保用户改了头像/昵称/颜色 → 所有历史消息立即刷新
  const [, setTick] = useState(0)
  const longPressTimer = useRef(null)
  const bubbleRef = useRef(null)
  const recallTimerRef = useRef(null)

  // 订阅 CharacterUiRegistry（头像/昵称/颜色 一改 → 所有气泡立即重绘）
  useEffect(() => {
    const reg = getCharacterUiRegistry()
    const unsub = reg.subscribe(() => setTick((v) => v + 1))
    return () => {
      try { unsub() } catch { /* ignore */ }
    }
  }, [])

  const gap = prevTimestamp ? message.timestamp - prevTimestamp : Infinity
  const showFull = gap > 5 * 60 * 1000 || gap === Infinity
  const timeDisplay = showFull || showFullTime ? formatFullTime(message.timestamp) : formatShortTime(message.timestamp)

  const isWithinRecallWindow = isUser && !isRecalled && (Date.now() - message.timestamp <= RECALL_WINDOW)
  const isWithinQuoteWindow = !isRecalled && (Date.now() - message.timestamp <= QUOTE_WINDOW)

  const quotedMessage = hasQuoteTarget && allMessages
    ? allMessages.find((m) => m.id === message.quoteTarget.messageId)
    : null
  const isQuotedRecalled = hasQuoteTarget && (!quotedMessage || quotedMessage.recalled)

  // 撤回消息的旧 UI：3 秒后淡出消失
  useEffect(() => {
    if (isRecalled && !recallFading) {
      recallTimerRef.current = setTimeout(() => {
        setRecallFading(true)
        setTimeout(() => setRecallHidden(true), 500)
      }, 3000)
    }
    return () => {
      if (recallTimerRef.current) clearTimeout(recallTimerRef.current)
    }
  }, [isRecalled, recallFading])

  const toggleTime = useCallback(() => {
    if (!showFull) setShowFullTime((v) => !v)
  }, [showFull])

  // 统一打开菜单（支持 mouse/touch）
  const openMenu = useCallback((clientX, clientY) => {
    if (isRecalled) return
    // 只有满足任一操作条件才允许打开菜单
    if (!isWithinRecallWindow && !isWithinQuoteWindow) return
    setMenuState({ open: true, position: { x: clientX, y: clientY } })
  }, [isRecalled, isWithinRecallWindow, isWithinQuoteWindow])

  const closeMenu = useCallback(() => {
    setMenuState((s) => ({ ...s, open: false }))
  }, [])

  // 右键菜单
  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY)
  }, [openMenu])

  // 长按菜单（移动端）
  const handleTouchStart = useCallback((e) => {
    if (isRecalled) return
    const touch = e.touches[0]
    longPressTimer.current = setTimeout(() => {
      if (touch) openMenu(touch.clientX, touch.clientY)
    }, 450)
  }, [isRecalled, openMenu])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // 点击跳转到被引用的消息
  const handleQuoteClick = useCallback(() => {
    if (hasQuoteTarget && onScrollToMessage && !isQuotedRecalled) {
      onScrollToMessage(message.quoteTarget.messageId)
    }
  }, [hasQuoteTarget, onScrollToMessage, isQuotedRecalled, message.quoteTarget])

  // ===== 菜单项点击处理 =====

  // 追问（仅 AI 消息 → 触发 ChatInput 进入追问模式）
  const handleFollowUp = useCallback(() => {
    onFollowUp?.(message)
  }, [message, onFollowUp])

  // 重新回答（AI 消息 → 重新生成替换）
  const handleRegenerate = useCallback(async () => {
    if (!onRegenerate) return
    const result = await onRegenerate(message.id)
    if (!result?.success) {
      setRecallError(result?.error || '重新回答失败')
      setTimeout(() => setRecallError(null), 3000)
    }
  }, [message, onRegenerate])

  // 撤回（用户消息 → 二次确认）
  const handleRecallRequest = useCallback(() => {
    setShowConfirm(true)
  }, [])

  const confirmRecall = useCallback(async () => {
    setShowConfirm(false)
    if (!onRecall) return
    const result = await onRecall(message.id)
    if (!result.success) {
      setRecallError(result.error)
      setTimeout(() => setRecallError(null), 3000)
    }
  }, [onRecall, message.id])

  const cancelRecall = useCallback(() => setShowConfirm(false), [])

  // 完全隐藏的撤回消息
  if (recallHidden) return null

  // ======== 头部名字+状态行 ========
  const headerNameLine = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-xs font-semibold ${ui.bubble.name} select-none`}>
        {ui.displayName}
      </span>
      {finalBadge && (finalBadge.emoji || finalBadge.name) && (
        <span className="text-[11px] text-purple-500/85 dark:text-purple-400/80 inline-flex items-center gap-0.5 select-none">
          {finalBadge.emoji && <span className="leading-none">{finalBadge.emoji}</span>}
          {finalBadge.name && <span>{finalBadge.name}</span>}
          {finalBadge.level && <span className="opacity-80">{finalBadge.level}</span>}
        </span>
      )}
      {poseLine && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 select-none">
          ｜{poseLine}
        </span>
      )}
    </div>
  )

  const bubbleProfile = ui.bubble

  // 头像容器（用户/AI/客串角色都显示，符合 M3：头像 + 名字 + 聊天框 三者同时显示）
  const avatarBox = (
    <div
      className={`flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br ${bubbleProfile.avatar} flex items-center justify-center mt-0.5 shadow-inner ring-1 ring-black/5 dark:ring-white/5`}
      title={ui.displayName}
    >
      {ui.avatar ? (
        <img src={ui.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <span className="text-[13px] font-bold" style={{ color: bubbleProfile.fallback }}>
          {String(ui.displayName || '?').charAt(0)}
        </span>
      )}
    </div>
  )

  return (
    <div
      ref={(el) => {
        bubbleRef.current = el
        if (messageRef) messageRef(el)
      }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} message-enter`}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchEnd}
    >
      {/* —— 固定结构：头像 | 名字+气泡 —— 不分用户/AI 都显示头像（M3 强制） */}
      <div className={`flex gap-2.5 max-w-[85%] sm:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start`}>
        {/* 头像 */}
        {avatarBox}

        {/* 内容列：名字行 → 气泡 → 时间 */}
        <div className={`flex flex-col gap-0.5 min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
          {/* 名字行（用户也显示「我」） */}
          {headerNameLine}

          {isRecalled ? (
            <div
              className={`px-4 py-2.5 rounded-2xl text-sm text-center transition-opacity duration-500 ${
                recallFading ? 'opacity-0' : 'opacity-100'
              }`}
              style={{ color: '#9ca3af', fontStyle: 'italic' }}
            >
              {isUser ? '你撤回了一条消息' : `${ui.displayName} 撤回了一条消息`}
            </div>
          ) : (
            <div
              onClick={toggleTime}
              className={`px-4 py-3 rounded-2xl text-[14.5px] leading-[1.6] whitespace-pre-wrap break-words transition-all duration-500 max-w-full ${
                highlighted
                  ? `ring-2 ring-offset-2 dark:ring-offset-gray-950 ${isUser ? 'ring-ios-blue bg-ios-blue/90' : 'ring-ios-blue bg-ios-blue/5 dark:bg-ios-blue/10'}`
                  : ''
              } ${bubbleProfile.bubble}`}
            >
              {/* 追问引用块 */}
              {hasQuoteTarget && (
                <div
                  className={`text-xs mb-2 pb-2 border-b cursor-pointer ${bubbleProfile.quote} ${
                    isQuotedRecalled ? 'line-through opacity-50' : 'hover:opacity-80'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!isQuotedRecalled) handleQuoteClick()
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    {isQuotedRecalled
                      ? '原始消息已撤回'
                      : `${message.quoteTarget.sender}：${message.quoteTarget.content.slice(0, 50)}${message.quoteTarget.content.length > 50 ? '...' : ''}`}
                  </span>
                </div>
              )}
              {message.content}
            </div>
          )}

          {/* 时间 + 状态标签行 */}
          {!isRecalled && (
            <div className={`flex items-center gap-1 ${isUser ? 'flex-row-reverse mr-1' : 'ml-1'}`}>
              <span
                onClick={toggleTime}
                className="text-[10.5px] text-gray-400 dark:text-gray-500 cursor-default select-none"
              >
                {timeDisplay}
              </span>
              {isUser && hasQuoteTarget && (
                <button
                  onClick={handleQuoteClick}
                  className={`text-[10.5px] inline-flex items-center gap-0.5 ${
                    isQuotedRecalled
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-ios-blue/60 hover:text-ios-blue cursor-pointer'
                  }`}
                  title={isQuotedRecalled ? '原始消息已撤回' : '点击跳转到被追问的消息'}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  追问
                </button>
              )}
              {!isUser && isReplyToFollowUp && (
                <span className="text-[10.5px] text-ios-blue/50 inline-flex items-center gap-0.5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  回复追问
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 统一消息操作菜单（React Portal + Fixed 定位） */}
      <MessageActionMenu
        open={menuState.open}
        position={menuState.position}
        message={message}
        allMessages={allMessages}
        characterName={character?.name}
        onClose={closeMenu}
        onCopy={() => { /* 菜单内已自行处理复制 */ }}
        onFollowUp={handleFollowUp}
        onRegenerate={handleRegenerate}
        onRecall={handleRecallRequest}
      />

      {/* 撤回确认弹窗（使用 FloatingLayer 实现，避免被裁剪） */}
      {showConfirm && (
        <FloatingLayer
          open={showConfirm}
          onClose={cancelRecall}
          zIndex={Z_INDEX.DIALOG}
          type="dialog"
          closeOnOutsideClick={true}
        >
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">撤回消息</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            确定撤回这条消息吗？该消息及之后的所有回复将被一并删除。
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={cancelRecall}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              取消
            </button>
            <button
              onClick={confirmRecall}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              确定撤回
            </button>
          </div>
        </FloatingLayer>
      )}

      {/* 错误提示 Toast */}
      {recallError &&
        createPortal(
          <div
            className="fixed left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl bg-red-500 text-white text-sm font-medium shadow-2xl animate-bounce-in"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
              zIndex: Z_INDEX.TOAST,
            }}
          >
            {recallError}
          </div>,
          document.body
        )}
    </div>
  )
})

export default MessageBubble
