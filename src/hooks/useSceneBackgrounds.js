import { useSyncExternalStore } from 'react'
import {
  getSceneBackgrounds,
  subscribeSceneBackgrounds,
} from '../services/sceneImageMap'

/**
 * useSceneBackgrounds — 订阅场景背景图映射（纯视觉层）
 * 变化时自动触发 React 重渲染。
 */
export function useSceneBackgrounds() {
  return useSyncExternalStore(
    subscribeSceneBackgrounds,
    getSceneBackgrounds,
    getSceneBackgrounds,
  )
}