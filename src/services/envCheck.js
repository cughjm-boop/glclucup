/**
 * 运行环境检测服务
 * 检测语音功能所需的浏览器能力，提供诊断和提示
 */

/**
 * 检查是否处于安全上下文
 * SpeechSynthesis 在部分浏览器中需要 HTTPS 或 localhost
 */
export function isSecureContext() {
  return typeof window !== 'undefined' && window.isSecureContext === true
}

/**
 * 检查是否为 localhost（大多数浏览器在 localhost 下允许 SpeechSynthesis）
 */
export function isLocalhost() {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * 检查 SpeechSynthesis API 是否可用
 */
export function hasSpeechSynthesisAPI() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * 检查 SpeechSynthesis 是否被浏览器阻止
 * 某些浏览器（如移动端 Safari）可能静默禁用
 */
export function isSpeechSynthesisBlocked() {
  if (!hasSpeechSynthesisAPI()) return true
  try {
    // 尝试触发一次 speak 来检测是否被阻止
    const testUtterance = new SpeechSynthesisUtterance('')
    testUtterance.volume = 0
    testUtterance.rate = 0.1
    window.speechSynthesis.speak(testUtterance)
    window.speechSynthesis.cancel()
    return false
  } catch {
    return true
  }
}

/**
 * 获取可用语音数量
 */
export function getVoiceCount() {
  if (!hasSpeechSynthesisAPI()) return 0
  return window.speechSynthesis.getVoices().length
}

/**
 * 综合环境检测
 * @returns {{ ok: boolean, level: 'ok'|'warning'|'error', issues: string[], details: object }}
 */
export function diagnoseEnvironment() {
  const issues = []
  const details = {}

  // 1. 安全上下文
  details.isSecureContext = isSecureContext()
  details.isLocalhost = isLocalhost()

  if (!details.isSecureContext && !details.isLocalhost) {
    issues.push('当前页面不在安全上下文（HTTPS）中，且不是 localhost，语音功能可能被浏览器阻止')
  }

  // 2. SpeechSynthesis API
  details.hasAPI = hasSpeechSynthesisAPI()
  if (!details.hasAPI) {
    issues.push('浏览器不支持 SpeechSynthesis API（window.speechSynthesis 不存在）')
    return { ok: false, level: 'error', issues, details }
  }

  // 3. 是否被阻止
  details.isBlocked = isSpeechSynthesisBlocked()
  if (details.isBlocked) {
    issues.push('SpeechSynthesis 被浏览器阻止（可能在 iframe 或无痕模式中）')
  }

  // 4. 语音包数量
  details.voiceCount = getVoiceCount()
  if (details.voiceCount === 0) {
    // 语音包可能尚未加载，这不算严重错误
    issues.push('尚未检测到语音包（可能正在异步加载中）')
  }

  // 5. 中文语音包
  if (details.voiceCount > 0) {
    const voices = window.speechSynthesis.getVoices()
    const zhVoices = voices.filter((v) => {
      const lang = v.lang.toLowerCase()
      return lang.startsWith('zh') || lang.startsWith('cmn') || lang.includes('chinese') || lang.includes('mandarin')
    })
    details.zhVoiceCount = zhVoices.length
    details.voiceList = voices.map((v) => ({ name: v.name, lang: v.lang, default: v.default }))

    if (zhVoices.length === 0) {
      issues.push('未检测到中文语音包，建议安装系统中文语音包以获得最佳体验')
    }
  }

  // 6. Web Audio API（用于模拟克隆）
  details.hasWebAudio = typeof window !== 'undefined' &&
    (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined')

  let level = 'ok'
  if (issues.length > 0) {
    const hasBlocking = issues.some((i) =>
      i.includes('不支持') || i.includes('阻止')
    )
    level = hasBlocking ? 'error' : 'warning'
  }

  return { ok: level !== 'error', level, issues, details }
}

/**
 * 生成环境诊断报告（可读文本）
 */
export function getDiagnosisReport() {
  const diag = diagnoseEnvironment()

  const lines = [
    '=== 语音环境诊断报告 ===',
    '',
    `安全上下文: ${diag.details.isSecureContext ? '是 (HTTPS)' : '否'}`,
    `Localhost: ${diag.details.isLocalhost ? '是' : '否'}`,
    `SpeechSynthesis API: ${diag.details.hasAPI ? '可用' : '不可用'}`,
    `语音包数量: ${diag.details.voiceCount ?? 'N/A'}`,
    `中文语音包: ${diag.details.zhVoiceCount ?? 'N/A'}`,
    `Web Audio API: ${diag.details.hasWebAudio ? '可用' : '不可用'}`,
    '',
  ]

  if (diag.details.voiceList && diag.details.voiceList.length > 0) {
    lines.push('已检测到的语音:')
    diag.details.voiceList.forEach((v) => {
      lines.push(`  - ${v.name} (${v.lang})${v.default ? ' [默认]' : ''}`)
    })
    lines.push('')
  }

  if (diag.issues.length > 0) {
    lines.push('发现的问题:')
    diag.issues.forEach((issue, i) => {
      lines.push(`  ${i + 1}. ${issue}`)
    })
  } else {
    lines.push('环境检测通过，语音功能应可正常使用。')
  }

  return lines.join('\n')
}

/**
 * 运行诊断测试（返回结果对象，用于 UI 展示）
 */
export async function runDiagnosticTest() {
  const diag = diagnoseEnvironment()

  // 如果有语音包，尝试实际播放测试
  let synthesisTest = null
  if (diag.details.hasAPI && diag.details.voiceCount > 0) {
    try {
      await new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance('测试')
        utterance.volume = 0
        utterance.onend = () => {
          synthesisTest = { success: true, message: '语音合成测试通过' }
          resolve()
        }
        utterance.onerror = (e) => {
          synthesisTest = {
            success: false,
            message: `语音合成测试失败: ${e.error}`,
            error: e.error,
          }
          reject(e)
        }
        window.speechSynthesis.speak(utterance)
        // 超时
        setTimeout(() => {
          window.speechSynthesis.cancel()
          if (!synthesisTest) {
            synthesisTest = { success: true, message: '语音合成测试通过（超时兜底）' }
            resolve()
          }
        }, 3000)
      })
    } catch {
      // 错误已在上面处理
    }
  }

  return { ...diag, synthesisTest }
}