import { useState, useEffect, useCallback } from 'react'

// 默认更新检查 URL（可配置，在应用内可修改）
const DEFAULT_UPDATE_URL = 'https://jsonblob.com/api/jsonBlob/019fb81d-7fb7-7d0c-a21e-eb35f1dcc0d5'

// 当前版本信息（与 build-apk.sh 中的 VERSION_CODE / VERSION_NAME 保持一致）
const CURRENT_VERSION = { code: 3, name: '1.2.0' }

function isHttpProxyAvailable() {
  try {
    return !!(window.HttpProxy && typeof window.HttpProxy.get === 'function')
  } catch {
    return false
  }
}

// 根据错误类型给出建议
function getErrorSuggestion(errorType, error) {
  switch (errorType) {
    case 'dns':
      return '请检查手机网络连接，或确认更新地址中的域名是否正确'
    case 'timeout':
    case 'connection':
      return '服务器可能不在同一网络，请确认手机能访问该地址。可以尝试用手机浏览器打开该地址验证'
    case 'ssl':
      return '请将更新地址改为 HTTP（非 HTTPS），或确认 SSL 证书有效'
    case 'config':
      return '请在下方输入正确的更新服务器地址'
    case 'server':
      return '服务器返回异常，请确认更新地址路径正确'
    case 'parse':
      return '服务器返回的不是有效的版本信息，请确认 version.json 格式正确'
    default:
      return error || '未知错误'
  }
}

export default function UpdateChecker() {
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [errorType, setErrorType] = useState('')
  const [updateUrl, setUpdateUrl] = useState(() => {
    return localStorage.getItem('update_check_url') || DEFAULT_UPDATE_URL
  })

  const checkForUpdate = useCallback(async () => {
    setChecking(true)
    setError('')
    setErrorType('')
    setUpdateInfo(null)

    // 保存 URL 到 localStorage
    localStorage.setItem('update_check_url', updateUrl)

    // 方案1: 通过 HttpProxy 原生代理获取（Android 原生环境）
    if (isHttpProxyAvailable()) {
      try {
        const result = JSON.parse(window.HttpProxy.get(updateUrl, '{}'))
        if (result.ok && result.body) {
          const json = JSON.parse(result.body)
          const serverVersion = json.versionCode || 0
          const hasUpdate = serverVersion > CURRENT_VERSION.code

          // 解析完整下载 URL
          let downloadUrl = json.downloadUrl || ''
          if (downloadUrl && !downloadUrl.startsWith('http')) {
            try {
              const baseUrl = new URL(updateUrl)
              downloadUrl = baseUrl.origin + (downloadUrl.startsWith('/') ? '' : '/') + downloadUrl
            } catch {}
          }

          setUpdateInfo({
            hasUpdate,
            versionName: json.versionName || '',
            versionCode: serverVersion,
            releaseNotes: json.releaseNotes || '',
            downloadUrl,
            fileSize: json.fileSize || 0,
            currentVersionCode: CURRENT_VERSION.code,
          })
          setChecking(false)
          return
        } else {
          setError(result.error || '无法获取版本信息')
          setErrorType('network')
          setChecking(false)
          return
        }
      } catch (err) {
        console.warn('HttpProxy.get fallback failed:', err)
      }
    }

    // 方案2: 非 Android 环境，使用 fetch 直接请求
    try {
      const response = await fetch(updateUrl, { cache: 'no-cache' })
      if (!response.ok) {
        setError(`HTTP ${response.status}: 无法访问更新服务器`)
        setErrorType('server')
        setChecking(false)
        return
      }
      const json = await response.json()
      const serverVersion = json.versionCode || 0
      const hasUpdate = serverVersion > CURRENT_VERSION.code

      let downloadUrl = json.downloadUrl || ''
      if (downloadUrl && !downloadUrl.startsWith('http')) {
        try {
          const baseUrl = new URL(updateUrl)
          downloadUrl = baseUrl.origin + (downloadUrl.startsWith('/') ? '' : '/') + downloadUrl
        } catch {}
      }

      setUpdateInfo({
        hasUpdate,
        versionName: json.versionName || '',
        versionCode: serverVersion,
        releaseNotes: json.releaseNotes || '',
        downloadUrl,
        fileSize: json.fileSize || 0,
        currentVersionCode: CURRENT_VERSION.code,
      })
    } catch (err) {
      setError(err.message || '网络请求失败')
      setErrorType('network')
    } finally {
      setChecking(false)
    }
  }, [updateUrl])

  const handleDownload = useCallback(async () => {
    if (!updateInfo?.downloadUrl) return

    setDownloading(true)
    setError('')

    try {
      // In Android native environment, use HttpProxy to download
      if (isHttpProxyAvailable()) {
        const result = JSON.parse(window.HttpProxy.downloadFile(updateInfo.downloadUrl, '{}'))
        if (result.code !== 0) {
          setError('下载失败: ' + (result.message || '未知错误'))
        }
      } else {
        // Fallback: open download URL in browser
        window.open(updateInfo.downloadUrl, '_blank')
      }
    } catch (err) {
      setError('下载失败: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }, [updateInfo])

  // 首次加载时自动检查一次
  useEffect(() => {
    const autoChecked = sessionStorage.getItem('update_auto_checked')
    if (!autoChecked) {
      sessionStorage.setItem('update_auto_checked', '1')
      checkForUpdate()
    }
  }, [checkForUpdate])

  const handleUrlChange = (e) => {
    const url = e.target.value
    setUpdateUrl(url)
    localStorage.setItem('update_check_url', url)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">关于与更新</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          v{CURRENT_VERSION.name} (build {CURRENT_VERSION.code})
        </span>
      </div>

      {/* 更新服务器地址 */}
      <div className="text-xs">
        <label className="block text-gray-500 dark:text-gray-400 mb-1">更新服务器地址</label>
        <input
          type="text"
          value={updateUrl}
          onChange={handleUrlChange}
          placeholder={DEFAULT_UPDATE_URL}
          className="w-full px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs"
        />
      </div>

      {/* 检查更新按钮 */}
      <button
        onClick={checkForUpdate}
        disabled={checking}
        className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300
                   text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors
                   disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {checking ? (
          <>
            <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin" />
            检查中...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            检查更新
          </>
        )}
      </button>

      {/* 状态显示 */}
      {updateInfo?.hasUpdate === false && !checking && (
        <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs text-center">
          已是最新版本
        </div>
      )}

      {updateInfo?.hasUpdate && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              发现新版本 v{updateInfo.versionName}
            </span>
          </div>
          {updateInfo.releaseNotes && (
            <p className="text-xs text-blue-500 dark:text-blue-400 whitespace-pre-wrap">
              {updateInfo.releaseNotes}
            </p>
          )}
          {updateInfo.fileSize > 0 && (
            <p className="text-xs text-blue-400 dark:text-blue-500">
              大小: {(updateInfo.fileSize / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium
                       hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {downloading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                下载中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                立即更新
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/30 space-y-2">
          <p className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">{error}</p>
          {errorType && (
            <p className="text-xs text-red-500 dark:text-red-400/80">
              {getErrorSuggestion(errorType, error)}
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            如无法自动更新，请手动下载 APK 安装：
          </p>
          <a
            href="https://gofile.io/d/azez8B"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-blue-500 dark:text-blue-400 underline break-all"
          >
            https://gofile.io/d/azez8B
          </a>
        </div>
      )}
    </div>
  )
}