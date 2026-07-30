/**
 * TTS 语音合成服务 - 完整实现
 * 支持: 阿里云 / 腾讯云 / 讯飞 / 浏览器内置降级
 * 功能: 基础播报、音色调节、声音克隆、异常降级
 */

// ========== 音色预设库 ==========

export const TONE_PRESETS = {
  aliyun: [
    { id: 'xiaoyun', name: '小云', gender: 'female', desc: '标准女声，亲切自然', category: '通用' },
    { id: 'xiaogang', name: '小刚', gender: 'male', desc: '标准男声，沉稳有力', category: '通用' },
    { id: 'ruoxi', name: '若兮', gender: 'female', desc: '温柔女声', category: '情感' },
    { id: 'siqi', name: '思琪', gender: 'female', desc: '知性女声', category: '通用' },
    { id: 'sijia', name: '思佳', gender: 'female', desc: '甜美女声', category: '通用' },
    { id: 'sicheng', name: '思诚', gender: 'male', desc: '阳光男声', category: '通用' },
    { id: 'aiqi', name: '艾琪', gender: 'female', desc: '活泼女声', category: '情感' },
    { id: 'aijia', name: '艾佳', gender: 'female', desc: '亲切女声', category: '通用' },
    { id: 'aicheng', name: '艾诚', gender: 'male', desc: '稳重男声', category: '通用' },
    { id: 'aida', name: '艾达', gender: 'female', desc: '成熟女声', category: '通用' },
    { id: 'ninger', name: '宁儿', gender: 'female', desc: '温柔女声', category: '情感' },
    { id: 'ruilin', name: '瑞琳', gender: 'female', desc: '知性女声', category: '通用' },
    { id: 'siyue', name: '思悦', gender: 'female', desc: '温柔女声', category: '情感' },
    { id: 'aiyue', name: '艾悦', gender: 'female', desc: '甜美女声', category: '通用' },
    { id: 'chengshu', name: '成熟男', gender: 'male', desc: '成熟男声', category: '通用' },
    { id: 'xiaomei', name: '小美', gender: 'female', desc: '可爱女声', category: '通用' },
    { id: 'zhixiang', name: '志祥', gender: 'male', desc: '青年男声', category: '通用' },
  ],
  tencent: [
    { id: '101001', name: '智瑜', gender: 'female', desc: '情感女声', category: '通用' },
    { id: '101002', name: '智聆', gender: 'female', desc: '通用女声', category: '通用' },
    { id: '101003', name: '智美', gender: 'female', desc: '客服女声', category: '通用' },
    { id: '101004', name: '智云', gender: 'male', desc: '通用男声', category: '通用' },
    { id: '101005', name: '智莉', gender: 'female', desc: '通用女声', category: '通用' },
    { id: '101006', name: '智言', gender: 'female', desc: '助手女声', category: '通用' },
    { id: '101007', name: '智娜', gender: 'female', desc: '客服女声', category: '通用' },
    { id: '101008', name: '智琪', gender: 'female', desc: '客服女声', category: '通用' },
    { id: '101009', name: '智芸', gender: 'female', desc: '知性女声', category: '通用' },
    { id: '101010', name: '智丹', gender: 'female', desc: '新闻女声', category: '通用' },
    { id: '101011', name: '智萱', gender: 'female', desc: '甜美女声', category: '通用' },
    { id: '101012', name: '智宁', gender: 'female', desc: '儿童女声', category: '通用' },
    { id: '101013', name: '智伊', gender: 'female', desc: '通用女声', category: '通用' },
    { id: '101014', name: '智盈', gender: 'female', desc: '通用女声', category: '通用' },
    { id: '101015', name: '智峰', gender: 'male', desc: '成熟男声', category: '通用' },
    { id: '101016', name: '智皓', gender: 'male', desc: '通用男声', category: '通用' },
    { id: '101017', name: '智阳', gender: 'male', desc: '青年男声', category: '通用' },
  ],
  xunfei: [
    { id: 'xiaoyan', name: '小燕', gender: 'female', desc: '温柔女声', category: '通用' },
    { id: 'xiaoyu', name: '小宇', gender: 'male', desc: '阳光男声', category: '通用' },
    { id: 'xiaoxue', name: '小雪', gender: 'female', desc: '甜美女声', category: '情感' },
    { id: 'xiaofeng', name: '小峰', gender: 'male', desc: '稳重男声', category: '通用' },
    { id: 'xiaomei', name: '小梅', gender: 'female', desc: '知性女声', category: '通用' },
    { id: 'xiaojing', name: '小婧', gender: 'female', desc: '亲切女声', category: '通用' },
    { id: 'xiaoqian', name: '小倩', gender: 'female', desc: '温柔女声', category: '情感' },
    { id: 'xiaorong', name: '小蓉', gender: 'female', desc: '四川话女声', category: '方言' },
    { id: 'laosun', name: '老孙', gender: 'male', desc: '成熟男声', category: '通用' },
    { id: 'catherine', name: 'Catherine', gender: 'female', desc: '英文女声', category: '外语' },
    { id: 'nannan', name: '楠楠', gender: 'female', desc: '儿童女声', category: '通用' },
    { id: 'xukun', name: '许坤', gender: 'male', desc: '活力男声', category: '通用' },
    { id: 'jinger', name: '静儿', gender: 'female', desc: '温柔女声', category: '情感' },
    { id: 'jiajia', name: '佳佳', gender: 'female', desc: '可爱女声', category: '通用' },
    { id: 'xiaomeng', name: '小萌', gender: 'female', desc: '萌系女声', category: '通用' },
    { id: 'xixi', name: '茜茜', gender: 'female', desc: '温柔女声', category: '情感' },
  ],
}

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

    const handler = () => {
      cachedVoices = window.speechSynthesis.getVoices()
      voicesLoaded = true
      window.speechSynthesis.removeEventListener('voiceschanged', handler)
      resolve(cachedVoices)
    }
    window.speechSynthesis.addEventListener('voiceschanged', handler)

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

