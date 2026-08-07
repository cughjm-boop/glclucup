/**
 * multiCharacterSlice — 为 useStore（Zustand）提供的多人聊天切片
 *
 * 本切片将 MultiCharacterEngine V2 接入现有 Zustand store，
 * 实现：多人模式开关、角色召唤/遣散、切换多人模式时正确清理。
 */

import { MultiCharacterEngine, type SummonResult, type DismissResult } from './MultiCharacterEngine'

/** 切片状态扩展 */
export interface MultiCharacterSliceState {
  /** 当前多人会话引擎实例（按 characterId 动态创建） */
  mceEngines: Record<string, MultiCharacterEngine>
  /** 当前激活的多人会话 ID */
  activeMceConversationId: string | null
  /** 多人模式开关 */
  isMultiCharacterMode: boolean
}

/** 切片动作 */
export interface MultiCharacterSliceActions {
  /** 开启多人模式 */
  enableMultiCharacter: (conversationId: string) => void
  /** 关闭多人模式（清理并遣散所有角色） */
  disableMultiCharacter: () => void
  /** 切换多人模式（带清理） */
  toggleMultiCharacter: (conversationId: string) => void
  /** 召唤角色 */
  summonCharacterInSession: (conversationId: string, opts: {
    characterId: string
    characterName: string
    profile?: Record<string, unknown>
    position?: string
    action?: string
  }) => SummonResult
  /** 遣散角色 */
  dismissCharacterInSession: (conversationId: string, characterId: string) => DismissResult
  /** 遣散所有 */
  dismissAllInSession: (conversationId: string) => DismissResult[]
  /** 获取引擎（不存在则自动创建） */
  getMceEngine: (conversationId: string) => MultiCharacterEngine
  /** 销毁引擎 */
  disposeMceEngine: (conversationId: string) => void
  /** 清理全部引擎（彻底卸载时调用） */
  disposeAllMceEngines: () => void
}

export type MultiCharacterSlice = MultiCharacterSliceState & MultiCharacterSliceActions

/** 创建 MCE 切片（供 zustand create 合并使用） */
export const multiCharacterSlice = (set: any, get: any): MultiCharacterSlice => ({
  mceEngines: {},
  activeMceConversationId: null,
  isMultiCharacterMode: false,

  enableMultiCharacter: (conversationId: string) => {
    const { mceEngines } = get()
    if (!mceEngines[conversationId]) {
      const engine = new MultiCharacterEngine({ conversationId })
      set({ mceEngines: { ...mceEngines, [conversationId]: engine } })
    }
    set({ isMultiCharacterMode: true, activeMceConversationId: conversationId })
  },

  disableMultiCharacter: () => {
    const { activeMceConversationId, mceEngines } = get()
    if (activeMceConversationId && mceEngines[activeMceConversationId]) {
      const engine = mceEngines[activeMceConversationId]
      engine.dispose()
      const newEngines = { ...mceEngines }
      delete newEngines[activeMceConversationId]
      set({ mceEngines: newEngines })
    }
    set({ isMultiCharacterMode: false, activeMceConversationId: null })
  },

  toggleMultiCharacter: (conversationId: string) => {
    const { isMultiCharacterMode, activeMceConversationId } = get()
    if (isMultiCharacterMode && activeMceConversationId === conversationId) {
      get().disableMultiCharacter()
    } else {
      get().enableMultiCharacter(conversationId)
    }
  },

  summonCharacterInSession: (conversationId, opts) => {
    const engine = get().getMceEngine(conversationId)
    const result = engine.summonCharacter(opts)
    return result
  },

  dismissCharacterInSession: (conversationId, characterId) => {
    const engine = get().getMceEngine(conversationId)
    return engine.dismissCharacter(characterId)
  },

  dismissAllInSession: (conversationId) => {
    const engine = get().getMceEngine(conversationId)
    return engine.dismissAll()
  },

  getMceEngine: (conversationId) => {
    const { mceEngines } = get()
    if (!mceEngines[conversationId]) {
      const engine = new MultiCharacterEngine({ conversationId })
      set({ mceEngines: { ...mceEngines, [conversationId]: engine } })
    }
    return get().mceEngines[conversationId]
  },

  disposeMceEngine: (conversationId) => {
    const { mceEngines } = get()
    if (mceEngines[conversationId]) {
      mceEngines[conversationId].dispose()
      const newEngines = { ...mceEngines }
      delete newEngines[conversationId]
      set({ mceEngines: newEngines })
    }
    if (get().activeMceConversationId === conversationId) {
      set({ activeMceConversationId: null, isMultiCharacterMode: false })
    }
  },

  disposeAllMceEngines: () => {
    const { mceEngines } = get()
    Object.values(mceEngines).forEach((engine: MultiCharacterEngine) => engine.dispose())
    set({ mceEngines: {}, activeMceConversationId: null, isMultiCharacterMode: false })
  },
})
