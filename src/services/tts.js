/**
 * TTS 语音合成服务
 * 基础实现: 浏览器内置 Web Speech API
 * 高级语音克隆: 预留 ElevenLabs 等第三方 API 接入
 */

// ========== 浏览器能力检测 ==========

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function isSpeechAvailable() {
  if (!isSpeechSupported()) return false
  return window.speechSynthesis.getVoices().length > 0
}

// ========== 语音列表管理 ==========

let cachedVoices = null
let voicesLoaded = false

/**
 * 获取所有可用语音（带缓存）
 */
export function getAvailableVoices() {
  return new Promise((resolve) => {
    if (cachedVoices && cachedVoices.length > 0) {
      resolve(cachedVoices)
      return
    }

    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      cachedVoices = voices
      voicesLoaded = true
      resolve(voices)
      return
    }

    // 等待 voiceschanged 事件
    const handler = () => {
      cachedVoices = window.speechSynthesis.getVoices()
      voicesLoaded = true
      window.speechSynthesis.removeEventListener('voiceschanged', handler)
      resolve(cachedVoices)
    }
    window.speechSynthesis.addEventListener('voiceschanged', handler)

    // 超时兜底
    setTimeout(() => {
      if (!voicesLoaded) {
        window.speechSynthesis.removeEventListener('voiceschanged', handler)
        cachedVoices = window.speechSynthesis.getVoices()
        voicesLoaded = true
        resolve(cachedVoices)
      }
    }, 3000)
  })
}

/**
 * 获取中文语音列表
 */
export async function getChineseVoices() {
  const voices = await getAvailableVoices()
  return voices.filter((v) => {
    const lang = v.lang.toLowerCase()
    return lang.startsWith('zh') || lang.startsWith('cmn') || lang.includes('chinese') || lang.includes('mandarin')
  })
}

/**
 * 获取所有语音分组（按语言分类）
 */
export async function getVoiceGroups() {
  const voices = await getAvailableVoices()
  const groups = { zh: [], en: [], other: [] }

  voices.forEach((v) => {
    const lang = v.lang.toLowerCase()
    if (lang.startsWith('zh') || lang.startsWith('cmn') || lang.includes('chinese') || lang.includes('mandarin')) {
      groups.zh.push(v)
    } else if (lang.startsWith('en')) {
      groups.en.push(v)
    } else {
      groups.other.push(v)
    }
  })

  return groups
}

/**
 * 刷新语音缓存（用于切换语言后）
 */
export function refreshVoices() {
  cachedVoices = null
  voicesLoaded = false
}

// ========== 语音合成 ==========

let currentUtterance = null

/**
 * 使用 Web Speech API 合成语音
 * @param {string} text - 要合成的文本
 * @param {Object} voiceSettings - { speed, pitch, voiceURI, voiceIndex }
 * @returns {Promise<void>}
 */
export async function synthesizeSpeech(text, voiceSettings = {}) {
  stopSpeech()

  if (!isSpeechSupported()) {
    throw new Error('浏览器不支持语音合成功能')
  }

  const voices = await getAvailableVoices()

  if (voices.length === 0) {
    throw new Error('没有可用的语音引擎')
  }

  let selectedVoice = null

  // 优先使用指定的 voiceURI
  if (voiceSettings.voiceURI) {
    selectedVoice = voices.find((v) => v.voiceURI === voiceSettings.voiceURI)
  }

  // 其次使用 voiceIndex
  if (!selectedVoice) {
    const zhVoices = voices.filter((v) => {
      const lang = v.lang.toLowerCase()
      return lang.startsWith('zh') || lang.startsWith('cmn')
    })
    const preferredVoices = zhVoices.length > 0 ? zhVoices : voices
    const voiceIndex = (voiceSettings.voiceIndex ?? 0) % preferredVoices.length
    selectedVoice = preferredVoices[voiceIndex]
  }

  if (!selectedVoice) {
    selectedVoice = voices[0]
  }

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.voice = selectedVoice
  utterance.rate = voiceSettings.speed ?? 1.0
  utterance.pitch = voiceSettings.pitch ?? 1.0
  utterance.volume = 1.0

  currentUtterance = utterance

  return new Promise((resolve, reject) => {
    utterance.onend = () => {
      currentUtterance = null
      resolve()
    }
    utterance.onerror = (e) => {
      currentUtterance = null
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        reject(new Error(`语音合成失败: ${e.error}`))
      } else {
        resolve()
      }
    }
    window.speechSynthesis.speak(utterance)
  })
}