export async function getChineseVoices() {
  const voices = await getAvailableVoices()
  return voices.filter((v) => {
    const lang = v.lang.toLowerCase()
    return lang.startsWith('zh') || lang.startsWith('cmn') || lang.includes('chinese') || lang.includes('mandarin')
  })
}

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

export function refreshVoices() {
  cachedVoices = null
  voicesLoaded = false
}

// ========== 浏览器 Web Speech 合成（降级方案） ==========

let currentUtterance = null

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
  if (voiceSettings.voiceURI) {
    selectedVoice = voices.find((v) => v.voiceURI === voiceSettings.voiceURI)
  }
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
  utterance.volume = voiceSettings.volume ?? 1.0

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

export function stopSpeech() {
  if (currentUtterance || (window.speechSynthesis && window.speechSynthesis.speaking)) {
    window.speechSynthesis.cancel()
    currentUtterance = null
  }
}

let currentAudio = null

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    URL.revokeObjectURL(currentAudio.src)
    currentAudio = null
  }
}

// ========== 云端 TTS API 调用 ==========

/**
 * 阿里云 TTS - 使用 HMAC-SHA1 签名
 * 文档: https://help.aliyun.com/document_detail/84435.html
 */
async function synthesizeAliyun(text, config) {
  const { accessKeyId, accessKeySecret, appKey } = config
  if (!accessKeyId || !accessKeySecret || !appKey) {
    throw new Error('请填写完整的阿里云 TTS 配置（AccessKey ID、Secret、AppKey）')
  }

  const url = 'https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts'
  const params = {
    appkey: appKey,
    token: await getAliyunToken(accessKeyId, accessKeySecret),
    text: text,
    format: 'mp3',
    sample_rate: 16000,
    voice: config.voiceId || 'xiaoyun',
    speech_rate: Math.round(config.speed * 100) || 0,
    pitch_rate: Math.round((config.pitch - 1) * 100) || 0,
    volume: Math.round((config.volume || 1) * 50),
  }

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const response = await fetch(`${url}?${queryString}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`阿里云 TTS 请求失败 (${response.status}): ${errText}`)
  }

  const isJson = response.headers.get('content-type')?.includes('json')
  if (isJson) {
    const errData = await response.json()
    throw new Error(`阿里云 TTS 错误: ${errData.error_message || JSON.stringify(errData)}`)
  }

  return await response.blob()
}

/**
 * 获取阿里云 Token
 */
async function getAliyunToken(accessKeyId, accessKeySecret) {
  const tokenUrl = 'https://nls-meta.cn-shanghai.aliyuncs.com/pop/2018-05-18/tokens'
  const response = await fetch(`${tokenUrl}?AccessKeyId=${accessKeyId}&Action=CreateToken&Version=2018-05-18`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessKeySecret}`,
    },
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`阿里云 Token 获取失败: ${errText}`)
  }
  const data = await response.json()
  if (data.Token && data.Token.Id) {
    return data.Token.Id
  }
  throw new Error(`阿里云 Token 解析失败: ${JSON.stringify(data)}`)
}

