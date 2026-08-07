/**
 * Chat Scene Engine V3 — 场景管理系统
 *
 * 模块导出：
 *   SceneManager   — 场景状态管理器
 *   SceneValidator  — 场景校验器
 *   SceneUpdater   — 场景更新器
 *   SceneSnapshot  — 场景快照
 *   ReplyValidator  — 回复校验器
 */

export { SceneManager, getSceneManager, initSceneManager, disposeSceneManager, DEFAULT_SCENE } from './SceneManager'
export type {
  SceneState,
  CharacterPosition,
  InteractableObject,
  SceneChangeEntry,
  SceneUpdateCommand,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './SceneManager'

export { SceneValidator, sceneValidator } from './SceneValidator'
export { SceneUpdater, getSceneUpdater, disposeSceneUpdater } from './SceneUpdater'
export { SceneSnapshot, migrateLegacyScene } from './SceneSnapshot'
export type { SceneSnapshotData } from './SceneSnapshot'

export { ReplyValidator, replyValidator } from './ReplyValidator'
export type { ReplyValidationResult, CharacterValidationResult } from './ReplyValidator'