import { useState } from 'react'
import { synthesizeSpeech, synthesizeCloud, playAudioBlob, stopAll } from '../services/tts'
import useStore from '../store/useStore'

export default function MessageBubble({ message, character }) {
  const { voiceSettings: globalVoiceSettings, settings } = useStore()
  const isUser = message.role === 'user'
  const [isPlaying, setIsPlaying] = useState(false)
  const [fallbackMsg, setFallbackMsg] = useState(null)

  // Use character voice preset if available, otherwise global
  const voiceSettings = character?.voiceSettings
    ? { ...globalVoiceSettings, ...character.voiceSettings }
    : globalVoiceSettings

  const handlePlayVoice = async () => {
    if (isPlaying) {
      stopAll()
      setIsPlaying(false)
      setFallbackMsg(null)
      return
    }

    try {
      setIsPlaying(true)
      setFallbackMsg(null)

      if (settings.ttsProvider !== 'web-speech') {
        const result = await synthesizeCloud(message.content, voiceSettings, settings)
        if (result.blob) {
          await playAudioBlob(result.blob)
        }
        if (result.fallbackReason) {
          setFallbackMsg(result.fallbackReason)
        }
      } else {
        await synthesizeSpeech(message.content, voiceSettings)
      }
    } catch (err) {
      console.error('TTS error:', err)
      setFallbackMsg(`播放失败: ${err.message}`)
      // Last resort fallback to browser speech
      try {
        await synthesizeSpeech(message.content, voiceSettings)
        setFallbackMsg('当前使用系统语音')
      } catch {
        // Both failed
      }
    } finally {
      setIsPlaying(false)
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} message-enter`}>
      <div className={`flex gap-2 max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center mt-1">
            {character?.avatar ? (
              <img src={character.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-semibold text-ios-blue">
                {character?.name?.charAt(0) || 'AI'}
              </span>
            )}
          </div>
        )}

        <div className="relative group">
          <div
            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
              isUser
                ? 'bg-ios-blue text-white rounded-br-md'
                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700'
            }`}
          >
            {message.content}
          </div>

          {!isUser && (
            <div className="flex items-center gap-1">
              <button
                onClick={handlePlayVoice}
                className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-all duration-200 ${
                  isPlaying
                    ? 'bg-ios-blue text-white scale-110'
                    : 'bg-white dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-ios-blue hover:scale-110 opacity-0 group-hover:opacity-100'
                }`}
                title={isPlaying ? '停止播放' : '朗读'}
              >
                {isPlaying ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.8l4.7-3.5a.5.5 0 01.8.4v12.6a.5.5 0 01-.8.4L6.5 15.2H4a1 1 0 01-1-1v-4.4a1 1 0 011-1h2.5z" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      {fallbackMsg && !isUser && (
        <div className="text-xs text-amber-500 dark:text-amber-400 mt-1 ml-10">{fallbackMsg}</div>
      )}
    </div>
  )
}