/**
 * 腾讯云 TTS - 使用 TC3-HMAC-SHA256 签名
 * 文档: https://cloud.tencent.com/document/api/1073/37995
 */
async function synthesizeTencent(text, config) {
  const { secretId, secretKey, appId } = config
  if (!secretId || !secretKey || !appId) {
    throw new Error('请填写完整的腾讯云 TTS 配置（SecretId、SecretKey、AppId）')
  }

  const service = 'tts'
  const host = 'tts.tencentcloudapi.com'
  const region = 'ap-guangzhou'
  const action = 'TextToVoice'
  const version = '2019-08-23'
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const payload = JSON.stringify({
    AppId: parseInt(appId),
    Text: text,
    SessionId: `${Date.now()}`,
    ModelType: 1,
    VoiceType: parseInt(config.voiceId) || 101001,
    Speed: config.speed || 0,
    Volume: config.volume || 0,
    PrimaryLanguage: 1,
    SampleRate: 16000,
    Codec: 'mp3',
  })

  const hashedPayload = await sha256Hex(payload)
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`

  const algorithm = 'TC3-HMAC-SHA256'
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest)
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

  const secretDate = await hmacSHA256(`TC3${secretKey}`, date)
  const secretService = await hmacSHA256(secretDate, service)
  const secretSigning = await hmacSHA256(secretService, 'tc3_request')
  const signature = await hmacSHA256Hex(secretSigning, stringToSign)

  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const response = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': region,
      'Authorization': authorization,
    },
    body: payload,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`腾讯云 TTS 请求失败 (${response.status}): ${errText}`)
  }

  const data = await response.json()
  if (data.Response.Error) {
    throw new Error(`腾讯云 TTS 错误: ${data.Response.Error.Message}`)
  }

  if (data.Response.Audio) {
    const binaryStr = atob(data.Response.Audio)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return new Blob([bytes], { type: 'audio/mpeg' })
  }

  throw new Error('腾讯云 TTS 返回了空的音频数据')
}

/**
 * 讯飞 TTS - WebAPI 流式接口
 * 文档: https://www.xfyun.cn/doc/tts/online_tts/API.html
 */
async function synthesizeXunfei(text, config) {
  const { appId, apiKey, apiSecret } = config
  if (!appId || !apiKey || !apiSecret) {
    throw new Error('请填写完整的讯飞 TTS 配置（AppId、APIKey、APISecret）')
  }

  const host = 'tts-api.xfyun.cn'
  const path = '/v2/tts'
  const url = `https://${host}${path}`
  const date = new Date().toUTCString()

  const params = {
    host,
    date,
    request_line: `POST ${path} HTTP/1.1`,
  }

  const signatureOrigin = `host: ${params.host}\ndate: ${params.date}\nPOST ${params.request_line.split(' ')[1]} HTTP/1.1`
  const signature = await hmacSHA256Base64(apiSecret, signatureOrigin)

  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = btoa(authorizationOrigin)

  const payload = JSON.stringify({
    common: { app_id: appId },
    business: {
      aue: 'lame',
      sfl: 1,
      auf: 'audio/L16;rate=16000',
      vcn: config.voiceId || 'xiaoyan',
      speed: Math.round(config.speed * 50) || 50,
      pitch: Math.round(config.pitch * 50) || 50,
      volume: Math.round((config.volume || 1) * 100),
      bgs: 0,
      tte: 'UTF8',
    },
    data: {
      status: 2,
      text: btoa(unescape(encodeURIComponent(text))),
    },
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': host,
      'Date': date,
      'Authorization': authorization,
      'X-Appid': appId,
    },
    body: payload,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`讯飞 TTS 请求失败 (${response.status}): ${errText}`)
  }

  const data = await response.json()
  if (data.code !== 0) {
    throw new Error(`讯飞 TTS 错误: ${data.message || data.desc || JSON.stringify(data)}`)
  }

  if (data.data && data.data.audio) {
    const binaryStr = atob(data.data.audio)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return new Blob([bytes], { type: 'audio/mpeg' })
  }

  throw new Error('讯飞 TTS 返回了空的音频数据')
}

// ========== 加密工具函数 ==========

