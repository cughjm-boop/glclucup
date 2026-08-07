/**
 * useMultiCharacterCoordinator — React Hook
 *
 * 在组件中使用 V5 多人聊天协调器。
 * 提供：activeCharacters、runtime、processUserMessage、processAIReply 等。
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  MultiCharacterCoordinator,
  type CoordinatorConfig,
  type ProcessUserMessageResult,
} from './MultiCharacterCoordinator'
import type { ConversationRuntime } from '../dispatcher/ConversationRuntime'

export function useMultiCharacterCoordinator(config: CoordinatorConfig) {
  const coordinatorRef = useRef<MultiCharacterCoordinator | null>(null)
  const [runtime, setRuntime] = useState<ConversationRuntime | null>(null)
  const [activeCharacters, setActiveCharacters] = useState<string[]>([])
  const [systemMessages, setSystemMessages] = useState<Array<{ id: string; text: string }>>([])

  // 初始化协调器
  useEffect(() => {
    if (!config.characterId) return

    const coordinator = MultiCharacterCoordinator.get(config)
    coordinatorRef.current = coordinator
    setRuntime(coordinator.getRuntime())
    setActiveCharacters(coordinator.getActiveCharacters())

    // 订阅 Runtime 变更
    const unsub = coordinator.subscribe((rt) => {
      setRuntime({ ...rt })
      setActiveCharacters(coordinator.getActiveCharacters())
    })

    return () => {
      unsub()
    }
  }, [config.characterId])

  /** 处理用户消息 */
  const processUserMessage = useCallback(
    (message: string): ProcessUserMessageResult => {
      const coordinator = coordinatorRef.current
      if (!coordinator) {
        return {
          type: 'error',
          error: '协调器未初始化',
          activeCharacters: [],
          runtime: null as unknown as ConversationRuntime,
        }
      }

      const result = coordinator.processUserMessage(message)

      // 收集系统消息
      if (result.systemMessage) {
        setSystemMessages((prev) => [
          ...prev,
          { id: `sys_${Date.now()}_${Math.random()}`, text: result.systemMessage! },
        ])
      }

      return result
    },
    [],
  )

  /** 处理 AI 回复 */
  const processAIReply = useCallback((reply: string) => {
    const coordinator = coordinatorRef.current
    if (!coordinator) return null
    return coordinator.processAIReply(reply)
  }, [])

  /** 清空系统消息 */
  const clearSystemMessages = useCallback(() => {
    setSystemMessages([])
  }, [])

  return useMemo(
    () => ({
      runtime,
      activeCharacters,
      systemMessages,
      processUserMessage,
      processAIReply,
      clearSystemMessages,
    }),
    [runtime, activeCharacters, systemMessages, processUserMessage, processAIReply, clearSystemMessages],
  )
}
