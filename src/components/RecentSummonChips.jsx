/**
 * 最近召唤角色快捷入口：localStorage 存储最近 N 个被成功召唤/离场的角色名，
 * 供聊天页展示一排 chips，点一下即发送「X来了 / 再见了X」给严格本地路由。
 * 不涉及 AI，不影响任何官方档案。
 */
import { useEffect, useState, useCallback } from 'react'
import useStore from '../store/useStore'
import {
  getCharacterUiRegistry,
  resolveCharacterUi,
} from '../core/ui/CharacterUiRegistry'
import { findCharacter } from '../services/characterDataService'

const LS_KEY = 'ai-chat.recentCharacters.v1'
const MAX = 8

function readAll() {
  try {
    const raw = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem(LS_KEY)
      : null
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => x && x.name && typeof x.lastAt === 'number')
      .slice(0, MAX)
  } catch { return [] }
}

function writeAll(list) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {}
}

export default function RecentSummonChips({ disabled }) {
  const { sendMessage, activeCharacters, character } = useStore()
  const [list, setList] = useState(() => readAll())
  const [, setTick] = useState(0)
  const mainName = character?.name

  // 每次路由订阅（外观变更时也刷新一下头像）
  useEffect(() => {
    const unsub = getCharacterUiRegistry().subscribe(() => setTick((v) => v + 1))
    let id = 0
    id = window.setInterval(() => setList(readAll()), 10_000)
    return () => {
      try { unsub() } catch (_) { /* ignore */ }
      if (id) window.clearInterval(id)
    }
  }, [])

  // 当 activeCharacters 变化时也重排最近列表
  useEffect(() => {
    setList(readAll())
  }, [activeCharacters, mainName])

  // UI 上剔除主角色本人（一般不展示主角色本人的召唤 chip）
  const show = list.filter((x) => x.name !== mainName)
  if (!show.length) return null

  const isActive = useCallback(
    (name) => {
      if (!name) return false
      return Array.isArray(activeCharacters) && activeCharacters.some((n) => n === name)
    },
    [activeCharacters],
  )

  const trigger = useCallback(
    (name) => {
      if (disabled) return
      const active = isActive(name)
      // 触发严格本地路由的标准句式：active 时离场；otherwise 召唤
      sendMessage(active ? `再见了${name}` : `${name}来了`)
    },
    [disabled, isActive, sendMessage],
  )

  const removeFromList = useCallback((e, name) => {
    e.preventDefault()
    e.stopPropagation()
    writeAll(readAll().filter((x) => x.name !== name))
    setList(readAll())
  }, [])

  return (
    <div className="px-3 sm:px-4 max-w-3xl mx-auto -mt-1 mb-2">
      <div className="flex items-center gap-1.5 mb-1 px-1">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">最近召唤</span>
        <span className="text-[10px] text-slate-300 dark:text-slate-600">· 点 Chip 切换入/离场</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {show.map((item) => {
          const prof = findCharacter(item.name)
          const ui = resolveCharacterUi(
            item.name,
            prof?.name || item.name,
            prof?.avatar || '',
            false,
          )
          const active = isActive(item.name)
          return (
            <div
              key={item.name}
              className="group flex items-center gap-2 shrink-0 px-2.5 py-1.5 rounded-full border transition-all select-none"
              style={{
                borderColor: active ? (ui.bubbleColor || '#93c5fd') : 'rgba(148,163,184,0.35)',
                backgroundColor: active ? `${ui.bubbleColor || '#93c5fd'}22` : 'rgba(255,255,255,0.6)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.55 : 1,
              }}
              onClick={() => trigger(item.name)}
              title={active ? `点击让 ${item.name} 离场` : `点击召唤 ${item.name}`}
            >
              <div
                className="w-6 h-6 rounded-full bg-center bg-cover ring-1 ring-white/60 dark:ring-slate-700/60 flex items-center justify-center text-[12px] font-semibold text-white shrink-0"
                style={{
                  backgroundImage: ui.avatar ? `url(${ui.avatar})` : undefined,
                  backgroundColor: ui.avatar ? undefined : (ui.bubbleColor || '#94a3b8'),
                  color: '#fff',
                }}
              >
                {!ui.avatar ? (ui.displayName || item.name).slice(0, 1) : ''}
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {ui.displayName || item.name}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium whitespace-nowrap ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-300'
                }`}
              >
                {active ? '在场' : '点召唤'}
              </span>
              <button
                className="ml-0.5 w-4 h-4 rounded-full bg-slate-200/60 dark:bg-slate-700/70 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => removeFromList(e, item.name)}
                title="从最近列表移除"
              >×</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
