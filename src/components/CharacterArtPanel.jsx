import { useRef, useState } from 'react'
import { EMOTION_TABLE } from '../core/character/CharacterStateManager'
import { useCharacterArts } from '../hooks/useCharacterArts'
import { setCharacterArt, removeCharacterArt } from '../services/characterArtMap'

/**
 * CharacterArtPanel — 角色立绘上传面板（纯视觉层，嵌套于「角色外观」）
 *
 * - 读取 Emotion 白名单（CharacterStateEngine）列出可绑定情绪。
 * - 支持为「角色+情绪」上传透明 PNG 立绘，另支持「默认立绘」。
 * - 预览并删除已有绑定。
 *
 * 只操作立绘映射，不改写聊天/角色状态/记忆逻辑。
 */
export default function CharacterArtPanel({ character }) {
  const artMap = useCharacterArts()
  const characterId = character?.id || ''

  const [emotionKey, setEmotionKey] = useState('happy')
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const defaultFileInputRef = useRef(null)

  const emotions = Object.entries(EMOTION_TABLE).map(([key, v]) => ({
    key,
    name: v.name,
    emoji: v.emoji,
  }))

  const currentKey = `${characterId}_${emotionKey}`
  const defaultKey = `${characterId}_default`

  const onPickFile = (e, key) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!characterId) {
      setError('请先选择角色。')
      return
    }
    if (!f.type || !f.type.startsWith('image/')) {
      setError('请选择图片文件（建议透明 PNG）。')
      return
    }
    if (f.size > 3 * 1024 * 1024) {
      setError('图片过大（超过 3MB），请压缩后再上传。')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCharacterArt(key, reader.result)
        setError('')
      } else {
        setError('读取图片失败，请重试。')
      }
    }
    reader.onerror = () => setError('读取图片失败，请重试。')
    reader.readAsDataURL(f)
  }

  const ownEntries = Object.entries(artMap || {}).filter(([k]) =>
    k.startsWith(`${characterId}_`),
  )

  const emotionName = EMOTION_TABLE[emotionKey]?.name || emotionKey

  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 p-3 space-y-3">
      <div>
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">立绘（情绪表情）</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          上传透明 PNG，按情绪自动切换；未匹配时使用默认立绘 / 头像 / 剪影。
        </p>
      </div>

      {/* 情绪立绘上传 */}
      <div className="flex items-center gap-2">
        <select
          value={emotionKey}
          onChange={(e) => setEmotionKey(e.target.value)}
          className="flex-1 px-2.5 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-ios-blue/40"
        >
          {emotions.map((e) => (
            <option key={e.key} value={e.key}>
              {e.emoji} {e.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 rounded-xl text-xs font-medium bg-ios-blue text-white hover:opacity-90 transition-opacity flex-shrink-0"
        >
          上传「{emotionName}」
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/*"
          className="hidden"
          onChange={(e) => onPickFile(e, currentKey)}
        />
      </div>

      {/* 默认立绘上传 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          默认立绘（未匹配到具体情绪时使用）
        </span>
        <button
          onClick={() => defaultFileInputRef.current?.click()}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          上传默认立绘
        </button>
        <input
          ref={defaultFileInputRef}
          type="file"
          accept="image/png,image/*"
          className="hidden"
          onChange={(e) => onPickFile(e, defaultKey)}
        />
      </div>

      {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}

      {/* 已绑定列表 */}
      {ownEntries.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-2">
            已上传立绘（{ownEntries.length}）
          </p>
          <div className="space-y-2 max-h-44 overflow-y-auto">
            {ownEntries.map(([key, src]) => {
              const label =
                key === defaultKey
                  ? '默认立绘'
                  : key.startsWith(`${characterId}_`)
                    ? (EMOTION_TABLE[key.slice(characterId.length + 1)]?.name || key)
                    : key
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-10 h-12 rounded-lg overflow-hidden bg-white dark:bg-gray-900 ring-1 ring-black/5 dark:ring-white/10 flex-shrink-0 flex items-end justify-center">
                    <img src={src} alt="" className="max-h-full w-full object-contain object-bottom" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{label}</p>
                  </div>
                  <button
                    onClick={() => removeCharacterArt(key)}
                    className="px-2 py-1 rounded-md text-[10px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    删除
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
        ⓘ 立绘以 base64 存储于本地，建议压缩至 3MB 以内；透明 PNG 效果最佳。
      </p>
    </div>
  )
}