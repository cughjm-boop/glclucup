/**
 * 导出工具函数
 * 优先使用 Capacitor 原生文件操作 + 系统分享
 * 兜底方案：剪贴板复制
 * 桌面端兜底：Blob 下载
 */

/**
 * 安全地获取 Capacitor 原生模块（避免在非原生环境报错）
 */
let _Filesystem = null
let _Directory = null
let _Share = null

async function getCapacitorModules() {
  if (_Filesystem && _Share) return true
  try {
    const fs = await import('@capacitor/filesystem')
    const share = await import('@capacitor/share')
    _Filesystem = fs.Filesystem
    _Directory = fs.Directory
    _Share = share.Share
    return true
  } catch {
    return false
  }
}

/**
 * 格式化时间戳为 "年/月/日 时:分" 格式
 */
export function formatExportTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}`
}

/**
 * 格式化日期为 "年/月/日" 格式
 */
export function formatExportDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 获取当前日期字符串 YYYY-MM-DD
 */
export function getDateStr() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * 检测是否为 Capacitor 原生环境
 */
async function isCapacitorNative() {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      // 确保模块已加载
      return await getCapacitorModules()
    }
    return false
  } catch {
    return false
  }
}

/**
 * 检测是否为移动端 WebView 环境
 */
function isMobileWebView() {
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|webOS/i.test(ua) ||
         /wv|WebView/i.test(ua) ||
         (typeof window.Android !== 'undefined')
}

/**
 * 尝试复制内容到剪贴板
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function tryClipboardCopy(content) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(content)
      return { success: true }
    }
    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const result = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (result) return { success: true }
    return { success: false, error: '复制功能不可用' }
  } catch (err) {
    return { success: false, error: err.message || '复制失败' }
  }
}

/**
 * 通过 Blob + anchor 下载文件（桌面端兜底）
 */
async function tryBlobDownload(content, filename, mimeType) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        resolve(true)
      }, 100)
    } catch (err) {
      resolve(false)
    }
  })
}

/**
 * 显示 Toast 提示消息
 */
function showToast(message, duration = 3000) {
  const existingToast = document.querySelector('.error-toast')
  if (existingToast) existingToast.remove()

  const toast = document.createElement('div')
  toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium shadow-2xl animate-bounce-in error-toast'
  toast.style.cssText = 'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);z-index:100;'
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.3s'
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast)
    }, 300)
  }, duration)
}

/**
 * 使用 Capacitor 原生方式导出文件
 * 流程：写入缓存目录 → 系统分享 → 剪贴板兜底
 *
 * @param {string} content - 导出的文件内容
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME 类型
 * @param {Object} options - 可选配置
 * @param {string} options.label - 导出类型标签（如"聊天记录"、"记忆"）
 * @returns {Promise<{success: boolean, method: string, error?: string}>}
 */
export async function downloadWithFallback(content, filename, mimeType, options = {}) {
  const { label = '文件' } = options

  // ===== Capacitor 原生环境：Filesystem + Share =====
  if (await isCapacitorNative()) {
    try {
      // Step 1: 写入文件到缓存目录
      const writeResult = await _Filesystem.writeFile({
        path: filename,
        data: content,
        directory: _Directory.Cache,
        encoding: 'utf8',
      })

      if (!writeResult || !writeResult.uri) {
        throw new Error('文件写入失败：未获取到文件路径')
      }

      // Step 2: 尝试系统分享
      try {
        await _Share.share({
          title: label,
          text: `${label}已导出，请选择保存方式`,
          url: writeResult.uri,
          dialogTitle: `分享${label}`,
        })
        showToast(`${label}导出成功，请选择保存方式`, 3000)
        return { success: true, method: 'share' }
      } catch (shareErr) {
        // 用户取消分享不算失败
        if (shareErr.message && shareErr.message.includes('canceled')) {
          return { success: true, method: 'share_canceled' }
        }
        // 分享失败，降级到剪贴板
        console.warn('Share failed, falling back to clipboard:', shareErr)
      }

      // Step 3: 降级到剪贴板
      const clipResult = await tryClipboardCopy(content)
      if (clipResult.success) {
        showToast(`${label}已复制到剪贴板，请粘贴保存`, 4000)
        return { success: true, method: 'clipboard' }
      }

      throw new Error('无法完成导出，分享和剪贴板均不可用')
    } catch (err) {
      const errorMsg = err.message || '导出失败'
      showToast(`导出失败：${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }

  // ===== 非 Capacitor 环境：桌面端/移动端 WebView 兜底 =====
  const isMobile = isMobileWebView()

  // 尝试 Blob 下载
  const downloadOk = await tryBlobDownload(content, filename, mimeType)
  if (downloadOk) {
    if (isMobile) {
      showToast(`${label}导出请求已发送，如未自动下载，已自动复制到剪贴板`, 4000)
      // 移动端 WebView 中 Blob 下载通常无效，同时复制到剪贴板
      await tryClipboardCopy(content)
    }
    return { success: true, method: 'download' }
  }

  // 移动端兜底：剪贴板
  if (isMobile) {
    const clipResult = await tryClipboardCopy(content)
    if (clipResult.success) {
      showToast(`已复制到剪贴板，请粘贴保存`, 4000)
      return { success: true, method: 'clipboard' }
    }
  }

  // 尝试系统 Web Share API
  try {
    if (navigator.share) {
      const blob = new Blob([content], { type: mimeType })
      const file = new File([blob], filename, { type: mimeType })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: filename, files: [file] })
        return { success: true, method: 'share' }
      } else {
        await navigator.share({
          title: filename,
          text: content.slice(0, 500) + (content.length > 500 ? '\n...（内容过长已截断，请使用复制功能）' : ''),
        })
        return { success: true, method: 'share_text' }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: true, method: 'share_aborted' }
    }
  }

  // 全部失败
  showToast(`导出失败：浏览器不支持导出功能`)
  return { success: false, error: '浏览器不支持导出功能' }
}

/**
 * 触发系统分享（单独调用）
 */
export async function triggerShare(content, filename, mimeType) {
  if (await isCapacitorNative()) {
    try {
      const writeResult = await _Filesystem.writeFile({
        path: filename,
        data: content,
        directory: _Directory.Cache,
        encoding: 'utf8',
      })
      await _Share.share({
        title: filename,
        text: '请选择保存方式',
        url: writeResult.uri,
        dialogTitle: '分享文件',
      })
      return { success: true }
    } catch (err) {
      if (err.message && err.message.includes('canceled')) {
        return { success: true, aborted: true }
      }
      showToast(`分享失败：${err.message || '系统分享不可用'}`)
      return { success: false, error: err.message }
    }
  }

  // 非原生环境使用 Web Share API
  try {
    if (navigator.share) {
      const blob = new Blob([content], { type: mimeType })
      const file = new File([blob], filename, { type: mimeType })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: filename, files: [file] })
      } else {
        await navigator.share({ title: filename, text: content.slice(0, 500) })
      }
      return { success: true }
    }
  } catch (err) {
    if (err.name === 'AbortError') return { success: true, aborted: true }
    showToast(`分享失败：${err.message || '系统分享不可用'}`)
    return { success: false, error: err.message }
  }

  showToast('系统分享不可用')
  return { success: false, error: '系统分享不可用' }
}

/**
 * 触发剪贴板复制（单独调用）
 */
export async function triggerClipboard(content) {
  const result = await tryClipboardCopy(content)
  if (result.success) {
    showToast('已复制到剪贴板，请粘贴保存', 3000)
  } else {
    showToast(`复制失败：${result.error || '未知错误'}`)
  }
  return result
}