import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import RecentSummonChips from './RecentSummonChips'
import EmptyState from './EmptyState'
import ChatSettingsPanel from './ChatSettingsPanel'
import ChatSearch from './ChatSearch'
import useStore from '../store/useStore'
import { useSceneRuntime } from '../hooks/useSceneRuntime'
import { useCharacterStateRuntime } from '../hooks/useCharacterStateRuntime'

const PAGE_SIZE = 20

export default function ChatWindow() {
  const {
    currentCharacterId,
    characters,
    messages,
    isLoading,
    error,
    sendMessage,
    setView,
    exportChatHistory,
    recallMessage,
    regenerateMessage,
    clearError,
    characterState,
    activeCharacters,
    guestCharacterStates,
    getDailyChatInjection,
    getDeepChatInjection,
    setFullScreenPageOpen,
    // A-2：调度器过滤日志
    showDispatcherLogs,
    getRecentDispatcherLogsForCharacter,
    // C-1：一键解散
    dismissAllGuests,
    // C-2：Watcher + 非阻塞气泡
    runAutoDismissWatcherOnce,
    autoDismissToasts,
    clearAutoDismissToast,
  } = useStore()

  // =================================================================
  // 顶部 UI 场景/位置 的唯一真实数据源：SceneRuntime
  // 顶部 UI 角色心情/动作/互动 的唯一真实数据源：CharacterStateRuntime
  // ---------------------------------------------------------------
  // 禁止从 message.content / lastMessage / AI 回复 / Prompt 中
  // 反向解析或绑定任何"场景/位置/心情/动作/互动"字段。
  // =================================================================
  const sceneRuntime = useSceneRuntime(currentCharacterId)
  const charStateRuntime = useCharacterStateRuntime(currentCharacterId, sceneRuntime?.position)

  const [exportError, setExportError] = useState(null)
  const [followUpTarget, setFollowUpTarget] = useState(null)

  // C-1：模式角标展开状态（点击 Pill 后展开"在场角色列表"）
  const [modePanelOpen, setModePanelOpen] = useState(false)
  // A-2：调度器过滤日志折叠条（默认折叠：false）
  const [dispatcherLogOpen, setDispatcherLogOpen] = useState(false)
  // 强制刷新 UI 版本号（当日志通过异步写入时触发重读取）
  const [dispatcherLogRev, setDispatcherLogRev] = useState(0)

  // 实时时间显示
  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date()
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} 周${weekdays[now.getDay()]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      const weekdays = ['日', '一', '二', '三', '四', '五', '六']
      setCurrentTime(`${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} 周${weekdays[now.getDay()]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const sentinelRef = useRef(null)
  const [showChatSettings, setShowChatSettings] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [highlightedId, setHighlightedId] = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true)
  const messageRefs = useRef({})
  const prevCharId = useRef(currentCharacterId)
  const isSwitchingChar = useRef(false)

  const character = useMemo(
    () => characters.find((c) => c.id === currentCharacterId),
    [characters, currentCharacterId]
  )
  const charMessages = currentCharacterId ? messages[currentCharacterId] || [] : []

  // =================================================================
  // 顶部 UI 显示的"场景名 + 物品" 与 "位置/动作"：**只**读取 SceneRuntime
  // 不再有任何 zustand currentScene（消息解析来源）的 fallback。
  // useSceneRuntime 在 SceneManager 订阅触发时 setState → UI 实时刷新。
  // =================================================================
  const scene = sceneRuntime.scene || { name: '默认场景', items: [] }

  // 合成显示：position/location 来自权威 SceneRuntime；
  // 动作 + 情绪 + 互动 来自 CharacterStateRuntime（保证只含白名单词，绝不含对话文本）；
  // 衣着/持有物 保留自 legacy characterState（因为它们是独立功能，不在 SceneEngine / CharacterStateEngine 里）。
  const displayState = useMemo(
    () => ({
      position: sceneRuntime.position || '',
      location: sceneRuntime.location || '',
      clothing: sceneRuntime.clothing || '',
      action: charStateRuntime.actionName || characterState[currentCharacterId]?.action || '',
      heldItems: sceneRuntime.heldItems || [],
      emotion: charStateRuntime.emotion,
      emotionName: charStateRuntime.emotionName,
      emotionEmoji: charStateRuntime.emotionEmoji,
      interactionName: charStateRuntime.interactionName,
      stateDisplay: charStateRuntime.display,
    }),
    [sceneRuntime, charStateRuntime, characterState, currentCharacterId]
  )

  const hasStateInfo =
    displayState.position ||
    displayState.clothing ||
    displayState.action ||
    (displayState.heldItems && displayState.heldItems.length > 0)

  // 多人对话：当前在场的额外角色
  const activeChars = useMemo(
    () => currentCharacterId ? (activeCharacters[currentCharacterId] || []) : [],
    [activeCharacters, currentCharacterId]
  )

  // Reset visible count when switching characters
  useEffect(() => {
    if (prevCharId.current !== currentCharacterId) {
      setVisibleCount(PAGE_SIZE)
      isSwitchingChar.current = true
      prevCharId.current = currentCharacterId
      // 切角色时，折叠条关闭、模式面板关闭（避免残留打开）
      setDispatcherLogOpen(false)
      setModePanelOpen(false)
    }
  }, [currentCharacterId])

  // ================================================================
  // C-2：长沉默客串自动退场 Watcher —— 每 60s 轮询一次
  //      只在打开聊天页时运行；isLoading 中跳过，避免与 AI 回复写状态冲突
  // ================================================================
  useEffect(() => {
    if (!currentCharacterId) return undefined
    let mounted = true
    const tick = () => {
      if (!mounted) return
      if (!useStore.getState().isLoading) {
        try { runAutoDismissWatcherOnce?.() } catch (_e) {}
      }
    }
    // 打开页面 2s 后先跑一次（方便快速看到效果）
    const firstT = setTimeout(tick, 2000)
    const t = setInterval(tick, 60 * 1000)
    return () => {
      mounted = false
      clearTimeout(firstT)
      clearInterval(t)
    }
  }, [currentCharacterId, runAutoDismissWatcherOnce])

  // C-2：非阻塞提示气泡 —— 每条 toast 最长显示 6s 自动消失
  useEffect(() => {
    if (!autoDismissToasts || autoDismissToasts.length === 0) return undefined
    const t = setTimeout(() => { clearAutoDismissToast?.('all') }, 6000)
    return () => clearTimeout(t)
  }, [autoDismissToasts, clearAutoDismissToast])

  // A-2：调度器过滤日志 —— 新消息/切换角色后重新读取（因为存储在 localStorage，sendMessage 异步写入）
  useEffect(() => {
    // 延迟 300ms，等 sendMessage 内的 storage 写入完成
    const t = setTimeout(() => setDispatcherLogRev((v) => v + 1), 300)
    return () => clearTimeout(t)
  }, [charMessages.length, currentCharacterId])

  // ===== Scroll logic =====

  // scrollToBottom callback
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  // Listen to user scroll position
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120
      setShouldScrollToBottom(isNearBottom)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // When user sends a message (isLoading becomes true), force scroll to bottom
  useEffect(() => {
    if (isLoading) {
      setShouldScrollToBottom(true)
    }
  }, [isLoading])

  // Initial load / character switch: instant scroll to bottom
  useEffect(() => {
    if (charMessages.length > 0) {
      // Use requestAnimationFrame to ensure DOM has rendered
      const raf = requestAnimationFrame(() => {
        scrollToBottom('instant')
        // After character switch scroll completes, reset the flag
        if (isSwitchingChar.current) {
          isSwitchingChar.current = false
          setShouldScrollToBottom(true)
        }
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [currentCharacterId, charMessages.length, scrollToBottom])

  // New messages: smooth scroll to bottom (only if user is at bottom)
  useEffect(() => {
    if (shouldScrollToBottom && !isLoading && charMessages.length > 0 && !isSwitchingChar.current) {
      scrollToBottom('smooth')
    }
  }, [charMessages.length, isLoading, shouldScrollToBottom, scrollToBottom])

  // IntersectionObserver for loading more messages
  useEffect(() => {
    const sentinel = sentinelRef.current
    const container = messagesContainerRef.current
    if (!sentinel || !container) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && visibleCount < charMessages.length) {
          setIsLoadingMore(true)
          const prevScrollHeight = container.scrollHeight
          // Use requestAnimationFrame to batch the state update
          requestAnimationFrame(() => {
            setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, charMessages.length))
            // Restore scroll position after rendering
            requestAnimationFrame(() => {
              const newScrollHeight = container.scrollHeight
              container.scrollTop = newScrollHeight - prevScrollHeight
              setIsLoadingMore(false)
            })
          })
        }
      },
      { root: container, threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [charMessages.length, visibleCount, isLoadingMore])

  // Visible messages (pagination)
  const visibleMessages = useMemo(
    () => charMessages.slice(Math.max(0, charMessages.length - visibleCount)),
    [charMessages, visibleCount]
  )

  const hasMoreMessages = visibleCount < charMessages.length

  const scrollToMessage = useCallback((msgId) => {
    setShowSearch(false)
    setShowChatSettings(false)
    setTimeout(() => {
      const el = messageRefs.current[msgId]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedId(msgId)
        setTimeout(() => setHighlightedId(null), 2000)
      }
    }, 150)
  }, [])

  const handleOpenSearch = useCallback(() => {
    setShowChatSettings(false)
    setShowSearch(true)
  }, [])

  const handleRecall = useCallback(
    (messageId) => {
      if (!currentCharacterId) return Promise.resolve({ success: false, error: '无当前角色' })
      return recallMessage(currentCharacterId, messageId)
    },
    [currentCharacterId, recallMessage]
  )

  // 追问：进入 ChatInput 追问模式（只针对最后一条 AI 回复）
  const handleFollowUp = useCallback((message) => {
    // 仅允许最后一条 AI 回复作为追问对象
    if (message?.role !== 'assistant') return
    setFollowUpTarget(message)
  }, [])

  // 重新回答：触发 store 中的 regenerateMessage，替换原回复
  const handleRegenerate = useCallback(
    async (messageId) => {
      if (!currentCharacterId) return { success: false, error: '无当前角色' }
      return regenerateMessage(currentCharacterId, messageId)
    },
    [currentCharacterId, regenerateMessage]
  )

  const handleCancelFollowUp = useCallback(() => {
    setFollowUpTarget(null)
  }, [])

  const handleSend = useCallback((content) => {
    if (followUpTarget) {
      sendMessage(content, followUpTarget)
      setFollowUpTarget(null)
    } else {
      sendMessage(content)
    }
  }, [followUpTarget, sendMessage])

  if (!character) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f2f2f7] dark:bg-gray-950">
        <EmptyState
          icon="💬"
          title="选择一个角色开始聊天"
          description="从左侧列表中选择一个 AI 角色，或创建一个新角色"
          action={
            <button onClick={() => setView('create')} className="ios-button">
              创建角色
            </button>
          }
        />
      </div>
    )
  }

  const hasMessages = charMessages.length > 0

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f2f2f7] dark:bg-gray-950 overflow-hidden">
      {/* Chat header */}
      <div className="flex-shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 px-3 sm:px-4 py-2.5 sm:py-3 pt-safe">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center">
            {character.avatar ? (
              <img src={character.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span className="text-base font-semibold text-ios-blue">
                {character.name?.charAt(0) || '?'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{character.name}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{character.identity || 'AI 伙伴'}</p>
            {scene.name !== '默认场景' && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                场景：{scene.name}{scene.items && scene.items.length > 0 ? ` | ${scene.items.slice(0, 5).join('、')}${scene.items.length > 5 ? '...' : ''}` : ''}
              </p>
            )}
            {/* ===== 角色状态：😊 开心｜坐在沙发｜陪你聊天 —— 数据只来自 CharacterStateRuntime ===== */}
            {displayState.stateDisplay && (
              <p className="text-xs text-purple-500/85 dark:text-purple-400/80 truncate mt-0.5">
                状态：{displayState.stateDisplay}
              </p>
            )}
            {hasStateInfo && (
              <p className="text-xs text-ios-blue/70 dark:text-ios-blue/60 truncate mt-0.5">
                {[
                  displayState.position && `位置：${displayState.position}`,
                  displayState.clothing && `衣着：${displayState.clothing}`,
                  displayState.action && `动作：${displayState.action}`,
                  displayState.heldItems && displayState.heldItems.length > 0 && `持有：${displayState.heldItems.join('、')}`,
                ].filter(Boolean).join(' | ')}
              </p>
            )}
            <p className="text-xs text-gray-400/60 dark:text-gray-500/60 truncate mt-0.5">
              {currentTime}
            </p>
            {/* ================================================================
               C-1：模式角标 Pill（单人/多人）— 可点击展开在场列表 + 一键解散
               ================================================================ */}
            <div className="mt-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setModePanelOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                    activeChars.length > 0
                      ? 'bg-gradient-to-r from-green-500/15 to-emerald-500/10 border-green-500/30 text-green-700 dark:text-green-400 hover:from-green-500/25 hover:to-emerald-500/20'
                      : 'bg-gradient-to-r from-ios-blue/15 to-purple-500/10 border-ios-blue/30 text-ios-blue/90 dark:text-ios-blue/80 hover:from-ios-blue/25 hover:to-purple-500/20'
                  }`}
                >
                  <span className="flex items-center justify-center">
                    {activeChars.length > 0 ? (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M8 10a3 3 0 100-6 3 3 0 000 6zm8 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-3.314 2.686-6 6-6s6 2.686 6 6v1H2v-1zm14-4.5a4.5 4.5 0 014.5-4.5h.5a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-.5a.5.5 0 00-.5.5v1.5a.5.5 0 01-.5.5h-.5a.5.5 0 01-.5-.5v1.5c0 .828-.672 1.5-1.5 1.5h-.5a.5.5 0 01-.5-.5v-4.5z"/>
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM3.5 20.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5v1h-17v-1z"/>
                      </svg>
                    )}
                  </span>
                  <span>
                    {activeChars.length > 0 ? `多人·${activeChars.length + 1}人在场` : '单人模式'}
                  </span>
                  <svg
                    className={`w-2.5 h-2.5 opacity-70 transition-transform ${modePanelOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {/* 在场角色小头像 chips（不展开也显示前3个） */}
                {activeChars.length > 0 && (
                  <div className="flex -space-x-1.5" aria-hidden>
                    {[character.name, ...activeChars].slice(0, 4).map((name, i) => {
                      const ch = characters.find((c) => c.name === name)
                      const show = characters.length > 0 ? true : true
                      const rest = i === 3 && (activeChars.length + 1) > 4
                      return (
                        <div
                          key={`${name}-${i}`}
                          className="w-5 h-5 rounded-full bg-gradient-to-br from-ios-blue/30 to-purple-400/30 border border-white dark:border-gray-900 flex items-center justify-center overflow-hidden shadow-sm"
                          title={name}
                        >
                          {rest ? (
                            <span className="text-[9px] font-semibold text-ios-blue/90">+{(activeChars.length + 1) - 3}</span>
                          ) : ch?.avatar ? (
                            <img src={ch.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[9px] font-semibold text-ios-blue/90">
                              {String(name || '?').charAt(0)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* 展开：在场角色列表 + 一键解散按钮 */}
              {modePanelOpen && (
                <div className="mt-2 p-2.5 rounded-xl bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-100 dark:border-gray-700 shadow-sm animate-fade-in space-y-2">
                  <div className="space-y-1">
                    {[character.name, ...activeChars].map((name, i) => {
                      const ch = characters.find((c) => c.name === name)
                      const isMain = i === 0
                      return (
                        <div
                          key={`${name}-row-${i}`}
                          className="flex items-center gap-2 py-1 px-1.5 rounded-lg"
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center overflow-hidden">
                            {ch?.avatar ? (
                              <img src={ch.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-semibold text-ios-blue">
                                {String(name || '?').charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                              {name}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">
                              {isMain ? '主角色（始终在场）' : '客串·可召唤离场'}
                            </p>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              isMain
                                ? 'bg-ios-blue/10 text-ios-blue/90'
                                : 'bg-green-500/10 text-green-600 dark:text-green-400'
                            }`}
                          >
                            {isMain ? '主' : '客'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {activeChars.length > 0 && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const dismissed = dismissAllGuests?.()
                            if (dismissed && dismissed.length > 0) {
                              setModePanelOpen(false)
                            }
                          } catch (_e) {}
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-orange-500 to-red-500/90 text-white hover:opacity-90 shadow-sm transition-opacity"
                      >
                        一键解散所有客串（回到单人流萤）
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Chat settings button */}
          <button
            onClick={() => setShowChatSettings(true)}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
            title="聊天设置"
          >
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area with virtual scrolling */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 bg-[#f2f2f7] dark:bg-gray-950" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="w-full max-w-3xl mx-auto">
          {/* Load more sentinel */}
          {hasMoreMessages && (
            <div ref={sentinelRef} className="flex justify-center py-3">
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {isLoadingMore ? '加载中...' : `上滑加载更多 (${charMessages.length - visibleCount} 条)`}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {!hasMessages && character.openingLine && (
              <div className="message-enter">
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center mt-1">
                    {character.avatar ? (
                      <img src={character.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-xs font-semibold text-ios-blue">
                        {character.name?.charAt(0) || 'AI'}
                      </span>
                    )}
                  </div>
                  <div className="max-w-[80%]">
                    <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm leading-relaxed shadow-sm border border-gray-100 dark:border-gray-700">
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">开场白</p>
                      {character.openingLine}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {visibleMessages.map((msg, i) => {
                // 判断 AI 消息是否是对追问的回复
                const isReplyToFollowUp = !msg.recalled && msg.role === 'assistant' && i > 0 && visibleMessages[i - 1].role === 'user' && visibleMessages[i - 1].quoteTarget
                return (
              <MessageBubble
                key={msg.id}
                message={msg}
                character={character}
                prevTimestamp={i > 0 ? visibleMessages[i - 1].timestamp : null}
                highlighted={highlightedId === msg.id}
                messageRef={(el) => { messageRefs.current[msg.id] = el }}
                onRecall={handleRecall}
                onFollowUp={handleFollowUp}
                onRegenerate={handleRegenerate}
                onScrollToMessage={scrollToMessage}
                allMessages={charMessages}
                isReplyToFollowUp={isReplyToFollowUp}
                guestCharacterStates={guestCharacterStates}
              />
                )
              })}

            {isLoading && (
              <div className="flex gap-2 message-enter">
                <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center mt-1">
                  {character.avatar ? (
                    <img src={character.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-xs font-semibold text-ios-blue">
                      {character.name?.charAt(0) || 'AI'}
                    </span>
                  )}
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex gap-1.5">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* ================================================================
           A-2：调度器过滤日志折叠条（有内容才显示，默认折叠）
           ================================================================ */}
      <DispatcherLogAccordion
        characterId={currentCharacterId}
        messageIds={charMessages.map((m) => m.id)}
        revision={dispatcherLogRev}
        showPref={showDispatcherLogs}
        open={dispatcherLogOpen}
        onToggle={() => setDispatcherLogOpen((v) => !v)}
        getLogsFn={getRecentDispatcherLogsForCharacter}
      />

      <RecentSummonChips disabled={isLoading} />
      <ChatInput onSend={handleSend} isLoading={isLoading} followUpTarget={followUpTarget} onCancelFollowUp={handleCancelFollowUp} />

      {/* Chat settings panel */}
      {showChatSettings && (
        <ChatSettingsPanel
          character={character}
          onSearch={handleOpenSearch}
          onExport={async (format) => {
            const result = await exportChatHistory(currentCharacterId, format)
            if (!result.success) {
              setExportError(result.error || '导出失败')
            }
          }}
          onEdit={() => { setShowChatSettings(false); setView('edit', character.id) }}
          onMemoryDashboard={() => {
            console.log('[ChatWindow] 点击「记忆仪表盘」按钮 → 开启全屏守卫并 setView(memory-dashboard)')
            setShowChatSettings(false)
            // 先启用全屏守卫，防止视图闪现回 chat
            setFullScreenPageOpen(true)
            try {
              setView('memory-dashboard')
              console.log('[ChatWindow] setView(memory-dashboard) 成功，currentCharacterId=', currentCharacterId)
            } catch (e) {
              console.error('[ChatWindow] setView(memory-dashboard) 失败:', e)
            }
          }}
          onUsageStats={() => { setShowChatSettings(false); setView('settings') }}
          hasMessages={hasMessages}
          onClose={() => setShowChatSettings(false)}
        />
      )}

      {/* Search panel */}
      {showSearch && (
        <ChatSearch
          messages={charMessages}
          character={character}
          onSelectMessage={scrollToMessage}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Store error toast */}
      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl bg-red-500 text-white text-sm font-medium shadow-2xl animate-bounce-in">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
            <button
              onClick={() => clearError()}
              className="ml-2 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 flex-shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Export error toast */}
      {exportError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl bg-red-500 text-white text-sm font-medium shadow-2xl animate-bounce-in">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{exportError}</span>
            <button
              onClick={() => setExportError(null)}
              className="ml-2 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 flex-shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================
         C-2：长沉默客串自动退场 —— 非阻塞提示气泡
         （半透明磨砂玻璃，右上角堆叠，6s 后自动消失）
         ================================================================ */}
      {autoDismissToasts && autoDismissToasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[90] space-y-2 w-[min(280px,80vw)] pointer-events-none">
          {autoDismissToasts.map((t) => (
            <div
              key={t.id}
              className="relative backdrop-blur-xl bg-white/85 dark:bg-gray-800/85 border border-gray-100 dark:border-gray-700 rounded-2xl p-3 shadow-lg shadow-black/10 animate-fade-in"
            >
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400/90 to-red-400/90 flex items-center justify-center flex-shrink-0 text-white">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <line x1="23" y1="9" x2="17" y2="15"/>
                    <line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-200">
                    {t.autoDismissedCount > 0 ? `${t.autoDismissedCount} 位客串已自动退场` : '长沉默客串检查'}
                  </p>
                  {t.dismissedNames && t.dismissedNames.length > 0 && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {t.dismissedNames.join('、')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => clearAutoDismissToast?.(t.id)}
                  className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center flex-shrink-0 pointer-events-auto"
                  aria-label="关闭"
                >
                  <svg className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ======================================================================
   A-2：DispatcherLogAccordion —— 调度器过滤日志折叠条组件
   - 有内容才显示；
   - 显示偏好 false 时完全不显示；
   - 默认折叠；点击展开后展示最后 N 条（按轮次 id 分组，每组按时间倒序）
   ====================================================================== */
function DispatcherLogAccordion({ characterId, messageIds, revision, showPref, open, onToggle, getLogsFn }) {
  // 取最近 20 条日志
  const logs = useMemo(() => {
    try {
      const arr = (typeof getLogsFn === 'function')
        ? getLogsFn(characterId, 20)
        : []
      return Array.isArray(arr) ? arr : []
    } catch (_e) {
      return []
    }
  }, [characterId, getLogsFn, revision, messageIds.length])

  // 按 sessionRoundId 分组，同一轮（同一条用户消息后的校验）聚合展示
  const groups = useMemo(() => {
    const map = new Map()
    for (const l of logs) {
      const key = l?.sessionRoundId || `msg-${l?.messageId || 'unknown'}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          messageId: l?.messageId,
          sessionRoundId: l?.sessionRoundId,
          ts: l?.ts || 0,
          totalFiltered: 0,
          totalErrors: 0,
          totalWarnings: 0,
          regenCount: 0,
          maxRegen: l?.maxRegen,
          autoFixed: false,
          exhausted: false,
          items: [],
        })
      }
      const g = map.get(key)
      g.ts = Math.max(g.ts, l.ts || 0)
      g.regenCount = Math.max(g.regenCount, l.regenCount || 0)
      g.maxRegen = l.maxRegen != null ? l.maxRegen : g.maxRegen
      if (l.autoFixed) g.autoFixed = true
      if (l.exhaustedMaxRegen) g.exhausted = true
      const filterDropped = Array.isArray(l.filterDropped) ? l.filterDropped.length : 0
      const issues = Array.isArray(l.issues) ? l.issues : []
      const issueErrors = issues.filter((i) => i.level === 'error').length
      const issueWarns = issues.filter((i) => i.level === 'warn').length
      g.totalFiltered += filterDropped + issueErrors + issueWarns
      g.totalErrors += issueErrors
      g.totalWarnings += issueWarns
      g.items.push(l)
    }
    return Array.from(map.values()).sort((a, b) => b.ts - a.ts).slice(0, 6)
  }, [logs])

  if (!showPref) return null
  if (groups.length === 0) return null

  const latestGroup = groups[0]
  return (
    <div className="mx-3 mb-2">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-50/80 to-purple-50/70 dark:from-indigo-900/15 dark:to-purple-900/10 border border-indigo-100 dark:border-indigo-800/30 overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-white/40 dark:hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500/90 to-purple-500/90 flex items-center justify-center flex-shrink-0 text-white shadow-sm">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                调度器过滤日志
                {latestGroup.regenCount > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-orange-500/10 text-orange-600 dark:text-orange-400">
                    重写 {latestGroup.regenCount}/{latestGroup.maxRegen || 2}
                  </span>
                )}
                {latestGroup.autoFixed && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-green-500/10 text-green-600 dark:text-green-400">
                    自动修正
                  </span>
                )}
                {latestGroup.exhausted && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
                    达上限
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {(() => {
                  const parts = []
                  if (latestGroup.totalErrors) parts.push(`${latestGroup.totalErrors} 处越权/代答`)
                  if (latestGroup.totalWarnings) parts.push(`${latestGroup.totalWarnings} 条提醒`)
                  if (latestGroup.totalFiltered && !latestGroup.totalErrors && !latestGroup.totalWarnings) {
                    parts.push(`${latestGroup.totalFiltered} 条过滤`)
                  }
                  return parts.length > 0 ? parts.join('，') : '本轮无过滤'
                })()}
              </p>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {open && (
          <div className="px-3.5 pb-3 space-y-2 border-t border-indigo-100/70 dark:border-indigo-800/20 animate-fade-in">
            {groups.map((g) => (
              <div
                key={g.key}
                className="mt-2.5 rounded-xl bg-white/70 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800/60 p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                    {new Date(g.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {g.regenCount > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
                        重写{g.regenCount}次
                      </span>
                    )}
                    {g.autoFixed && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                        自动修正
                      </span>
                    )}
                    {g.exhausted && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                        达上限
                      </span>
                    )}
                    {g.totalFiltered === 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-500/10 text-gray-500">
                        无过滤
                      </span>
                    )}
                  </div>
                </div>
                {g.items.map((l, idx) => {
                  const issues = Array.isArray(l.issues) ? l.issues : []
                  const filterDropped = Array.isArray(l.filterDropped) ? l.filterDropped : []
                  const remarks = Array.isArray(l.remarks) ? l.remarks : []
                  if (issues.length === 0 && filterDropped.length === 0 && remarks.length === 0) {
                    return null
                  }
                  return (
                    <div
                      key={`${g.key}-item-${idx}`}
                      className="mt-1.5 space-y-0.5 text-[11px]"
                    >
                      {issues.map((issue, i) => (
                        <div
                          key={`${g.key}-${idx}-i-${i}`}
                          className={`pl-2 border-l-2 ${
                            issue.level === 'error'
                              ? 'border-red-400 text-red-600 dark:text-red-400'
                              : issue.level === 'warn'
                                ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                                : 'border-blue-400 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          <span className="font-semibold">
                            [{issue.level === 'error' ? '越权' : issue.level === 'warn' ? '提醒' : '信息'}]
                          </span>{' '}
                          <span className="text-gray-700 dark:text-gray-300">
                            {issue.message || issue.type || JSON.stringify(issue).slice(0, 200)}
                          </span>
                        </div>
                      ))}
                      {filterDropped.map((d, i) => (
                        <div
                          key={`${g.key}-${idx}-d-${i}`}
                          className="pl-2 border-l-2 border-purple-400/60 text-purple-700 dark:text-purple-400"
                        >
                          <span className="font-semibold">[过滤]</span>{' '}
                          <span className="text-gray-700 dark:text-gray-300">
                            {(typeof d === 'string') ? d : d?.reason || d?.message || JSON.stringify(d).slice(0, 200)}
                          </span>
                        </div>
                      ))}
                      {remarks.map((r, i) => (
                        <div
                          key={`${g.key}-${idx}-r-${i}`}
                          className="pl-2 border-l-2 border-gray-300/60 text-gray-500 dark:text-gray-400"
                        >
                          <span className="font-semibold">[备注]</span>{' '}
                          {(typeof r === 'string') ? r : r?.reason || r?.message || JSON.stringify(r).slice(0, 200)}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
            <p className="pt-1 text-[10px] text-gray-400 dark:text-gray-500 text-center">
              仅保留最近 {Math.min(groups.length, 6)} 轮；设置中可关闭显示或清除日志
            </p>
          </div>
        )}
      </div>
    </div>
  )
}