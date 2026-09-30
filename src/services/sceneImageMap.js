/**
 * sceneImageMap — 场景图片映射服务（纯视觉层）
 *
 * 分层存储：
 *  - IndexedDB 持久化：大容量 base64 背景图，App 重启不丢失。
 *  - 内存 cache：懒加载，只加载「当前场景」实际需要的背景图。
 *
 * 职责：
 * 1. 读取权威场景状态（location / area / timePeriod），构建「场景ID」键。
 * 2. 按优先级查找用户自定义的场景背景图：
 *      第一优先级：location_area_timePeriod（如 流萤家_客厅_晚上）
 *      第二优先级：location_area（如 流萤家_客厅）
 *      第三优先级：location（如 流萤家）
 * 3. 提供订阅机制，驱动 VisualLayer / SceneBackgroundPanel 实时响应；支持释放内存缓存。
 *
 * 【底线】本模块只做图片映射，绝不解析 AI 文本，绝不改写聊天/场景/记忆逻辑。
 */

import { loadFromStorage, removeFromStorage } from './storage'
import {
  imageStoreGet,
  imageStoreSet,
  imageStoreDelete,
  imageStoreKeys,
} from './imageStore'

const PREFIX = 'scene:'
const LEGACY_KEY = 'ai-chat-scene-backgrounds' // 旧版 localStorage 骨架残留，仅用于一次性迁移

// —— 内存索引（仅 key 字符串，轻量）——
let keys = new Set()
// —— 内存缓存（已加载的 key -> dataUrl，懒加载）——
let cache = new Map()
// —— 供 useSyncExternalStore 读取的稳定快照 ——
let state = { keys: [], entries: {} }
const listeners = new Set()

let releasedRev = 0

let indexReady = false
let indexPromise = null

function rebuildState() {
  state = { keys: [...keys], entries: Object.fromEntries(cache) }
}

function notify() {
  rebuildState()
  listeners.forEach((l) => l())
}

function rawOf(key) {
  return PREFIX + key
}
function keyOf(raw) {
  return raw.slice(PREFIX.length)
}

async function ensureIndex() {
  if (indexReady) return
  if (!indexPromise) {
    indexPromise = imageStoreKeys(PREFIX)
      .then((list) => {
        const idbKeys = new Set((Array.isArray(list) ? list : []).map(keyOf))
        keys = new Set([...keys, ...idbKeys])
        indexReady = true
        notify()
      })
      .catch(() => {
        indexReady = true
      })
  }
  return indexPromise
}

/** 一次性迁移旧版 localStorage 数据 → IndexedDB。 */
function migrateLegacy() {
  try {
    const legacy = loadFromStorage(LEGACY_KEY)
    if (!legacy || typeof legacy !== 'object') return
    const entries = Object.entries(legacy)
    if (entries.length === 0) return
    for (const [rawKey, src] of entries) {
      if (typeof src === 'string' && src && !cache.has(rawKey)) {
        cache.set(rawKey, src)
        keys.add(rawKey)
        imageStoreSet(PREFIX + rawKey, src).catch(() => {})
      }
    }
    removeFromStorage(LEGACY_KEY)
    notify()
  } catch { /* ignore */ }
}

migrateLegacy()
ensureIndex()

/** 当前已绑定 key 列表（仅字符串）。 */
export function getSceneBackgroundKeys() {
  return state.keys
}

/** 当前已加载背景图映射（懒加载后的缓存快照）。 */
export function getSceneBackgrounds() {
  return state.entries
}

/** 供 useSyncExternalStore 使用的稳定快照。 */
export function getSceneBackgroundsState() {
  return state
}

/** 读取单个 key 的缓存（已加载则返回，否则 null）。 */
export function getCachedSceneBackground(key) {
  return cache.get(key) || null
}

/** 懒加载单个 key 的场景背景，返回 dataUrl 或 null。 */
export async function ensureSceneBackground(key) {
  if (!key) return null
  if (cache.has(key)) return cache.get(key)
  const rev = releasedRev
  const src = await imageStoreGet(rawOf(key))
  if (rev !== releasedRev) return null
  if (typeof src === 'string' && src) {
    cache.set(key, src)
    keys.add(key)
    notify()
  }
  return cache.get(key) || null
}

/** 设置（或删除，src 为空时删除）某场景ID的图片。 */
export async function setSceneBackground(key, src) {
  if (!key) return
  if (src) {
    await imageStoreSet(rawOf(key), src)
    keys.add(key)
    cache.set(key, src)
  } else {
    await imageStoreDelete(rawOf(key))
    keys.delete(key)
    cache.delete(key)
  }
  indexReady = true
  notify()
}

/** 删除某场景ID的图片。 */
export function removeSceneBackground(key) {
  return setSceneBackground(key, null)
}

export function subscribeSceneBackgrounds(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 释放内存缓存（仅清 cache，索引与 IndexedDB 数据保留）。 */
export function releaseSceneBackgroundCache() {
  releasedRev += 1
  cache = new Map()
  notify()
}

/**
 * 根据场景状态构建候选「场景ID」键（优先在前）。
 * 例：location=流萤家, area=客厅, timePeriod=晚上
 *   → ['流萤家_客厅_晚上', '流萤家_客厅', '流萤家']
 */
export function buildSceneKeys(location, area, timePeriod) {
  const keysOut = []
  const loc = (location || '').trim()
  const ar = (area || '').trim()
  const tm = (timePeriod || '').trim()

  if (loc && ar && tm) keysOut.push(`${loc}_${ar}_${tm}`)
  if (loc && ar) keysOut.push(`${loc}_${ar}`)
  if (loc) keysOut.push(loc)

  return keysOut
}

/**
 * 生成「场景ID」的主键（用于 UI 上传绑定 —— 默认绑定到「地点_区域」）。
 */
export function buildPrimarySceneKey(location, area) {
  const loc = (location || '').trim()
  const ar = (area || '').trim()
  if (loc && ar) return `${loc}_${ar}`
  return loc || ''
}

/**
 * 同步解析当前场景应显示的背景图（按优先级读内存缓存）。
 * 未加载到任何背景图时返回 null（由渲染层降级为深灰渐变占位）。
 * 注意：懒加载由 ensureSceneBackground 异步触发；本函数只读缓存，不触发 IO。
 */
export function resolveSceneImage(location, area, timePeriod) {
  for (const key of buildSceneKeys(location, area, timePeriod)) {
    const src = cache.get(key)
    if (typeof src === 'string' && src) return { key, src }
  }
  return null
}