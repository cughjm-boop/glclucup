/**
 * characterArtMap — 角色立绘映射服务（纯视觉层）
 *
 * 分层存储：
 *  - IndexedDB 持久化：大容量 base64 图片，App 重启不丢失。
 *  - 内存 cache：懒加载，只加载「当前角色 / 当前情绪」实际需要的立绘。
 *
 * 职责：
 * 1. 根据「角色ID + 情绪 key」构建候选映射键，如 firefly_happy / firefly_shy。
 * 2. 按优先级查找立绘：角色ID_情绪 → 角色ID_default → 角色ID。
 * 3. 提供订阅机制，驱动 CharacterArt / 上传面板实时响应；支持释放内存缓存。
 *
 * 【底线】只做立绘存取与映射，绝不解析 AI 文本，不改写聊天/角色状态/记忆逻辑。
 */

import { loadFromStorage, removeFromStorage } from './storage'
import {
  imageStoreGet,
  imageStoreSet,
  imageStoreDelete,
  imageStoreKeys,
} from './imageStore'

const PREFIX = 'art:'
const LEGACY_KEY = 'ai-chat-character-arts' // 旧版 localStorage 骨架残留，仅用于一次性迁移

// —— 内存索引（仅 key 字符串，轻量）——
let keys = new Set()
// —— 内存缓存（已加载的 key -> dataUrl，懒加载）——
let cache = new Map()
// —— 供 useSyncExternalStore 读取的稳定快照 ——
let state = { keys: [], entries: {} }
const listeners = new Set()

// 每次 release 递增，丢弃「release 前发出、release 后才返回」的陈旧加载结果
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

/** 一次性迁移旧版 localStorage 数据 → IndexedDB（仅在内存无对应数据时导入）。 */
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

// —— 模块加载时启动：先迁移旧数据，再拉取索引（仅 key 字符串，不加载图片数据）——
migrateLegacy()
ensureIndex()

/** 当前已绑定 key 列表（仅字符串）。 */
export function getCharacterArtKeys() {
  return state.keys
}

/** 当前已加载立绘映射（懒加载后的缓存快照）。 */
export function getCharacterArts() {
  return state.entries
}

/** 供 useSyncExternalStore 使用的稳定快照。 */
export function getCharacterArtsState() {
  return state
}

/** 读取单个 key 的缓存（已加载则返回，否则 null）。 */
export function getCachedCharacterArt(key) {
  return cache.get(key) || null
}

/** 懒加载单个 key 的立绘，返回 dataUrl 或 null。 */
export async function ensureCharacterArt(key) {
  if (!key) return null
  if (cache.has(key)) return cache.get(key)
  const rev = releasedRev
  const src = await imageStoreGet(rawOf(key))
  if (rev !== releasedRev) return null // 期间发生过 release，丢弃陈旧结果
  if (typeof src === 'string' && src) {
    cache.set(key, src)
    keys.add(key)
    notify()
  }
  return cache.get(key) || null
}

/** 设置（或删除，src 为空时删除）某角色+情绪的立绘。 */
export async function setCharacterArt(key, src) {
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

/** 删除某角色+情绪的立绘。 */
export function removeCharacterArt(key) {
  return setCharacterArt(key, null)
}

export function subscribeCharacterArts(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 释放内存缓存（仅清 cache，索引与 IndexedDB 数据保留；离开聊天界面时调用）。 */
export function releaseCharacterArtCache() {
  releasedRev += 1
  cache = new Map()
  notify()
}

/**
 * 根据角色ID + 情绪 key 构建候选立绘键（优先在前）。
 */
export function buildCharacterArtKeys(characterId, emotionKey) {
  const keysOut = []
  const cid = (characterId || '').trim()
  const emo = (emotionKey || '').trim()

  if (cid && emo) keysOut.push(`${cid}_${emo}`)
  if (cid) keysOut.push(`${cid}_default`)
  if (cid) keysOut.push(cid)

  return keysOut
}

/**
 * 同步解析当前角色 + 情绪应显示的立绘（按优先级读内存缓存）。
 * 未加载到任何立绘时返回 null（由渲染层降级为剪影占位）。
 * 注意：懒加载由 ensureCharacterArt 异步触发；本函数只读缓存，不触发 IO。
 */
export function resolveCharacterArt(characterId, emotionKey) {
  for (const key of buildCharacterArtKeys(characterId, emotionKey)) {
    const src = cache.get(key)
    if (typeof src === 'string' && src) return { key, src }
  }
  return null
}