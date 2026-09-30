/**
 * imageStore — 大容量图片持久化存储（纯视觉层）
 *
 * 用 IndexedDB 存储用户上传的 base64 图片（角色立绘 / 场景背景），
 * 解决 localStorage 5MB 上限导致「超限写入静默失败 → 重启后图片丢失」的问题。
 *
 * - 提供 Promise 化的 get / set / delete / keys(前缀) 接口。
 * - IndexedDB 不可用（异常环境）时降级为内存 Map：不崩溃、可正常显示，仅不持久化。
 *
 * 【底线】本模块只做图片存取，不触碰聊天/记忆/场景引擎逻辑。
 */

const DB_NAME = 'ai-chat-image-store'
const DB_VERSION = 1
const STORE_NAME = 'images'

let dbPromise = null
const memoryFallback = new Map() // IndexedDB 不可用时的降级缓存

function openDB() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let req
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME) // out-of-line keys
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })

  return dbPromise
}

function withStore(mode, fn) {
  return openDB().then((db) => {
    if (!db) return null
    return new Promise((resolve) => {
      let tx
      try {
        tx = db.transaction(STORE_NAME, mode)
      } catch {
        resolve(null)
        return
      }
      const store = tx.objectStore(STORE_NAME)
      let req
      try {
        req = fn(store)
      } catch {
        resolve(null)
        return
      }
      let result = null
      req.onsuccess = () => {
        result = req.result
      }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
    })
  })
}

/** 读取单个 key 对应的 dataUrl（不存在返回 null） */
export async function imageStoreGet(key) {
  if (typeof indexedDB === 'undefined') return memoryFallback.get(key) || null
  return withStore('readonly', (s) => s.get(key))
}

/** 写入（覆盖）单个 key 的 dataUrl */
export async function imageStoreSet(key, value) {
  memoryFallback.set(key, value)
  if (typeof indexedDB === 'undefined') return
  await withStore('readwrite', (s) => s.put(value, key))
}

/** 删除单个 key */
export async function imageStoreDelete(key) {
  memoryFallback.delete(key)
  if (typeof indexedDB === 'undefined') return
  await withStore('readwrite', (s) => s.delete(key))
}

/** 列出某个前缀下的所有 key（仅 key 字符串，不加载图片数据） */
export async function imageStoreKeys(prefix = '') {
  if (typeof indexedDB === 'undefined') {
    return [...memoryFallback.keys()].filter((k) => k.startsWith(prefix))
  }
  const keys = await withStore('readonly', (s) => s.getAllKeys())
  return (Array.isArray(keys) ? keys : []).filter((k) => k.startsWith(prefix))
}