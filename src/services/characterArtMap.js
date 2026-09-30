/**
 * characterArtMap — 角色立绘映射服务（纯视觉层）
 *
 * 职责：
 * 1. 根据「角色ID + 情绪 key」构建候选映射键，如 firefly_happy / firefly_shy。
 * 2. 按优先级查找用户上传的立绘：
 *      第一优先级：角色ID_情绪（如 firefly_happy）
 *      第二优先级：角色ID_default（默认立绘）
 *      第三优先级：角色ID（兜底立绘）
 * 3. 持久化「角色ID_情绪 → 图片」映射。
 * 4. 提供订阅机制，驱动 CharacterArt / 上传面板实时响应。
 *
 * 【底线】只做立绘映射，绝不解析 AI 文本，不改写聊天/角色状态/记忆逻辑。
 */

import { loadFromStorage, saveToStorage } from './storage'

const STORAGE_KEY = 'ai-chat-character-arts'

let artMap = loadFromStorage(STORAGE_KEY) || {}
const listeners = new Set()

function notify() {
  listeners.forEach((l) => l())
}

/** 当前全部映射：{ [characterId_emotion]: dataUrlOrSrc } */
export function getCharacterArts() {
  return artMap
}

/** 设置某角色+情绪的立绘（src 为空则删除） */
export function setCharacterArt(key, src) {
  const next = { ...artMap }
  if (src) {
    next[key] = src
  } else {
    delete next[key]
  }
  artMap = next
  saveToStorage(STORAGE_KEY, next)
  notify()
  return next
}

/** 删除某角色+情绪的立绘 */
export function removeCharacterArt(key) {
  return setCharacterArt(key, null)
}

export function subscribeCharacterArts(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 根据角色ID + 情绪 key 构建候选立绘键（优先在前）。
 */
export function buildCharacterArtKeys(characterId, emotionKey) {
  const keys = []
  const cid = (characterId || '').trim()
  const emo = (emotionKey || '').trim()

  if (cid && emo) keys.push(`${cid}_${emo}`)
  if (cid) keys.push(`${cid}_default`)
  if (cid) keys.push(cid)

  return keys
}

/**
 * 查找匹配的角色立绘。返回 { key, src } 或 null。
 */
export function resolveCharacterArt(characterId, emotionKey) {
  const keys = buildCharacterArtKeys(characterId, emotionKey)
  for (const key of keys) {
    const src = artMap[key]
    if (src) return { key, src }
  }
  return null
}