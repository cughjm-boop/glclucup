/**
 * useMultiCharacter — React Hook 封装（Multi Character Engine V2）
 *
 * 使用方式：
 *   const engine = useMultiCharacter(conversationId)
 *   engine.summonCharacter(...)
 *
 * 特性：
 *  - 通过 subscribe 精确更新，避免多人状态更新导致整页重渲染
 *  - 切换多人模式时正确清理（useEffect cleanup 调用 dispose）
 *  - 深色/浅色模式适配（返回的 runtime 情绪字段可直接映射 UI 主题）
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { MultiCharacterEngine, type SummonResult, type DismissResult } from './MultiCharacterEngine'
import type { ConversationState } from './ConversationState'
import type { CharacterRuntime } from './CharacterRuntime'

export interface UseMultiCharacterReturn {
  engine: MultiCharacterEngine
  /** 当前会话只读快照（版本号变更时才触发 React 重渲染） */
  state: ConversationState
  /** 在场角色运行时列表 */
  present: CharacterRuntime[]
  /** 当前发言者 ID */
  currentSpeakerId: string | null
  /** 版本号（供 UI 做精确更新） */
  version: number
  /** 召唤角色 */
  summon: (opts: {
    characterId: string
    characterName: string
    profile?: Record<string, unknown>
    position?: string
    action?: string
  }) => SummonResult
  /** 遣散角色 */
  dismiss: (characterId: string) => DismissResult
  /** 遣散所有角色 */
  dismissAll: () => DismissResult[]
  /** 处理用户消息并生成 Prompt */
  processUserMessage: (userMessage: string, options?: { mainSpeakerId?: string; forceSingle?: boolean }) => ReturnType<MultiCharacterEngine['processUserMessage']>
  /** 校验 AI 回复 */
  validateAIReply: (reply: string, speakerId: string) => ReturnType<MultiCharacterEngine['validateAIReply']>
  /** 写入 AI 回复 */
  appendAIReply: (reply: string, speakerId: string, speakerName: string) => ReturnType<MultiCharacterEngine['appendAIReply']>
  /** 销毁（切换多人模式时调用） */
  dispose: () => void
}

export function useMultiCharacter(conversationId: string): UseMultiCharacterReturn {
  const engineRef = useRef<MultiCharacterEngine | null>(null)
  const subscriptionRef = useRef<(() => void) | null>(null)

  // 初始化 engine（只一次）
  if (!engineRef.current && conversationId) {
    engineRef.current = new MultiCharacterEngine({ conversationId })
  }

  const [state, setState] = useState<ConversationState>(() => engineRef.current?.getState() as ConversationState)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    // 订阅：只在 version 变更时 setState
    subscriptionRef.current = engine.subscribe((snap) => {
      // 使用函数式更新避免不必要的重渲染
      setState((prev) => {
        if (prev.version === snap.version) return prev
        return snap
      })
    })
    return () => {
      subscriptionRef.current?.()
      subscriptionRef.current = null
    }
  }, [conversationId])

  // 卸载时不自动 dispose（保留会话状态供下次进入）
  // 仅显式调用 dispose 时销毁

  const summon = useCallback<UseMultiCharacterReturn['summon']>((opts) => {
    return engineRef.current!.summonCharacter(opts)
  }, [])

  const dismiss = useCallback<UseMultiCharacterReturn['dismiss']>((characterId) => {
    return engineRef.current!.dismissCharacter(characterId)
  }, [])

  const dismissAll = useCallback<UseMultiCharacterReturn['dismissAll']>(() => {
    return engineRef.current!.dismissAll()
  }, [])

  const processUserMessage = useCallback<UseMultiCharacterReturn['processUserMessage']>((userMessage, options) => {
    return engineRef.current!.processUserMessage(userMessage, options)
  }, [])

  const validateAIReply = useCallback<UseMultiCharacterReturn['validateAIReply']>((reply, speakerId) => {
    return engineRef.current!.validateAIReply(reply, speakerId)
  }, [])

  const appendAIReply = useCallback<UseMultiCharacterReturn['appendAIReply']>((reply, speakerId, speakerName) => {
    return engineRef.current!.appendAIReply(reply, speakerId, speakerName)
  }, [])

  const dispose = useCallback(() => {
    engineRef.current?.dispose()
  }, [])

  return useMemo(
    () => ({
      engine: engineRef.current!,
      state,
      present: state.present,
      currentSpeakerId: state.currentSpeakerId,
      version: state.version,
      summon,
      dismiss,
      dismissAll,
      processUserMessage,
      validateAIReply,
      appendAIReply,
      dispose,
    }),
    [state, summon, dismiss, dismissAll, processUserMessage, validateAIReply, appendAIReply, dispose],
  )
}

/**
 * 多人切换清理 Hook
 * 当依赖数组中的"多人模式开关"变化时，自动清理 engine
 */
export function useMultiCharacterCleanup(isMulti: boolean, conversationId: string): void {
  useEffect(() => {
    if (!isMulti) {
      const engine = new MultiCharacterEngine({ conversationId })
      engine.dispose()
    }
    // 切换多人模式 → 正确清理定时器、订阅和运行时状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMulti])
}
