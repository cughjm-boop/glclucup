/**
 * SceneSnapshot — 场景快照（Chat Scene Engine V3）
 *
 * 每轮聊天结束自动保存场景快照（版本号+角色位置+时间）。
 * 恢复聊天时直接恢复场景状态。
 * 场景不再依赖聊天记录，作为独立运行时状态参与 Prompt 生成。
 */

import type { SceneState, SceneChangeEntry } from './SceneManager'
import { getSceneManager, initSceneManager, DEFAULT_SCENE } from './SceneManager'

// ===== 存储键定义 =====

const SCENE_SNAPSHOT_PREFIX = 'scene_snapshot_v3_'
const SCENE_HISTORY_PREFIX = 'scene_history_v3_'

// ===== 快照接口 =====

export interface SceneSnapshotData {
  /** 场景状态 */
  scene: SceneState
  /** 场景历史 */
  history: SceneChangeEntry[]
  /** 保存时间 */
  savedAt: number
  /** 关联的角色 ID */
  characterId: string
}

// ===== 快照管理 =====

export class SceneSnapshot {
  /**
   * 保存场景快照到 localStorage
   */
  static save(characterId: string): boolean {
    try {
      const manager = getSceneManager(characterId)
      const snapshot: SceneSnapshotData = {
        scene: { ...manager.getSnapshot() },
        history: [...manager.getHistory()],
        savedAt: Date.now(),
        characterId,
      }

      const key = SCENE_SNAPSHOT_PREFIX + characterId
      localStorage.setItem(key, JSON.stringify(snapshot))
      return true
    } catch (err) {
      console.error('[SceneSnapshot] 保存快照失败:', err)
      return false
    }
  }

  /**
   * 从 localStorage 恢复场景快照
   */
  static restore(characterId: string): boolean {
    try {
      const key = SCENE_SNAPSHOT_PREFIX + characterId
      const raw = localStorage.getItem(key)
      if (!raw) return false

      const snapshot: SceneSnapshotData = JSON.parse(raw)
      if (!snapshot.scene || !snapshot.characterId) return false

      // 恢复场景状态
      const manager = initSceneManager(characterId, snapshot.scene)
      return true
    } catch (err) {
      console.error('[SceneSnapshot] 恢复快照失败:', err)
      return false
    }
  }

  /**
   * 检查是否存在场景快照
   */
  static hasSnapshot(characterId: string): boolean {
    const key = SCENE_SNAPSHOT_PREFIX + characterId
    return localStorage.getItem(key) !== null
  }

  /**
   * 删除场景快照
   */
  static delete(characterId: string): void {
    try {
      const key = SCENE_SNAPSHOT_PREFIX + characterId
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }

  /**
   * 获取场景快照数据（不恢复）
   */
  static getSnapshotData(characterId: string): SceneSnapshotData | null {
    try {
      const key = SCENE_SNAPSHOT_PREFIX + characterId
      const raw = localStorage.getItem(key)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  /**
   * 保存场景历史到 localStorage（独立存储，用于调试）
   */
  static saveHistory(characterId: string): boolean {
    try {
      const manager = getSceneManager(characterId)
      const history = [...manager.getHistory()]
      const key = SCENE_HISTORY_PREFIX + characterId
      localStorage.setItem(key, JSON.stringify(history))
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取场景历史
   */
  static getHistory(characterId: string): SceneChangeEntry[] {
    try {
      const key = SCENE_HISTORY_PREFIX + characterId
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }
}

/**
 * 迁移旧版场景数据（从 currentScene + characterState 合并到 V3）
 */
export function migrateLegacyScene(
  characterId: string,
  legacyScene: { name: string; items: string[]; timestamp: number },
  legacyState: { position: string; action: string; clothing: string }
): boolean {
  try {
    const location = legacyScene?.name || DEFAULT_SCENE.location
    const objects = (legacyScene?.items || []).map((name) => ({
      name,
      addedBy: 'system' as const,
      addedAt: legacyScene?.timestamp || Date.now(),
    }))

    const characters = legacyState?.position
      ? [
          {
            characterId,
            position: legacyState.position,
            action: legacyState.action || '',
            facing: '',
          },
        ]
      : []

    const initialScene: Partial<SceneState> = {
      location,
      interactableObjects: objects,
      characters,
      updatedAt: Date.now(),
    }

    initSceneManager(characterId, initialScene)
    SceneSnapshot.save(characterId)
    return true
  } catch (err) {
    console.error('[SceneSnapshot] 迁移旧版场景失败:', err)
    return false
  }
}