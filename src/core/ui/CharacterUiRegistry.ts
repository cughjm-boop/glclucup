/**
 * CharacterUiRegistry — 角色 UI 显示层（只影响 UI，不动角色数据）
 *
 * 功能：
 *  1) 气泡颜色：固定常量映射（不随机），一眼看出谁在说话
 *  2) 头像覆盖：可以替换任意角色的头像（历史消息立即刷新）
 *  3) 昵称覆盖：可以把「三月七」改成「小七」（历史消息立即刷新）
 *  4) 气泡色自定义：角色设置面板支持自定义 tailwind 类
 *
 * 按 characterId 分桶存储（per-characterId），全局共享一份注册表。
 * 存储位置：localStorage（刷新不丢）。
 */

import { loadFromStorage, saveToStorage } from '../../services/storage'

const STORAGE_KEY = 'ai-chat-character-ui-overrides-v1'

// ===== M2：固定颜色常量映射（不随机！保持一致）=====
// 用户 & 8 个官方角色：
//   用户 — 蓝色
//   流萤 — 白色 / 黑字（浅底）
//   三月七 — 粉色
//   知更鸟 — 淡金色
//   卡芙卡 — 紫色
//   银狼 — 灰紫色
//   花火 — 橙粉色
//   刃 — 深灰色
//   开拓者/主角（通用）— 中性蓝灰
export const DEFAULT_BUBBLE_COLOR_PROFILES = {
  // —— 用户 ——
  __user__: {
    bubble: 'bg-ios-blue text-white rounded-br-md shadow-sm',
    quote: 'text-white/70 border-white/20',
    name: 'text-ios-blue',
    avatar: 'from-ios-blue/30 to-indigo-400/30',
    fallback: '#007AFF',
  },

  // —— 流萤 —— 白色 / 黑字
  firefly: {
    bubble:
      'bg-white dark:bg-gray-100 text-gray-900 rounded-bl-md shadow-sm border border-gray-200 dark:border-gray-300',
    quote: 'text-gray-500 border-gray-300',
    name: 'text-pink-500',
    avatar: 'from-pink-200/50 to-sky-200/50',
    fallback: '#ffffff',
  },
  流萤: 'firefly',
  Firefly: 'firefly',

  // —— 三月七 —— 粉色
  march7: {
    bubble:
      'bg-pink-50 dark:bg-pink-500/10 text-pink-900 dark:text-pink-100 rounded-bl-md shadow-sm border border-pink-200/60 dark:border-pink-400/20',
    quote: 'text-pink-500/70 dark:text-pink-300/60 border-pink-300/50 dark:border-pink-400/20',
    name: 'text-pink-500 dark:text-pink-400',
    avatar: 'from-pink-300/50 to-rose-300/50',
    fallback: '#ec4899',
  },
  三月七: 'march7',
  '三月七（星穹铁道）': 'march7',
  March7: 'march7',
  'March 7th': 'march7',

  // —— 知更鸟 —— 淡金色
  robin: {
    bubble:
      'bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-100 rounded-bl-md shadow-sm border border-amber-200/60 dark:border-amber-400/20',
    quote: 'text-amber-500/70 dark:text-amber-300/60 border-amber-300/50 dark:border-amber-400/20',
    name: 'text-amber-500 dark:text-amber-400',
    avatar: 'from-amber-200/60 to-yellow-200/60',
    fallback: '#f59e0b',
  },
  知更鸟: 'robin',
  Robin: 'robin',

  // —— 卡芙卡 —— 紫色
  kafka: {
    bubble:
      'bg-purple-50 dark:bg-purple-500/10 text-purple-900 dark:text-purple-100 rounded-bl-md shadow-sm border border-purple-200/60 dark:border-purple-400/20',
    quote: 'text-purple-500/70 dark:text-purple-300/60 border-purple-300/50 dark:border-purple-400/20',
    name: 'text-purple-500 dark:text-purple-400',
    avatar: 'from-purple-300/50 to-violet-300/50',
    fallback: '#a855f7',
  },
  卡芙卡: 'kafka',
  Kafka: 'kafka',

  // —— 银狼 —— 灰紫色
  silverwolf: {
    bubble:
      'bg-slate-50 dark:bg-slate-700/30 text-slate-800 dark:text-slate-100 rounded-bl-md shadow-sm border border-slate-200/80 dark:border-slate-500/30',
    quote: 'text-slate-500/70 dark:text-slate-300/60 border-slate-300/60 dark:border-slate-500/30',
    name: 'text-slate-500 dark:text-slate-300',
    avatar: 'from-slate-300/50 to-indigo-300/50',
    fallback: '#64748b',
  },
  银狼: 'silverwolf',
  'Silver Wolf': 'silverwolf',
  SilverWolf: 'silverwolf',

  // —— 花火 —— 橙粉色
  sparkle: {
    bubble:
      'bg-orange-50 dark:bg-orange-500/10 text-orange-900 dark:text-orange-100 rounded-bl-md shadow-sm border border-orange-200/60 dark:border-orange-400/20',
    quote: 'text-orange-500/70 dark:text-orange-300/60 border-orange-300/50 dark:border-orange-400/20',
    name: 'text-orange-500 dark:text-orange-400',
    avatar: 'from-orange-200/60 to-pink-200/60',
    fallback: '#f97316',
  },
  花火: 'sparkle',
  Sparkle: 'sparkle',
  Hanabi: 'sparkle',

  // —— 刃 —— 深灰色
  blade: {
    bubble:
      'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 rounded-bl-md shadow-sm border border-zinc-300/60 dark:border-zinc-600/50',
    quote: 'text-zinc-600/70 dark:text-zinc-400/60 border-zinc-400/50 dark:border-zinc-600/50',
    name: 'text-zinc-600 dark:text-zinc-400',
    avatar: 'from-zinc-400/50 to-red-300/40',
    fallback: '#3f3f46',
  },
  刃: 'blade',
  Blade: 'blade',

  // —— 通用 AI / 默认 —— 蓝灰中性
  __default_ai__: {
    bubble:
      'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700',
    quote:
      'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700',
    name: 'text-ios-blue dark:text-ios-blue',
    avatar: 'from-ios-blue/20 to-purple-400/20',
    fallback: '#007AFF',
  },
}

