/**
 * useConversationDispatcher — React Hook 封装（V5）
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { ConversationDispatcher } from './ConversationDispatcher'
import type { ConversationRuntime } from './ConversationRuntime'

export function useConversationDispatcher(conversationId: string) {
  const dispatcherRef = useRef<ConversationDispatcher | null>(null)
  const [runtime, setRuntime] = useState<ConversationRuntime | null>(null)
  const [systemMessages, setSystemMessages] = useState<Array<{ id: string; text: string }>>([])

  if (!dispatcherRef.current && conversationId) {
    dispatcherRef.current = ConversationDispatcher.get(conversationId)
    setRuntime(dispatcherRef.current.getRuntime())
  }

  useEffect(() => {
    const dispatcher = dispatcherRef.current
    if (!dispatcher) return
    const unsub = dispatcher.subscribe((rt) => {
      setRuntime({ ...rt })
    })
    return () => { unsub() }
  }, [conversationId])

  const processUserMessage = useCallback((message: string) => {
    const dispatcher = dispatcherRef.current!
    const result = dispatcher.processUserMessage(message)
    if (result.systemMessage) {
      setSystemMessages((prev) => [
        ...prev,
        { id: `sys_${Date.now()}`, text: result.systemMessage! },
      ])
    }
    return result
  }, [])

  const processAIReply = useCallback((reply: string) => {
    const dispatcher = dispatcherRef.current!
    return dispatcher.processAIReply(reply)
  }, [])

  const summonCharacter = useCallback((data: { characterId: string; characterName: string; position?: string; action?: string }) => {
    const dispatcher = dispatcherRef.current!
    dispatcher.summonCharacter(data)
  }, [])

  const dismissCharacter = useCallback((characterId: string) => {
    const dispatcher = dispatcherRef.current!
    dispatcher.dismissCharacter(characterId)
  }, [])

  const clearSystemMessages = useCallback(() => setSystemMessages([]), [])

  return useMemo(() => ({
    runtime,
    systemMessages,
    processUserMessage,
    processAIReply,
    summonCharacter,
    dismissCharacter,
    clearSystemMessages,
  }), [runtime, systemMessages, processUserMessage, processAIReply, summonCharacter, dismissCharacter, clearSystemMessages])
}
