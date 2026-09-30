import { useSyncExternalStore } from 'react'
import {
  getCharacterArts,
  subscribeCharacterArts,
} from '../services/characterArtMap'

/**
 * useCharacterArts — 订阅角色立绘映射（纯视觉层）
 */
export function useCharacterArts() {
  return useSyncExternalStore(
    subscribeCharacterArts,
    getCharacterArts,
    getCharacterArts,
  )
}