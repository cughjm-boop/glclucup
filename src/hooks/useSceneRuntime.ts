/**
 * useSceneRuntime — 订阅 SceneManager(V3) 的 Hook
 *
 * 单一数据源：场景/位置 完全来自 SceneManager。
 * 返回顶部 UI 所需的结构化数据，保证实时更新。
 * 当发生用户移动、AI 移动、SceneEngine 切换、场景事件、回家/出门/进房间/
 * 去沙滩/餐厅/卧室/浴室 等任一指令时，SceneManager.applyCommand 会
 * 调用 notify() 推送新版场景，这里通过 useEffect 订阅并触发 React 重渲染。
 */

import { useEffect, useRef, useState } from 'react'
import { getSceneManager } from '../core/scene/SceneManager'
import type { SceneState } from '../core/scene/SceneManager'
import useStore from '../store/useStore'

export interface SceneRuntimeDisplay {
  scene: {
    name: string
    items: string[]
  }
  position: string // 合成位置：location + area + position（不含对话文本）
  area: string
  location: string
  detailedPosition: string
  action: string   // 角色当前动作
  characterName: string
  version: number  // 场景版本号（用于强制刷新）
  weather: string
  timePeriod: string
}

const EMPTY_DISPLAY: SceneRuntimeDisplay = {
  scene: { name: '默认场景', items: [] },
  position: '',
  area: '',
  location: '',
  detailedPosition: '',
  action: '',
  characterName: '',
  version: 0,
  weather: '',
  timePeriod: '',
}

function buildDisplayFromState(
  sceneState: Readonly<SceneState>,
  characterId: string,
  characterName: string,
): SceneRuntimeDisplay {
  const charPos = sceneState.characters.find((c) => c.characterId === characterId)

  // 场景名称（顶部显示的主名），优先 location（真实地点）
  const sceneName =
    sceneState.location && sceneState.location !== '未知地点'
      ? sceneState.location
      : sceneState.area
        ? sceneState.area
        : sceneState.position
          ? sceneState.position
          : '默认场景'

  // 场景物品：可交互物品 列表
  const items = sceneState.interactableObjects.map((o) => o.name)

  // 合成位置字符串：location area position（去除空格/重复），保证无对话文本
  const parts: string[] = []
  if (sceneState.location && sceneState.location !== '未知地点') {
    parts.push(sceneState.location.trim())
  }
  if (sceneState.area && sceneState.area !== sceneState.location) {
    parts.push(sceneState.area.trim())
  }
  if (sceneState.position && !parts.includes(sceneState.position.trim())) {
    parts.push(sceneState.position.trim())
  }

  const positionStr = parts.join(' ')

  return {
    scene: { name: sceneName, items },
    position: positionStr,
    location: sceneState.location || '',
    area: sceneState.area || '',
    detailedPosition: sceneState.position || '',
    action: charPos?.action?.trim() || '',
    characterName,
    version: sceneState.version,
    weather: sceneState.weather || '',
    timePeriod: sceneState.timePeriod || '',
  }
}

export function useSceneRuntime(characterId: string | null) {
  // 也拿 zustand 中的 characterState（clothing / heldItems）—— 服装/持有物是独立的
  const legacyState = useStore((s) =>
    characterId ? s.characterState[characterId] : undefined,
  )
  const character = useStore((s) =>
    characterId ? s.characters.find((c) => c.id === characterId) : undefined,
  )

  const [display, setDisplay] = useState<SceneRuntimeDisplay>(EMPTY_DISPLAY)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // 没选定角色就清空显示
    if (!characterId) {
      setDisplay(EMPTY_DISPLAY)
      return
    }

    const manager = getSceneManager(characterId)

    // 订阅变化
    unsubscribeRef.current = manager.subscribe((state) => {
      const d = buildDisplayFromState(state, characterId, character?.name || '')
      setDisplay(d)
    })

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [characterId, character?.name])

  // 将 legacy 中的 clothing / heldItems 合并回返回对象（它们不来自 SceneManager）
  // 这样 UI 只需要消费一个 hook 即可
  return {
    ...display,
    clothing: legacyState?.clothing || '',
    heldItems: legacyState?.heldItems || [],
  }
}
