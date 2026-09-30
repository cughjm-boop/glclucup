/**
 * sceneImageMap — 场景图片映射服务（纯视觉层）
 *
 * 职责：
 * 1. 读取权威场景状态（location / area / timePeriod），构建「场景ID」键。
 * 2. 按优先级查找用户自定义的场景背景图：
 *      第一优先级：location_area_timePeriod（如 流萤家_客厅_晚上）
 *      第二优先级：location_area（如 流萤家_客厅）
 *      第三优先级：location（如 流萤家）
 * 3. 持久化用户上传的「场景ID → 图片」映射（localStorage）。
 * 4. 提供订阅机制，便于 VisualLayer / SceneBackgroundPanel 实时响应变化。
 *
 * 【底线】本模块只做图片映射，绝不解析 AI 文本，绝不改写聊天/场景/记忆逻辑。
 */

import { loadFromStorage, saveToStorage } from './storage'

const STORAGE_KEY = 'ai-chat-scene-backgrounds'

// 模块级映射快照（引用每次整体替换，保证 useSyncExternalStore 快照稳定）
let sceneMap = loadFromStorage(STORAGE_KEY) || {}
const listeners = new Set()

function notify() {
  listeners.forEach((l) => l())
}

/** 当前全部映射：{ [sceneKey]: dataUrlOrSrc } */
export function getSceneBackgrounds() {
  return sceneMap
}

/** 设置某场景ID的图片（src 为空则删除） */
export function setSceneBackground(key, src) {
  const next = { ...sceneMap }
  if (src) {
    next[key] = src
  } else {
    delete next[key]
  }
  sceneMap = next
  saveToStorage(STORAGE_KEY, next)
  notify()
  return next
}

/** 删除某场景ID的图片 */
export function removeSceneBackground(key) {
  return setSceneBackground(key, null)
}

export function subscribeSceneBackgrounds(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 根据场景状态构建候选「场景ID」键（优先在前）。
 * 例：location=流萤家, area=客厅, timePeriod=晚上
 *   → ['流萤家_客厅_晚上', '流萤家_客厅', '流萤家']
 */
export function buildSceneKeys(location, area, timePeriod) {
  const keys = []
  const loc = (location || '').trim()
  const ar = (area || '').trim()
  const tm = (timePeriod || '').trim()

  if (loc && ar && tm) keys.push(`${loc}_${ar}_${tm}`)
  if (loc && ar) keys.push(`${loc}_${ar}`)
  if (loc) keys.push(loc)

  return keys
}

/**
 * 查找匹配的场景背景图。
 * 返回 { key, src } 或 null（未匹配到任何自定义映射）。
 */
export function resolveSceneImage(location, area, timePeriod) {
  const keys = buildSceneKeys(location, area, timePeriod)
  for (const key of keys) {
    const src = sceneMap[key]
    if (src) return { key, src }
  }
  return null
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