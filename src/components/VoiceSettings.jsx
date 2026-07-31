import { useState, useRef, useEffect } from 'react'
import useStore from '../store/useStore'
import {
  isSpeechSupported,
  isSpeechAvailable,
  getAvailableVoices,
  getChineseVoices,
  getVoiceGroups,
  previewVoice,
  cloneVoice,
  synthesizeSpeech,
  synthesizeCloud,
  playAudioBlob,
  stopAll,
  TONE_PRESETS,
  TTS_ERROR,
  TtsError,
  isAndroidTtsAvailable,
  isAnyTtsAvailable,
} from '../services/tts'
import {
  extractAudio,
  isFFmpegSupported,
  createAudioPreviewUrl,
  revokeAudioPreviewUrl,
  formatDuration,
  isVideoFile,
  validateMediaFile,
} from '../services/extractAudio'
import { diagnoseEnvironment, runDiagnosticTest, getDiagnosisReport } from '../services/envCheck'

const PITCH_CATEGORY_LABELS = {
  low: '低音', 'medium-low': '中低音', medium: '中音', 'medium-high': '中高音', high: '高音',
}

export default function VoiceSettings({ voiceSettings: externalVoiceSettings, onChange: externalOnChange, compact }) {
  const store = useStore()
  const { settings, updateVoiceSettings } = store

  const voiceSettings = externalVoiceSettings || store.voiceSettings
  const updateVoice = externalOnChange || updateVoiceSettings

  const [isPreviewing, setIsPreviewing] = useState(false)
  const [cloneError, setCloneError] = useState('')
  const [cloneSuccess, setCloneSuccess] = useState('')
  const [voices, setVoices] = useState([])
  const [chineseVoices, setChineseVoices] = useState([])
  const [voiceGroups, setVoiceGroups] = useState({ zh: [], en: [], other: [] })
  const [voicesLoading, setVoicesLoading] = useState(true)
  const [voicesError, setVoicesError] = useState('')
  const [speechSupported, setSpeechSupported] = useState(true)
  const audioInputRef = useRef(null)

  // 音频提取相关
  const [extractState, setExtractState] = useState('idle')
  const [extractProgress, setExtractProgress] = useState(0)
  const [extractStage, setExtractStage] = useState('')
  const [extractedAudio, setExtractedAudio] = useState(null)
  const [extractError, setExtractError] = useState('')
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const previewAudioRef = useRef(null)
  const previewUrlRef = useRef(null)

  // 环境检测
  const [envDiag, setEnvDiag] = useState(null)
  const [isDiagRunning, setIsDiagRunning] = useState(false)
  const [diagResult, setDiagResult] = useState(null)
  const [showDiagDetail, setShowDiagDetail] = useState(false)

  // 模拟克隆结果
  const [simulatedResult, setSimulatedResult] = useState(null)
  const [isSimPreviewing, setIsSimPreviewing] = useState(false)

  // 降级提示
  const [fallbackInfo, setFallbackInfo] = useState(null)

  const provider = settings.ttsProvider || 'web-speech'
  const cloudPresets = TONE_PRESETS[provider] || []

  // 加载语音列表
  useEffect(() => {
    if (!isSpeechSupported()) {
      setSpeechSupported(false)
      setVoicesLoading(false)
      setVoicesError('当前浏览器不支持语音合成功能。')
      return
    }

    let cancelled = false
    async function loadVoices() {
      try {
        const [allVoices, zhVoices, groups] = await Promise.all([
          getAvailableVoices(), getChineseVoices(), getVoiceGroups(),
        ])
        if (cancelled) return
        setVoices(allVoices)
        setChineseVoices(zhVoices)
        setVoiceGroups(groups)
        if (allVoices.length === 0) {
          setVoicesError('未检测到可用的语音引擎。请确认系统已安装语音包。')
        } else if (zhVoices.length === 0) {
          setVoicesError('未检测到中文语音，将使用默认语音。可尝试安装中文语音包。')
        }
      } catch (err) {
        if (!cancelled) setVoicesError('加载语音列表失败: ' + err.message)
      } finally {
        if (!cancelled) setVoicesLoading(false)
      }
    }
    loadVoices()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const diag = diagnoseEnvironment()
    setEnvDiag(diag)
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) revokeAudioPreviewUrl(previewUrlRef.current)
    }
  }, [])

  // 试听语音
  const handlePreview = async () => {
    setIsPreviewing(true)
    setFallbackInfo(null)
    try {
      if (provider !== 'web-speech') {
        const result = await synthesizeCloud('你好，这是我的声音，你觉得怎么样？', voiceSettings, settings)
        if (result.blob) {
          await playAudioBlob(result.blob)
        }
        if (result.fallbackReason) {
          const errorType = result.errorType
          const typeLabel = errorType === TTS_ERROR.AUTH ? '密钥配置错误'
            : errorType === TTS_ERROR.NETWORK ? '网络连接失败'
            : errorType === TTS_ERROR.API ? '服务接口报错'
            : ''
          setFallbackInfo({
            message: result.fallbackReason,
            type: errorType,
            typeLabel,
          })
        }
      } else {
        // web-speech: try Android native first, then Web Speech
        if (isAndroidTtsAvailable()) {
          try {
            const { androidTtsSpeak } = await import('../services/tts')
            await androidTtsSpeak('你好，这是我的声音，你觉得怎么样？', voiceSettings)
            setFallbackInfo({ message: '使用 Android 系统语音播放', type: 'android', typeLabel: 'Android 原生 TTS' })
          } catch (androidErr) {
            try {
              await previewVoice(voiceSettings)
            } catch (speechErr) {
              setFallbackInfo({ message: `试听失败: ${speechErr.message}`, type: 'error', typeLabel: '错误' })
            }
          }
        } else {
          await previewVoice(voiceSettings)
        }
      }
    } catch (err) {
      console.error('Preview error:', err)
      const errorType = err instanceof TtsError ? err.type : 'unknown'
      const typeLabel = errorType === TTS_ERROR.AUTH ? '密钥配置错误'
        : errorType === TTS_ERROR.NETWORK ? '网络连接失败'
        : errorType === TTS_ERROR.API ? '服务接口报错'
        : errorType === TTS_ERROR.UNSUPPORTED ? '环境不支持'
        : '未知错误'
      setFallbackInfo({ message: err.message, type: errorType, typeLabel })
    }
    setIsPreviewing(false)
  }

  // 一键诊断
  const handleDiagnostic = async () => {
    setIsDiagRunning(true)
    setShowDiagDetail(true)
    try {
      const result = await runDiagnosticTest()
      setDiagResult(result)
    } catch (err) {
      setDiagResult({ error: err.message })
    }
    setIsDiagRunning(false)
  }

  // 处理媒体文件选择
  const handleMediaFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setExtractError('')
    setCloneError('')
    setCloneSuccess('')
    setExtractedAudio(null)
    setSimulatedResult(null)
    if (previewUrlRef.current) {
      revokeAudioPreviewUrl(previewUrlRef.current)
      previewUrlRef.current = null
    }

    const validation = validateMediaFile(file)
    if (!validation.valid) {
      setExtractError(validation.error)
      setExtractState('error')
      if (audioInputRef.current) audioInputRef.current.value = ''
      return
    }

    if (isVideoFile(file) && !isFFmpegSupported()) {
      setExtractError(
        '当前浏览器不支持视频音频提取（需要 WebAssembly 和 SharedArrayBuffer 支持）。\n\n请尝试：\n1. 使用 Chrome 或 Edge 浏览器\n2. 将视频转换为 MP3/WAV 后上传'
      )
      setExtractState('error')
      if (audioInputRef.current) audioInputRef.current.value = ''
      return
    }

    setExtractState('extracting')
    setExtractProgress(0)
    setExtractStage('准备中...')

    try {
      const result = await extractAudio(file, ({ progress, stage }) => {
        setExtractProgress(progress)
        setExtractStage(stage)
      })
      setExtractedAudio(result)
      previewUrlRef.current = createAudioPreviewUrl(result.blob)
      setExtractState('preview')
    } catch (err) {
      setExtractError(err.message)
      setExtractState('error')
    }

    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  const handlePreviewToggle = () => {
    if (!previewAudioRef.current || !previewUrlRef.current) return
    if (isPreviewPlaying) {
      previewAudioRef.current.pause()
      previewAudioRef.current.currentTime = 0
      setIsPreviewPlaying(false)
    } else {
      previewAudioRef.current.src = previewUrlRef.current
      previewAudioRef.current.play().catch((err) => {
        console.error('Audio preview error:', err)
        setExtractError('音频预览播放失败')
      })
      setIsPreviewPlaying(true)
    }
  }

  const handlePreviewEnded = () => {
    setIsPreviewPlaying(false)
  }

  // 确认克隆
  const handleConfirmClone = async () => {
    if (!extractedAudio) return
    setExtractState('cloning')
    setCloneError('')
    setCloneSuccess('')
    setSimulatedResult(null)

    try {
      const result = await cloneVoice(extractedAudio.blob, `角色声音_${Date.now()}`, settings)

      if (result.provider === 'simulated') {
        setSimulatedResult({
          voiceSettings: result.voiceSettings,
          analysis: result.analysis,
          matchReason: result.voiceSettings.matchReason,
        })
        updateVoice({
          voiceURI: result.voiceSettings.voiceURI,
          speed: result.voiceSettings.speed,
          pitch: result.voiceSettings.pitch,
          clonedVoiceId: result.voiceId,
          clonedVoiceName: extractedAudio.fileName,
          clonedProvider: 'simulated',
          simulatedClone: result,
        })
        setCloneSuccess('模拟克隆完成！已根据音频特征匹配最佳浏览器语音。')
        setExtractState('idle')
      } else {
        updateVoice({
          clonedVoiceId: result.voiceId,
          clonedVoiceName: result.name || extractedAudio.fileName,
          clonedProvider: result.provider,
          simulatedClone: null,
          cloudVoiceId: result.voiceId,
        })
        setCloneSuccess(`声音克隆成功！(${result.provider})`)
        setExtractState('idle')
      }
    } catch (err) {
      setCloneError(err.message)
      setExtractState('preview')
    }
  }

  const handleSimPreview = async () => {
    if (!simulatedResult) return
    setIsSimPreviewing(true)
    try {
      await synthesizeSpeech(
        '你好，这是根据你上传的音频模拟克隆的声音效果。',
        {
          voiceURI: simulatedResult.voiceSettings.voiceURI,
          speed: simulatedResult.voiceSettings.speed,
          pitch: simulatedResult.voiceSettings.pitch,
        }
      )
    } catch (err) {
      console.error('Sim preview error:', err)
    }
    setIsSimPreviewing(false)
  }

  const handleResetExtract = () => {
    if (previewUrlRef.current) {
      revokeAudioPreviewUrl(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setExtractedAudio(null)
    setExtractError('')
    setSimulatedResult(null)
    setExtractState('idle')
    setExtractProgress(0)
    setExtractStage('')
    setIsPreviewPlaying(false)
  }

  const currentVoiceURI = voiceSettings.voiceURI || ''
  const currentVoiceName = voices.find((v) => v.voiceURI === currentVoiceURI)?.name || '默认语音'

  const headingClass = compact
    ? 'text-sm font-semibold text-gray-700 dark:text-gray-300'
    : 'text-base font-semibold text-gray-900 dark:text-gray-100'

  const hasCloudConfig = provider !== 'web-speech' && (
    (provider === 'aliyun' && settings.aliyunAppKey) ||
    (provider === 'tencent' && settings.tencentAppId) ||
    (provider === 'xunfei' && settings.xunfeiAppId)
  )

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      <h3 className={headingClass}>{compact ? '语音预设' : '语音设置'}</h3>

      {/* Environment warning */}
      {envDiag && envDiag.level !== 'ok' && (
        <div className={`p-3 rounded-xl text-sm ${
          envDiag.level === 'error'
            ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
        }`}>
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="font-medium">语音需要本地运行，当前环境不支持。</p>
              <div className="flex gap-2 mt-1.5">
                <button onClick={handleDiagnostic} disabled={isDiagRunning} className="text-xs underline hover:no-underline disabled:opacity-50">
                  {isDiagRunning ? '检测中...' : '一键测试'}
                </button>
                {showDiagDetail && (
                  <button onClick={() => setShowDiagDetail(false)} className="text-xs underline hover:no-underline">收起</button>
                )}
              </div>
              {showDiagDetail && diagResult && (
                <div className="mt-2 p-2 bg-white/50 dark:bg-black/30 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {diagResult.error ? `诊断失败: ${diagResult.error}` : getDiagnosisReport()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fallback info */}
      {fallbackInfo && (
        <div className={`p-3 rounded-xl ${
          fallbackInfo.type === TTS_ERROR.AUTH
            ? 'bg-red-50 dark:bg-red-900/30'
            : fallbackInfo.type === TTS_ERROR.NETWORK
            ? 'bg-amber-50 dark:bg-amber-900/30'
            : fallbackInfo.type === 'android'
            ? 'bg-blue-50 dark:bg-blue-900/30'
            : 'bg-amber-50 dark:bg-amber-900/30'
        }`}>
          <p className={`text-sm flex items-center gap-2 ${
            fallbackInfo.type === TTS_ERROR.AUTH
              ? 'text-red-700 dark:text-red-300'
              : fallbackInfo.type === 'android'
              ? 'text-blue-700 dark:text-blue-300'
              : 'text-amber-700 dark:text-amber-300'
          }`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {fallbackInfo.type === TTS_ERROR.AUTH || fallbackInfo.type === 'error' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : fallbackInfo.type === 'android' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
            {fallbackInfo.typeLabel && (
              <span className="font-medium px-1.5 py-0.5 rounded text-xs bg-white/50 dark:bg-black/30">{fallbackInfo.typeLabel}</span>
            )}
            {fallbackInfo.message}
          </p>
        </div>
      )}

      {/* Clone success */}
      {cloneSuccess && (
        <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl">
          <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {cloneSuccess}
          </p>
          {simulatedResult && (
            <div className="mt-2 space-y-1 text-xs text-green-700 dark:text-green-300">
              <p>匹配语音: {simulatedResult.voiceSettings.voiceName}</p>
              <p>语速: {simulatedResult.voiceSettings.speed}x · 音调: {simulatedResult.voiceSettings.pitch}</p>
              {simulatedResult.analysis && !simulatedResult.analysis.fallback && (
                <p>分析: {PITCH_CATEGORY_LABELS[simulatedResult.analysis.pitchCategory] || '未知'}</p>
              )}
              <button onClick={handleSimPreview} disabled={isSimPreviewing} className="mt-1 text-xs text-green-600 dark:text-green-400 underline hover:no-underline disabled:opacity-50">
                {isSimPreviewing ? '试听中...' : '试听模拟克隆效果'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Auto play toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">自动播放语音</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">AI 回复后自动朗读</p>
        </div>
        <button
          onClick={() => updateVoice({ autoPlay: !voiceSettings.autoPlay })}
          className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${
            voiceSettings.autoPlay ? 'bg-ios-green' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${
            voiceSettings.autoPlay ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {/* Cloud voice presets */}
      {provider !== 'web-speech' && cloudPresets.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            云平台音色选择
          </label>
          <select
            value={voiceSettings.cloudVoiceId || settings.cloudVoiceId || ''}
            onChange={(e) => updateVoice({ cloudVoiceId: e.target.value })}
            className="ios-input"
          >
            <option value="">-- 使用全局默认音色 --</option>
            {cloudPresets.map((tone) => (
              <option key={tone.id} value={tone.id}>
                {tone.name} ({tone.gender === 'female' ? '女' : '男'}) - {tone.desc}
              </option>
            ))}
          </select>
          {!hasCloudConfig && (
            <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">
              请在设置中填写 {provider === 'aliyun' ? '阿里云' : provider === 'tencent' ? '腾讯云' : '讯飞'} 密钥后启用云端语音
            </p>
          )}
        </div>
      )}

      {/* Web Speech settings */}
      {provider === 'web-speech' && (
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          {!speechSupported && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-xl">
              <p className="text-sm text-red-600 dark:text-red-400">当前浏览器不支持语音合成功能。请使用 Chrome 或 Edge 浏览器以启用语音功能。</p>
            </div>
          )}
          {speechSupported && voicesError && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl">
              <p className="text-sm text-amber-700 dark:text-amber-300">{voicesError}</p>
            </div>
          )}

          {speechSupported && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">语音选择</label>
              {voicesLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 py-2">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-ios-blue rounded-full animate-spin" />
                  加载语音列表中...
                </div>
              ) : voices.length > 0 ? (
                <div className="space-y-2">
                  {chineseVoices.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">中文语音</p>
                      <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
                        {chineseVoices.map((voice) => (
                          <button
                            key={voice.voiceURI}
                            type="button"
                            onClick={() => updateVoice({ voiceURI: voice.voiceURI, voiceIndex: chineseVoices.indexOf(voice) })}
                            className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                              currentVoiceURI === voice.voiceURI
                                ? 'bg-ios-blue text-white'
                                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                            }`}
                          >
                            <span className="font-medium block truncate">{voice.name}</span>
                            <span className={`text-xs ${currentVoiceURI === voice.voiceURI ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>{voice.lang}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {voiceGroups.en.length > 0 && (
                    <details className="group">
                      <summary className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
                        其他语言语音 ({voiceGroups.en.length + voiceGroups.other.length})
                      </summary>
                      <div className="mt-1 grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
                        {[...voiceGroups.en, ...voiceGroups.other].map((voice) => (
                          <button
                            key={voice.voiceURI}
                            type="button"
                            onClick={() => updateVoice({ voiceURI: voice.voiceURI })}
                            className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                              currentVoiceURI === voice.voiceURI
                                ? 'bg-ios-blue text-white'
                                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                            }`}
                          >
                            <span className="font-medium block truncate">{voice.name}</span>
                            <span className={`text-xs ${currentVoiceURI === voice.voiceURI ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>{voice.lang}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-2">没有可用的语音引擎。请确认系统已安装语音包。</p>
              )}
              {currentVoiceURI && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">当前: {currentVoiceName}</p>}
            </div>
          )}
        </div>
      )}

      {/* Speed slider */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          语速: {voiceSettings.speed.toFixed(1)}x
        </label>
        <input
          type="range" min="0.5" max="2" step="0.1"
          value={voiceSettings.speed}
          onChange={(e) => updateVoice({ speed: parseFloat(e.target.value) })}
          className="w-full accent-ios-blue"
        />
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>0.5x 慢</span><span>1.0x 正常</span><span>2.0x 快</span>
        </div>
      </div>

      {/* Pitch slider */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          音调: {voiceSettings.pitch.toFixed(1)}
        </label>
        <input
          type="range" min="0.5" max="2" step="0.1"
          value={voiceSettings.pitch}
          onChange={(e) => updateVoice({ pitch: parseFloat(e.target.value) })}
          className="w-full accent-ios-blue"
        />
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>0.5 低</span><span>1.0 正常</span><span>2.0 高</span>
        </div>
      </div>

      {/* Volume slider */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          音量: {((voiceSettings.volume || 1) * 100).toFixed(0)}%
        </label>
        <input
          type="range" min="0" max="1" step="0.05"
          value={voiceSettings.volume || 1}
          onChange={(e) => updateVoice({ volume: parseFloat(e.target.value) })}
          className="w-full accent-ios-blue"
        />
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>0%</span><span>50%</span><span>100%</span>
        </div>
      </div>

      {/* Preview button */}
      {speechSupported && (
        <button
          onClick={handlePreview}
          disabled={isPreviewing || voices.length === 0}
          className="w-full ios-button-secondary flex items-center justify-center gap-2 text-sm py-2.5 disabled:opacity-50"
        >
          {isPreviewing ? (
            <>
              <div className="w-4 h-4 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
              试听中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.8l4.7-3.5a.5.5 0 01.8.4v12.6a.5.5 0 01-.8.4L6.5 15.2H4a1 1 0 01-1-1v-4.4a1 1 0 011-1h2.5z" />
              </svg>
              试听语音
            </>
          )}
        </button>
      )}

      {/* Voice cloning */}
      {!compact && (
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">声音克隆</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              上传音频或视频文件，系统将分析音频特征并匹配最佳语音。视频将自动提取音频。
              {provider !== 'web-speech' && hasCloudConfig && ' 已配置云端密钥，将使用云服务商声音复刻。'}
            </p>

            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,video/*,.mp3,.wav,.aac,.ogg,.flac,.m4a,.opus,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv"
              onChange={handleMediaFileSelect}
              className="hidden"
            />
            <audio ref={previewAudioRef} onEnded={handlePreviewEnded} className="hidden" />

            {/* idle */}
            {extractState === 'idle' && (
              <div>
                <button
                  onClick={() => audioInputRef.current?.click()}
                  className="w-full py-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl
                             hover:border-purple-400 dark:hover:border-purple-500 transition-colors
                             flex flex-col items-center justify-center gap-2"
                >
                  <svg className="w-10 h-10 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-gray-400">上传音频或视频文件</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    音频: MP3 / WAV / AAC / OGG / FLAC  |  视频: MP4 / AVI / MOV / MKV / WebM
                  </p>
                </button>
                {voiceSettings.clonedVoiceId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    已克隆: {voiceSettings.clonedVoiceName || voiceSettings.clonedVoiceId}
                    {voiceSettings.clonedProvider && (
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400">
                        {voiceSettings.clonedProvider}
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* extracting */}
            {extractState === 'extracting' && (
              <div className="p-4 bg-white dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{extractStage}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{extractProgress}%</p>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${extractProgress}%` }} />
                </div>
              </div>
            )}

            {/* preview */}
            {extractState === 'preview' && extractedAudio && (
              <div className="p-4 bg-white dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{extractedAudio.fileName}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {extractedAudio.format.toUpperCase()} · {formatDuration(extractedAudio.duration)}
                      {extractedAudio.sourceType === 'video' && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">从视频提取</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handlePreviewToggle}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                >
                  {isPreviewPlaying ? (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      停止试听
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      试听提取的音频
                    </>
                  )}
                </button>
                <div className="flex gap-2">
                  <button onClick={handleResetExtract} className="flex-1 py-2 px-3 rounded-xl bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors">
                    重新选择
                  </button>
                  <button onClick={handleConfirmClone} className="flex-1 py-2 px-3 rounded-xl bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {hasCloudConfig ? `克隆 (${provider})` : '模拟克隆'}
                  </button>
                </div>
              </div>
            )}

            {/* cloning */}
            {extractState === 'cloning' && (
              <div className="p-4 bg-white dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {hasCloudConfig ? '正在提交声音复刻任务...' : '正在分析音频并匹配语音...'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">这可能需要几秒钟</p>
                  </div>
                </div>
              </div>
            )}

            {/* error */}
            {extractState === 'error' && extractError && (
              <div className="p-4 bg-red-50 dark:bg-red-900/30 rounded-xl space-y-3">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{extractError}</p>
                </div>
                <button onClick={handleResetExtract} className="w-full py-2 rounded-xl bg-red-100 dark:bg-red-800/50 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
                  重新选择文件
                </button>
              </div>
            )}
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              {hasCloudConfig
                ? `已配置云端语音，将使用 ${provider === 'aliyun' ? '阿里云' : provider === 'tencent' ? '腾讯云' : '讯飞'} 声音复刻服务。`
                : `未配置云端密钥，使用模拟克隆：分析音频特征 → 匹配浏览器内置语音 → 自动调节参数。前往设置页面配置云端密钥以启用真实声音复刻。`
              }
            </p>
          </div>
        </div>
      )}
    </div>
  )
}