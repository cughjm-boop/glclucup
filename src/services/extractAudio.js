/**
 * 音频提取服务
 * - 音频文件直接透传
 * - 视频文件使用 FFmpeg.wasm 在浏览器端提取音频
 */

// 支持的音频格式
const AUDIO_FORMATS = ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'opus', 'wma', 'webm']

// 支持的视频格式
const VIDEO_FORMATS = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v', '3gp']

// 所有支持的格式
const ALL_FORMATS = [...AUDIO_FORMATS, ...VIDEO_FORMATS]

let ffmpegInstance = null
let ffmpegLoading = false
let ffmpegLoadError = null

/**
 * 检查文件是否为支持的格式
 */
export function isSupportedFormat(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  return ALL_FORMATS.includes(ext)
}

/**
 * 判断文件是否为视频格式
 */
export function isVideoFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  return VIDEO_FORMATS.includes(ext)
}

/**
 * 判断文件是否为音频格式
 */
export function isAudioFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  return AUDIO_FORMATS.includes(ext)
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(file) {
  return file.name.split('.').pop().toLowerCase()
}

/**
 * 检查文件类型是否有效（通过 MIME 或扩展名）
 */
export function validateMediaFile(file) {
  const ext = getFileExtension(file)
  const mime = file.type.toLowerCase()

  // 检查 MIME 类型
  if (mime.startsWith('audio/') || mime.startsWith('video/')) {
    return { valid: true }
  }

  // 某些格式可能没有正确的 MIME，通过扩展名判断
  if (ALL_FORMATS.includes(ext)) {
    return { valid: true }
  }

  return {
    valid: false,
    error: `不支持的格式 ".${ext}"。请上传以下格式之一：\n音频: ${AUDIO_FORMATS.join(', ').toUpperCase()}\n视频: ${VIDEO_FORMATS.join(', ').toUpperCase()}`,
  }
}

/**
 * 获取 FFmpeg 实例（懒加载，单例）
 * @param {Function} onProgress - 进度回调 (0-100)
 */
export async function getFFmpeg(onProgress) {
  if (ffmpegInstance) return ffmpegInstance

  if (ffmpegLoadError) {
    throw new Error(ffmpegLoadError)
  }

  if (ffmpegLoading) {
    // 等待已在进行中的加载
    let waited = 0
    while (ffmpegLoading && waited < 30000) {
      await new Promise((r) => setTimeout(r, 200))
      waited += 200
    }
    if (ffmpegInstance) return ffmpegInstance
    if (ffmpegLoadError) throw new Error(ffmpegLoadError)
    throw new Error('FFmpeg 加载超时')
  }

  ffmpegLoading = true
  onProgress?.(5)

  try {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { toBlobURL } = await import('@ffmpeg/util')

    const ffmpeg = new FFmpeg()

    // 监听日志用于调试
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message)
    })

    // 监听进度
    ffmpeg.on('progress', ({ progress, time }) => {
      const pct = Math.round(progress * 100)
      onProgress?.(10 + Math.round(pct * 0.7)) // 10-80% 分配给 FFmpeg 处理
    })

    // 从 CDN 加载 FFmpeg core
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

    onProgress?.(8)
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    onProgress?.(10)
    ffmpegInstance = ffmpeg
    ffmpegLoading = false
    return ffmpeg
  } catch (err) {
    ffmpegLoading = false
    ffmpegLoadError = `FFmpeg 加载失败: ${err.message}`
    throw new Error(ffmpegLoadError)
  }
}

/**
 * 从文件提取音频
 * @param {File} file - 上传的文件
 * @param {Function} onProgress - 进度回调 (progress: 0-100, stage: string)
 * @returns {Promise<{blob: Blob, fileName: string, duration: number, format: string}>}
 */