export interface UiOverride {
  displayName?: string // 自定义昵称（仅 UI）
  avatarOverride?: string // 自定义头像 URL（仅 UI）
  bubbleColorKey?: string // 自定义颜色 key（仅 UI）
}

export interface ResolvedBubbleProfile {
  bubble: string
  quote: string
  name: string
  avatar: string
  fallback: string
}

let _cachedOverrides: Record<string, UiOverride> | null = null

function loadOverrides(): Record<string, UiOverride> {
  if (_cachedOverrides) return _cachedOverrides
  _cachedOverrides = (loadFromStorage(STORAGE_KEY) as Record<string, UiOverride>) || {}
  return _cachedOverrides
}

function saveOverrides(o: Record<string, UiOverride>) {
  _cachedOverrides = o
  saveToStorage(STORAGE_KEY, o)
}

/**
 * 将名字/ID 规范化：
 *  - 字符全小写 + 去空格（Kafka / 卡芙卡 / Kafka(星穹铁道) → 都能匹配）
 */
function norm(s: string): string {
  if (!s) return ''
  return String(s).toLowerCase().replace(/\s+/g, '')
}

/**
 * 解析颜色 key（可能是字符串别名），返回 ResolvedBubbleProfile
 */
function resolveColorKey(key: string | undefined | null): ResolvedBubbleProfile {
  const tbl: any = DEFAULT_BUBBLE_COLOR_PROFILES
  let k = key || '__default_ai__'
  // 解析 alias（例如 三月七: 'march7' → march7 对应真实定义）
  let depth = 0
  while (typeof tbl[k] === 'string' && depth < 4) {
    k = tbl[k]
    depth++
  }
  const def = tbl[k] || tbl.__default_ai__
  if (!def || typeof def !== 'object') return tbl.__default_ai__
  return def
}

/**
 * 查找角色默认颜色 key（按 characterId / name）
 */
function findDefaultColorKey(id: string, name: string): string {
  const tbl: any = DEFAULT_BUBBLE_COLOR_PROFILES
  const candidates = [id, name, `${id}__name__${name}`]
  for (const c of candidates) {
    if (!c) continue
    if (tbl[c]) return c
    const nc = norm(c)
    for (const k of Object.keys(tbl)) {
      if (norm(k) === nc) return k
    }
  }
  return '__default_ai__'
}

