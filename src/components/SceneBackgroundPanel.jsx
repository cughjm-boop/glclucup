import { useEffect, useRef, useState } from 'react'
import { useSceneRuntime } from '../hooks/useSceneRuntime'
import { useSceneBackgrounds } from '../hooks/useSceneBackgrounds'
import {
  buildPrimarySceneKey,
  setSceneBackground,
  removeSceneBackground,
} from '../services/sceneImageMap'
import { compressImageFileToDataUrl } from '../utils/imageCompress'

/**
 * SceneBackgroundPanel — 场景背景管理（纯视觉层）
 *
 * - 读取当前权威场景（location / area / timePeriod / weather）。
 * - 支持上传图片并绑定到当前「场景ID」（默认「地点_区域」）。
 * - 展示并管理已有的场景背景绑定。
 *
 * 只操作图片映射，不触碰聊天/记忆/场景引擎逻辑。
 */
export default function SceneBackgroundPanel({ character }) {
  const sceneRuntime = useSceneRuntime(character?.id || null)
  const sceneMap = useSceneBackgrounds()

  const location = sceneRuntime.location || ''
  const area = sceneRuntime.area || ''
  const timePeriod = sceneRuntime.timePeriod || ''
  const weather = sceneRuntime.weather || ''

  const primaryKey = buildPrimarySceneKey(location, area)

  // 目标绑定「场景ID」：默认当前场景（地点_区域），允许用户手动修改（如追加「_晚上」）
  const [targetKey, setTargetKey] = useState('')
  useEffect(() => {
    setTargetKey(primaryKey || '')
  }, [primaryKey])

  // 当前目标 ID 命中的绑定（用于预览）
  const activeBindingKey = targetKey && sceneMap[targetKey] ? targetKey : ''

  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const onPickFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const key = (targetKey || '').trim()
    if (!key) {
      setError('请先填写（或进入场景自动生成）要绑定的场景 ID。')
      return
    }
    if (!f.type || !f.type.startsWith('image/')) {
      setError('请选择图片文件。')
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setError('图片过大（超过 20MB），请选择小一点的图片。')
      return
    }
    setError('压缩中…')
    // 等比缩小 + WebP/PNG 重编码，压缩后写入 IndexedDB（重启不丢失）
    const dataUrl = await compressImageFileToDataUrl(f, {
      maxSize: 1280,
      quality: 0.82,
      withAlpha: true,
    })
    if (!dataUrl) {
      setError('读取图片失败，请重试。')
      return
    }
    try {
      await setSceneBackground(key, dataUrl)
      setError('')
    } catch {
      setError('保存失败，请重试。')
    }
  }

  const entries = Object.entries(sceneMap || {})

  return (
    <div className="ml-13 pl-3 border-l-2 border-ios-blue/30 mt-1 mb-2 space-y-4 animate-fade-in">
      <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 space-y-3">
        {/* 当前场景信息 */}
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">当前场景</p>
          <div className="flex flex-wrap gap-1.5">
            {location && (
              <span className="text-[11px] px-2 py-1 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                地点：{location}
              </span>
            )}
            {area && (
              <span className="text-[11px] px-2 py-1 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                区域：{area}
              </span>
            )}
            {timePeriod && (
              <span className="text-[11px] px-2 py-1 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                时段：{timePeriod}
              </span>
            )}
            {weather && (
              <span className="text-[11px] px-2 py-1 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                天气：{weather}
              </span>
            )}
            {!location && !area && (
              <span className="text-[11px] px-2 py-1 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500">
                尚未进入具体场景
              </span>
            )}
          </div>
        </div>

        {/* 场景 ID 输入与绑定预览 */}
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 block">
            绑定到场景 ID
          </label>
          <input
            value={targetKey}
            onChange={(e) => setTargetKey(e.target.value)}
            placeholder="如：流萤家_客厅_晚上"
            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-ios-blue/40 font-mono"
          />
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            默认自动填入当前场景（地点_区域），可手动改为更具体的 ID（如追加「_晚上」）。
          </p>

          {activeBindingKey ? (
            <div className="mt-2 flex items-center gap-3">
              <div className="w-20 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 ring-1 ring-black/5 dark:ring-white/5 flex-shrink-0">
                <img src={sceneMap[activeBindingKey]} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{activeBindingKey}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">已绑定</p>
              </div>
              <button
                onClick={() => removeSceneBackground(activeBindingKey)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                清除
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">此 ID 尚未绑定背景图，将使用内置占位渐变图。</p>
          )}
        </div>

        {/* 上传绑定 */}
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!targetKey.trim()}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-opacity ${
              targetKey.trim()
                ? 'bg-ios-blue text-white hover:opacity-90'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            }`}
          >
            上传图片并绑定到该场景 ID
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickFile}
          />
          {error && <p className="mt-2 text-[11px] text-red-500 dark:text-red-400">{error}</p>}
        </div>

        {/* 已绑定的全部场景 */}
        {entries.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
              已绑定的场景（{entries.length}）
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {entries.map(([key, src]) => (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-12 h-9 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 ring-1 ring-black/5 dark:ring-white/5 flex-shrink-0">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{key}</p>
                  </div>
                  <button
                    onClick={() => removeSceneBackground(key)}
                    className="px-2 py-1 rounded-md text-[10px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
          ⓘ 匹配优先级：地点_区域_时段 → 地点_区域 → 地点。上传后自动压缩并存储于本地（IndexedDB），重启不丢失。
        </p>
      </div>
    </div>
  )
}