export async function extractAudio(file, onProgress) {
  const progress = (pct, stage) => onProgress?.({ progress: Math.min(100, Math.max(0, pct)), stage })

  progress(0, '验证文件...')

  // 验证文件
  const validation = validateMediaFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // 如果是音频文件，直接返回
  if (isAudioFile(file)) {
    progress(50, '处理音频文件...')

    const duration = await getAudioDuration(file)
    progress(100, '完成')

    return {
      blob: file,
      fileName: file.name,
      duration,
      format: getFileExtension(file),
      sourceType: 'audio',
    }
  }

  // 视频文件，使用 FFmpeg 提取音频
  progress(3, '正在加载 FFmpeg 引擎...')

  let ffmpeg
  try {
    ffmpeg = await getFFmpeg((pct) => progress(pct, '加载 FFmpeg 引擎...'))
  } catch (err) {
    throw new Error(
      `FFmpeg 引擎加载失败。可能原因：\n` +
      `1. 浏览器不支持 WebAssembly 或 SharedArrayBuffer\n` +
      `2. 网络连接问题，无法下载 FFmpeg 核心文件\n` +
      `3. 请尝试将视频转换为 MP3 或 WAV 格式后直接上传音频\n\n` +
      `原始错误: ${err.message}`
    )
  }

  progress(12, '正在读取视频文件...')

  try {
    const { fetchFile } = await import('@ffmpeg/util')
    const inputFileName = `input.${getFileExtension(file)}`
    const outputFileName = 'extracted_audio.mp3'

    // 写入文件到 FFmpeg 虚拟文件系统
    progress(15, '写入文件...')
    await ffmpeg.writeFile(inputFileName, await fetchFile(file))

    // 执行提取命令: 提取音频，编码为 MP3
    progress(20, '正在提取音频...')
    await ffmpeg.exec([
      '-i', inputFileName,
      '-vn',                // 不要视频
      '-acodec', 'libmp3lame', // MP3 编码
      '-ab', '192k',        // 192kbps 比特率
      '-ar', '44100',       // 44.1kHz 采样率
      '-ac', '1',           // 单声道（语音克隆用）
      '-y',                 // 覆盖输出
      outputFileName,
    ])

    // 读取输出文件
    progress(85, '读取提取结果...')
    const data = await ffmpeg.readFile(outputFileName)

    // 清理临时文件
    progress(90, '清理...')
    try {
      await ffmpeg.deleteFile(inputFileName)
      await ffmpeg.deleteFile(outputFileName)
    } catch {
      // 忽略清理错误
    }

    progress(95, '生成音频...')

    const audioBlob = new Blob([data.buffer], { type: 'audio/mpeg' })
    const baseName = file.name.replace(/\.[^.]+$/, '')
    const duration = await getAudioDuration(audioBlob)

    progress(100, '完成')

    return {
      blob: audioBlob,
      fileName: `${baseName}_extracted.mp3`,
      duration,
      format: 'mp3',
      sourceType: 'video',
      originalFile: file.name,
    }
  } catch (err) {
    // 清理
    try { await ffmpeg.deleteFile('input.' + getFileExtension(file)) } catch {}
    try { await ffmpeg.deleteFile('extracted_audio.mp3') } catch {}

    throw new Error(
      `音频提取失败: ${err.message}\n\n` +
      `可能原因：\n` +
      `1. 视频文件损坏或编码格式不支持\n` +
      `2. 视频中没有音频轨道\n` +
      `3. 请尝试将视频转换为 MP3 或 WAV 格式后上传`
    )
  }
}

/**
 * 获取音频时长（秒）
 */
async function getAudioDuration(fileOrBlob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(fileOrBlob)
    const audio = new Audio()
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url)
      resolve(audio.duration || 0)
    })
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      resolve(0)
    })
    audio.src = url
  })
}

/**
 * 创建音频预览 URL
 */
export function createAudioPreviewUrl(blob) {
  return URL.createObjectURL(blob)
}

/**
 * 释放预览 URL
 */
export function revokeAudioPreviewUrl(url) {
  URL.revokeObjectURL(url)
}

/**
 * 释放 FFmpeg 实例（释放内存）
 */
export async function releaseFFmpeg() {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate()
    } catch {}
    ffmpegInstance = null
    ffmpegLoading = false
    ffmpegLoadError = null
  }
}

/**
 * 检查 FFmpeg.wasm 是否可用
 */
export function isFFmpegSupported() {
  // 检查基本能力
  if (typeof window === 'undefined') return false
  if (typeof WebAssembly === 'undefined') return false
  if (typeof SharedArrayBuffer === 'undefined') return false
  return true
}

/**
 * 格式化时长
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}