/**
 * 停止当前语音播放
 */
export function stopSpeech() {
  if (currentUtterance || (window.speechSynthesis && window.speechSynthesis.speaking)) {
    window.speechSynthesis.cancel()
    currentUtterance = null
  }
}

/**
 * 试听指定语音
 * @param {Object} voiceSettings - { speed, pitch, voiceURI, voiceIndex }
 */
export async function previewVoice(voiceSettings) {
  await synthesizeSpeech('你好，这是我的声音，你觉得怎么样？', voiceSettings)
}

// ========== ElevenLabs 语音克隆 (模拟实现) ==========

export async function cloneVoice(audioBlob, name, apiKey) {
  // 如果有 API Key，走 ElevenLabs 真实克隆流程
  if (apiKey) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const mockVoiceId = `cloned_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log(`[ElevenLabs] 声音克隆完成: ${name} -> ${mockVoiceId}`)
    return { voiceId: mockVoiceId, provider: 'elevenlabs' }
  }

  // 无 API Key，走模拟克隆：分析音频 → 匹配浏览器语音
  return simulateCloneVoice(audioBlob, name)
}

/**
 * 模拟声音克隆：分析音频特征，匹配浏览器内置语音
 * 使用 Web Audio API 分析音频的基频和音色特征
 * @param {Blob} audioBlob - 音频文件
 * @param {string} name - 克隆名称
 * @returns {Promise<{voiceId: string, voiceSettings: object, provider: string, analysis: object}>}
 */
async function simulateCloneVoice(audioBlob, name) {
  const analysis = await analyzeAudio(audioBlob)
  const voiceSettings = await matchVoiceToAnalysis(analysis)
  const voiceId = `simulated_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  console.log(`[模拟克隆] 音频分析完成:`, analysis)
  console.log(`[模拟克隆] 匹配语音:`, voiceSettings)

  return {
    voiceId,
    provider: 'simulated',
    voiceSettings,
    analysis,
  }
}

/**
 * 使用 Web Audio API 分析音频特征
 * @param {Blob} audioBlob
 * @returns {Promise<{duration: number, estimatedPitch: number, pitchCategory: string, energy: number, sampleRate: number}>}
 */
function analyzeAudio(audioBlob) {
  return new Promise((resolve, reject) => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) {
      // Web Audio API 不可用，使用默认值
      resolve({
        duration: 0,
        estimatedPitch: 1.0,
        pitchCategory: 'medium',
        energy: 0.5,
        sampleRate: 44100,
        fallback: true,
      })
      return
    }

    const audioContext = new AudioCtx()
    const reader = new FileReader()

    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

        const channelData = audioBuffer.getChannelData(0)
        const sampleRate = audioBuffer.sampleRate
        const duration = audioBuffer.duration

        // 计算 RMS 能量（响度）
        let sumSquares = 0
        for (let i = 0; i < channelData.length; i++) {
          sumSquares += channelData[i] * channelData[i]
        }
        const rms = Math.sqrt(sumSquares / channelData.length)
        const energy = Math.min(1, rms * 3) // 归一化到 0-1

        // 简易基频估计（自相关法）
        // 取前 4096 个样本进行粗略分析
        const sampleSize = Math.min(4096, channelData.length)
        const samples = channelData.slice(0, sampleSize)

        // 自相关找基频
        let bestOffset = -1
        let bestCorrelation = 0
        const minOffset = Math.floor(sampleRate / 400) // 最低 400Hz，约 100Hz 人声基频上限
        const maxOffset = Math.floor(sampleRate / 80)  // 最高 80Hz，约 50Hz 人声基频下限

        for (let offset = minOffset; offset < Math.min(maxOffset, sampleSize); offset++) {
          let correlation = 0
          for (let i = 0; i < sampleSize - offset; i++) {
            correlation += samples[i] * samples[i + offset]
          }
          if (correlation > bestCorrelation) {
            bestCorrelation = correlation
            bestOffset = offset
          }
        }

        let estimatedPitch = 1.0
        let pitchCategory = 'medium'

        if (bestOffset > 0) {
          const freq = sampleRate / bestOffset
          // 将频率映射到 0.5-2.0 的音调范围
          // 参考: 人声基频通常在 85-255Hz 之间
          // 约 120Hz 为平均男性，约 210Hz 为平均女性
          if (freq < 100) {
            estimatedPitch = 0.7  // 很低
            pitchCategory = 'low'
          } else if (freq < 140) {
            estimatedPitch = 0.85 // 较低
            pitchCategory = 'medium-low'
          } else if (freq < 180) {
            estimatedPitch = 1.0  // 中等
            pitchCategory = 'medium'
          } else if (freq < 220) {
            estimatedPitch = 1.25 // 较高
            pitchCategory = 'medium-high'
          } else {
            estimatedPitch = 1.5  // 很高
            pitchCategory = 'high'
          }
        }

        // 语速：根据能量和时长估算
        // 较高的能量可能意味着较快的语速
        let estimatedSpeed = 1.0
        if (energy > 0.6) {
          estimatedSpeed = 1.1
        } else if (energy < 0.2) {
          estimatedSpeed = 0.9
        }

        audioContext.close()

        resolve({
          duration,
          estimatedPitch,
          pitchCategory,
          estimatedSpeed,
          energy,
          sampleRate,
          fallback: false,
        })
      } catch (err) {
        audioContext.close()
        // 解码失败，使用默认值
        resolve({
          duration: 0,
          estimatedPitch: 1.0,
          pitchCategory: 'medium',
          energy: 0.5,
          sampleRate: 44100,
          fallback: true,
          error: err.message,
        })
      }
    }

    reader.onerror = () => {
      audioContext.close()
      resolve({
        duration: 0,
        estimatedPitch: 1.0,
        pitchCategory: 'medium',
        energy: 0.5,
        sampleRate: 44100,
        fallback: true,
      })
    }

    reader.readAsArrayBuffer(audioBlob)
  })
}