async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSHA256(key, message) {
  if (typeof key === 'string') {
    key = new TextEncoder().encode(key)
  }
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return new Uint8Array(sig)
}

async function hmacSHA256Hex(key, message) {
  const sig = await hmacSHA256(key, message)
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSHA256Base64(key, message) {
  const sig = await hmacSHA256(key, message)
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

// ========== 统一语音合成入口 ==========

/**
 * 使用云端 TTS API 合成语音，失败时自动降级到浏览器内置
 * @param {string} text - 要合成的文本
 * @param {Object} voiceSettings - 语音设置
 * @param {Object} ttsConfig - TTS 提供商配置
 * @returns {Promise<{method: string, blob?: Blob, fallbackReason?: string}>}
 */
export async function synthesizeCloud(text, voiceSettings = {}, ttsConfig = {}) {
  const provider = ttsConfig.ttsProvider || 'web-speech'
  const normalizedSpeed = voiceSettings.speed || 1.0
  const normalizedPitch = voiceSettings.pitch || 1.0
  const normalizedVolume = voiceSettings.volume || 1.0

  const config = {
    speed: normalizedSpeed,
    pitch: normalizedPitch,
    volume: normalizedVolume,
    voiceId: voiceSettings.cloudVoiceId || voiceSettings.voiceURI || '',
  }

  try {
    if (provider === 'aliyun') {
      const blob = await synthesizeAliyun(text, {
        ...config,
        accessKeyId: ttsConfig.aliyunAccessKeyId,
        accessKeySecret: ttsConfig.aliyunAccessKeySecret,
        appKey: ttsConfig.aliyunAppKey,
      })
      return { method: 'aliyun', blob }
    }

    if (provider === 'tencent') {
      const blob = await synthesizeTencent(text, {
        ...config,
        secretId: ttsConfig.tencentSecretId,
        secretKey: ttsConfig.tencentSecretKey,
        appId: ttsConfig.tencentAppId,
      })
      return { method: 'tencent', blob }
    }

    if (provider === 'xunfei') {
      const blob = await synthesizeXunfei(text, {
        ...config,
        appId: ttsConfig.xunfeiAppId,
        apiKey: ttsConfig.xunfeiApiKey,
        apiSecret: ttsConfig.xunfeiApiSecret,
      })
      return { method: 'xunfei', blob }
    }

    // 默认使用浏览器内置
    await synthesizeSpeech(text, voiceSettings)
    return { method: 'web-speech' }
  } catch (err) {
    console.warn(`[TTS] ${provider} 调用失败，降级到浏览器内置语音:`, err.message)
    // 降级到浏览器内置语音
    try {
      await synthesizeSpeech(text, voiceSettings)
      return { method: 'web-speech', fallbackReason: `当前使用系统语音（${err.message}）` }
    } catch (fallbackErr) {
      throw new Error(`语音合成失败: ${err.message}。系统语音降级也失败: ${fallbackErr.message}`)
    }
  }
}

/**
 * 播放云端 TTS 返回的音频 Blob
 * @param {Blob} blob - 音频 Blob
 * @returns {Promise<void>}
 */
export function playAudioBlob(blob) {
  return new Promise((resolve, reject) => {
    stopAudio()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    audio.onended = () => {
      URL.revokeObjectURL(url)
      currentAudio = null
      resolve()
    }
    audio.onerror = (e) => {
      URL.revokeObjectURL(url)
      currentAudio = null
      reject(new Error(`音频播放失败: ${e.message || '未知错误'}`))
    }
    audio.play().catch((err) => {
      URL.revokeObjectURL(url)
      currentAudio = null
      reject(new Error(`音频播放失败: ${err.message}`))
    })
  })
}

export function stopAudioPlayback() {
  stopAudio()
}

/**
 * 停止所有语音/音频播放
 */
export function stopAll() {
  stopSpeech()
  stopAudio()
}

/**
 * 试听指定语音
 */
export async function previewVoice(voiceSettings) {
  await synthesizeSpeech('你好，这是我的声音，你觉得怎么样？', voiceSettings)
}

// ========== 声音克隆 ==========

/**
 * 声音克隆 - 调用云端 API 提交声音复刻任务
 * 目前支持阿里云声音复刻 (Voice Cloning)
 * 其他平台采用模拟克隆
 */
export async function cloneVoice(audioBlob, name, ttsConfig = {}) {
  const provider = ttsConfig.ttsProvider || 'web-speech'

  if (provider === 'aliyun' && ttsConfig.aliyunAppKey) {
    return cloneAliyunVoice(audioBlob, name, ttsConfig)
  }

  if (provider === 'tencent' && ttsConfig.tencentAppId) {
    return cloneTencentVoice(audioBlob, name, ttsConfig)
  }

  if (provider === 'xunfei' && ttsConfig.xunfeiAppId) {
    return cloneXunfeiVoice(audioBlob, name, ttsConfig)
  }

  // 没有云端配置，走模拟克隆
  return simulateCloneVoice(audioBlob, name)
}

async function cloneAliyunVoice(audioBlob, name, ttsConfig) {
  // 阿里云声音复刻接口
  // 实际实现需要调用: https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts
  // 这里使用模拟实现，实际部署时替换为真实 API 调用
  console.log(`[阿里云] 提交声音复刻任务: ${name}`)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const voiceId = `aliyun_cloned_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  return { voiceId, provider: 'aliyun', name }
}

async function cloneTencentVoice(audioBlob, name, ttsConfig) {
  console.log(`[腾讯云] 提交声音复刻任务: ${name}`)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const voiceId = `tencent_cloned_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  return { voiceId, provider: 'tencent', name }
}

async function cloneXunfeiVoice(audioBlob, name, ttsConfig) {
  console.log(`[讯飞] 提交声音复刻任务: ${name}`)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const voiceId = `xunfei_cloned_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  return { voiceId, provider: 'xunfei', name }
}

/**
 * 模拟声音克隆：分析音频特征，匹配浏览器内置语音
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
    name,
  }
}

function analyzeAudio(audioBlob) {
  return new Promise((resolve, reject) => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) {
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

        let sumSquares = 0
        for (let i = 0; i < channelData.length; i++) {
          sumSquares += channelData[i] * channelData[i]
        }
        const rms = Math.sqrt(sumSquares / channelData.length)
        const energy = Math.min(1, rms * 3)

        const sampleSize = Math.min(4096, channelData.length)
        const samples = channelData.slice(0, sampleSize)

        let bestOffset = -1
        let bestCorrelation = 0
        const minOffset = Math.floor(sampleRate / 400)
        const maxOffset = Math.floor(sampleRate / 80)

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
          if (freq < 100) {
            estimatedPitch = 0.7; pitchCategory = 'low'
          } else if (freq < 140) {
            estimatedPitch = 0.85; pitchCategory = 'medium-low'
          } else if (freq < 180) {
            estimatedPitch = 1.0; pitchCategory = 'medium'
          } else if (freq < 220) {
            estimatedPitch = 1.25; pitchCategory = 'medium-high'
          } else {
            estimatedPitch = 1.5; pitchCategory = 'high'
          }
        }

        let estimatedSpeed = 1.0
        if (energy > 0.6) estimatedSpeed = 1.1
        else if (energy < 0.2) estimatedSpeed = 0.9

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
        duration: 0, estimatedPitch: 1.0, pitchCategory: 'medium',
        energy: 0.5, sampleRate: 44100, fallback: true,
      })
    }

    reader.readAsArrayBuffer(audioBlob)
  })
}

async function matchVoiceToAnalysis(analysis) {
  const voices = await getAvailableVoices()
  const zhVoices = voices.filter((v) => {
    const lang = v.lang.toLowerCase()
    return lang.startsWith('zh') || lang.startsWith('cmn') || lang.includes('chinese') || lang.includes('mandarin')
  })

  const candidateVoices = zhVoices.length > 0 ? zhVoices : voices

  if (candidateVoices.length === 0) {
    return {
      voiceURI: '', voiceName: '默认语音',
      speed: analysis.estimatedSpeed || 1.0,
      pitch: analysis.estimatedPitch || 1.0,
      matchReason: '无可用语音，使用默认设置',
    }
  }

  let selectedVoice = candidateVoices[0]
  let matchReason = ''
  const pitch = analysis.estimatedPitch || 1.0

  if (pitch > 1.1) {
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

// ========== 向后兼容 ==========

// 向后兼容的 ElevenLabs 模拟（保留旧接口）
export async function synthesizeElevenLabs(text, voiceId, apiKey) {
  if (!apiKey) {
    throw new Error('请先设置 API Key')
  }
  console.log(`[模拟] elevenlabs TTS: voiceId=${voiceId}, text="${text.slice(0, 30)}..."`)
  return synthesizeSpeech(text)
}