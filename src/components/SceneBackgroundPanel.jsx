import { useRef, useState } from 'react'
import { useSceneRuntime } from '../hooks/useSceneRuntime'
import { useSceneBackgrounds } from '../hooks/useSceneBackgrounds'
import {
  buildSceneKeys,
  buildPrimarySceneKey,
  setSceneBackground,
  removeSceneBackground,
} from '../services/sceneImageMap'

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
  const candidateKeys = buildSceneKeys(location, area, timePeriod)

  // 当前场景命中的绑定（用于预览）
  const activeBindingKey = candidateKeys.find((k) => sceneMap[k]) || ''

  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const onPickFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!primaryKey) {
      setError('当前没有有效的场景地点，无法绑定。请先在对话中进入某个场景。')
      return
    }
    if (!f.type || !f.type.startsWith('image/')) {
      setError('请选择图片文件。')
      return
    }
    // 防止 base64 撑爆 localStorage（上限约 5MB）
    if (f.size > 3 * 1024 * 1024) {
      setError('图片过大（超过 3MB），请压缩后再上传。')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result
      if (typeof src === 'string') {
        setSceneBackground(primaryKey, src)
        setError('')
      } else {
        setError('读取图片失败，请重试。')
      }
    }
    reader.onerror = () => setError('读取图片失败，请重试。')
    reader.readAsDataURL(f)
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

        {/* 当前绑定预览 */}
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
            当前绑定场景ID：{primaryKey || '（无）'}
          </p>
          {activeBindingKey ? (
            <div className="flex items-center gap-3">
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
            <p className="text-[11px] text-gray-400 dark:text-gray-500">尚未绑定背景图，将使用内置占位渐变图。</p>
          )}
        </div>

        {/* 上传绑定 */}
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!primaryKey}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-opacity ${
              primaryKey
                ? 'bg-ios-blue text-white hover:opacity-90'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            }`}
          >
            上传图片并绑定到当前场景
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
          ⓘ 匹配优先级：地点_区域_时段 → 地点_区域 → 地点。上传的图片以 base64 存储于本地，建议压缩至 3MB 以内。
        </p>
      </div>
    </div>
  )
}