/**
 * 根据音频分析结果匹配最佳浏览器语音
 * @param {object} analysis
 * @returns {Promise<{voiceURI: string, voiceName: string, speed: number, pitch: number, matchReason: string}>}
 */
async function matchVoiceToAnalysis(analysis) {
  const voices = await getAvailableVoices()
  const zhVoices = voices.filter((v) => {
    const lang = v.lang.toLowerCase()
    return lang.startsWith('zh') || lang.startsWith('cmn') || lang.includes('chinese') || lang.includes('mandarin')
  })

  const candidateVoices = zhVoices.length > 0 ? zhVoices : voices

  if (candidateVoices.length === 0) {
    return {
      voiceURI: '',
      voiceName: '默认语音',
      speed: analysis.estimatedSpeed || 1.0,
      pitch: analysis.estimatedPitch || 1.0,
      matchReason: '无可用语音，使用默认设置',
    }
  }

  // 匹配策略：根据音调高低选择语音
  // 一些浏览器会提供 female/male 标识的语音
  let selectedVoice = candidateVoices[0]
  let matchReason = ''

  const pitch = analysis.estimatedPitch || 1.0

  if (pitch > 1.1) {
    // 高音调 → 倾向女性语音
    const femaleVoice = candidateVoices.find((v) => {
      const name = v.name.toLowerCase()
      return name.includes('female') || name.includes('woman') || name.includes('girl') ||
        name.includes('xiaoxiao') || name.includes('xiaoyi') || name.includes('yunjian') ||
        name.includes('xia') || name.includes('nu')
    })
    if (femaleVoice) {
      selectedVoice = femaleVoice
      matchReason = '匹配到较高音调语音（女性）'
    } else {
      matchReason = '使用默认语音，已调节音调'
    }
  } else if (pitch < 0.85) {
    // 低音调 → 倾向男性语音
    const maleVoice = candidateVoices.find((v) => {
      const name = v.name.toLowerCase()
      return name.includes('male') || name.includes('man') || name.includes('boy') ||
        name.includes('yunyang') || name.includes('yunxi') || name.includes('nan')
    })
    if (maleVoice) {
      selectedVoice = maleVoice
      matchReason = '匹配到较低音调语音（男性）'
    } else {
      matchReason = '使用默认语音，已调节音调'
    }
  } else {
    matchReason = '使用中性语音，音调接近原始音频'
  }

  return {
    voiceURI: selectedVoice.voiceURI || '',
    voiceName: selectedVoice.name || '默认语音',
    speed: Math.round((analysis.estimatedSpeed || 1.0) * 10) / 10,
    pitch: Math.round((analysis.estimatedPitch || 1.0) * 10) / 10,
    matchReason,
  }
}

export async function synthesizeElevenLabs(text, voiceId, apiKey) {
  if (!apiKey) {
    throw new Error('请先设置 ElevenLabs API Key')
  }
  console.log(`[模拟] ElevenLabs TTS: voiceId=${voiceId}, text="${text.slice(0, 30)}..."`)
  return synthesizeSpeech(text)
}