/**
 * 角色 UI 配置注册表（所有 UI 只读这里，历史消息立即刷新）
 */
export class CharacterUiRegistry {
  private listeners = new Set<() => void>()

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l()
      } catch {
        /* ignore */
      }
    })
  }

  getOverride(characterId: string): UiOverride {
    if (!characterId) return {}
    const o = loadOverrides()
    return { ...(o[characterId] || {}) }
  }

  setOverride(characterId: string, patch: UiOverride) {
    if (!characterId) return
    const o = loadOverrides()
    const next = { ...(o[characterId] || {}), ...patch }
    // 清 undefined
    Object.keys(next).forEach((k) => {
      if ((next as any)[k] === undefined || (next as any)[k] === null || (next as any)[k] === '') {
        delete (next as any)[k]
      }
    })
    if (Object.keys(next).length === 0) {
      delete o[characterId]
    } else {
      o[characterId] = next
    }
    saveOverrides(o)
    this.notify()
  }

  clearOverride(characterId: string) {
    this.setOverride(characterId, {
      displayName: undefined,
      avatarOverride: undefined,
      bubbleColorKey: undefined,
    })
  }

  /**
   * 获取最终显示名（覆盖优先，否则用原名）
   */
  resolveDisplayName(characterId: string, fallbackName: string): string {
    if (!fallbackName) return ''
    const o = this.getOverride(characterId)
    if (o.displayName) return o.displayName
    return fallbackName
  }

  /**
   * 获取最终头像（覆盖优先，否则返回 null → 让调用方回退到默认 avatar）
   */
  resolveAvatar(characterId: string, fallbackAvatar: string | null | undefined): string | null {
    const o = this.getOverride(characterId)
    if (o.avatarOverride) return o.avatarOverride
    return fallbackAvatar || null
  }

  /**
   * 获取最终气泡颜色配置（用户设置自定义 key > 角色默认 key）
   */
  resolveBubble(characterId: string, characterName: string, isUser: boolean): ResolvedBubbleProfile {
    if (isUser) return resolveColorKey('__user__')
    const o = this.getOverride(characterId)
    const key = o.bubbleColorKey || findDefaultColorKey(characterId, characterName)
    return resolveColorKey(key)
  }

  /**
   * 列出所有可用颜色 profile key（给角色设置下拉选使用）
   */
  listColorKeys(): Array<{ key: string; label: string; preview: string }> {
    return [
      { key: 'firefly', label: '流萤（白色）', preview: '#ffffff' },
      { key: 'march7', label: '三月七（粉色）', preview: '#ec4899' },
      { key: 'robin', label: '知更鸟（淡金色）', preview: '#f59e0b' },
      { key: 'kafka', label: '卡芙卡（紫色）', preview: '#a855f7' },
      { key: 'silverwolf', label: '银狼（灰紫色）', preview: '#64748b' },
      { key: 'sparkle', label: '花火（橙粉色）', preview: '#f97316' },
      { key: 'blade', label: '刃（深灰色）', preview: '#3f3f46' },
      { key: '__default_ai__', label: 'AI 默认（蓝灰中性）', preview: '#007AFF' },
    ]
  }
}

// 单例
const _uiRegistry = new CharacterUiRegistry()

export function getCharacterUiRegistry(): CharacterUiRegistry {
  return _uiRegistry
}

/** Hook 友好的便捷函数 */
export function resolveCharacterUi(
  characterId: string | null | undefined,
  characterName: string,
  baseAvatar: string | null | undefined,
  isUser = false,
): {
  displayName: string
  avatar: string | null
  bubble: ResolvedBubbleProfile
} {
  if (isUser) {
    return {
      displayName: '我',
      avatar: baseAvatar || null,
      bubble: resolveColorKey('__user__'),
    }
  }
  const reg = getCharacterUiRegistry()
  return {
    displayName: reg.resolveDisplayName(characterId || '', characterName || ''),
    avatar: reg.resolveAvatar(characterId || '', baseAvatar),
    bubble: reg.resolveBubble(characterId || '', characterName, false),
  }
}
