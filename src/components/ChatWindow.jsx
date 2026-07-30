import { useEffect, useRef, useState, useCallback } from 'react'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import EmptyState from './EmptyState'
import useStore from '../store/useStore'
import { synthesizeSpeech, synthesizeCloud, playAudioBlob } from '../services/tts'

export default function ChatWindow() {
  const {
    currentCharacterId,
    characters,
    messages,
    isLoading,
    sendMessage,
    voiceSettings,
    settings,
    setView,
    exportChatHistory,
  } = useStore()

  const messagesEndRef = useRef(null)
  const voiceSettingsRef = useRef(voiceSettings)
  const settingsRef = useRef(settings)
  const [showExportMenu, setShowExportMenu] = useState(false)

  // Keep refs updated
  voiceSettingsRef.current = voiceSettings
  settingsRef.current = settings

  const character = characters.find((c) => c.id === currentCharacterId)
  const charMessages = currentCharacterId ? messages[currentCharacterId] || [] : []

  // Get effective voice settings (character preset overrides global)
  const getEffectiveVoiceSettings = useCallback(() => {
    if (character?.voiceSettings) {
      return { ...voiceSettingsRef.current, ...character.voiceSettings }
    }
    return voiceSettingsRef.current
  }, [character])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [charMessages, isLoading])

  // Auto play voice for assistant messages
  useEffect(() => {
    const effectiveSettings = getEffectiveVoiceSettings()
    if (!effectiveSettings.autoPlay) return
    if (charMessages.length === 0) return

    const lastMsg = charMessages[charMessages.length - 1]
    if (lastMsg.role === 'assistant') {
      const currentSettings = settingsRef.current
      if (currentSettings.ttsProvider !== 'web-speech') {
        synthesizeCloud(lastMsg.content, effectiveSettings, currentSettings)
          .then((result) => {
            if (result.blob) return playAudioBlob(result.blob)
          })
          .catch(() => {})
      } else {
        synthesizeSpeech(lastMsg.content, effectiveSettings).catch(() => {})
      }
    }
  }, [charMessages.length, getEffectiveVoiceSettings])

  if (!character) {
    return (
      <div className="flex-1 flex items-center justify-center bg-ios-bg dark:bg-gray-950">
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
    <div className="flex-1 flex flex-col h-full bg-ios-bg dark:bg-gray-950">
      {/* Chat header */}
      <div className="flex-shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 px-4 py-3 pt-safe">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center">
            {character.avatar ? (
              <img src={character.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-base font-semibold text-ios-blue">
                {character.name?.charAt(0) || '?'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{character.name}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{character.identity || 'AI 伙伴'}</p>
          </div>

          {/* Export button */}
          {hasMessages && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
                title="导出聊天记录"
              >
                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-20 w-40 ios-card p-1.5 shadow-lg animate-fade-in">
                    <button
                      onClick={() => { exportChatHistory(currentCharacterId, 'json'); setShowExportMenu(false) }}
                      className="w-full text-left px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      JSON 格式
                    </button>
                    <button
                      onClick={() => { exportChatHistory(currentCharacterId, 'txt'); setShowExportMenu(false) }}
                      className="w-full text-left px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      TXT 文本格式
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setView('edit', character.id)}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
            title="编辑角色"
          >
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {!hasMessages && character.openingLine && (
            <div className="message-enter">
              <div className="flex gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center mt-1">
                  {character.avatar ? (
                    <img src={character.avatar} alt="" className="w-full h-full object-cover" />
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

          {charMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} character={character} />
          ))}

          {isLoading && (
            <div className="flex gap-2 message-enter">
              <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center mt-1">
                {character.avatar ? (
                  <img src={character.avatar} alt="" className="w-full h-full object-cover" />
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

      <ChatInput onSend={sendMessage} isLoading={isLoading} />
    </div>
  )
}