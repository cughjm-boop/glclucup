/**
 * useCharacterStateRuntime — 订阅 CharacterStateEngine V2 的 React Hook
 *
 * 单一数据源：顶部 UI、Prompt 上下文、多人聊天、记忆模块 都应该使用本 hook
 * （或直接 CharacterStateManager）来读取角色五维状态。
 *
 * 返回值保证：
 *   - 全部字段来自 CharacterStateManager 五维白名单（20 Emotion / 36 Action /
 *     16 Pose / 20 Expression / 19 Interaction），
 *     绝不会包含用户输入或 AI 回复中的任意聊天文本。
 *   - display：完整的顶部「状态」行文本，如
 *       😊 开心(2)｜坐在沙发上｜微笑｜正在聊天
 *       😳 害羞(3)｜低头 摆弄衣角｜害羞脸红｜等待回复
 *       🥱 困倦(2)｜坐在床边｜沉默｜陪着你
 */

import { useEffect, useRef, useState } from 'react'
import {
  getCharacterStateManager,
  CharacterState,
  EMOTION_TABLE,
  ACTION_TABLE,
  POSE_TABLE,
  EXPRESSION_TABLE,
  INTERACTION_TABLE,
  EmotionLevel,
} from '../core/character/CharacterStateManager'

export interface CharacterStateDisplay {
  // 英文 key（用于程序化判断）
  emotion: string
  action: string
  pose: string
  expression: string
  interaction: string
  // 中文展示
  emotionName: string
  emotionEmoji: string
  emotionLevel: EmotionLevel
  emotionLevelText: string  // '轻微' | '普通' | '强烈' | '极致'
  actionName: string
  poseName: string
  expressionName: string
  interactionName: string
  /** 4 段式完整显示："😊 开心(2)｜坐在沙发上｜微笑｜正在聊天"（由 CharacterStateManager.getDisplayString 直接生成，五维一致） */
  display: string
  /** 时间戳，供 UI 判断新鲜度 */
  lastUpdate: number
  version: number
}

const LEVEL_TEXT: Record<EmotionLevel, string> = {
  0: '轻微',
  1: '普通',
  2: '强烈',
  3: '极致',
}

const EMPTY: CharacterStateDisplay = {
  emotion: 'calm',
  emotionName: '平静',
  emotionEmoji: '😌',
  emotionLevel: 1,
  emotionLevelText: '普通',
  action: 'sitting',
  actionName: '坐着',
  pose: 'on_sofa',
  poseName: '坐在沙发上',
  expression: 'smile',
  expressionName: '微笑',
  interaction: 'chatting',
  interactionName: '正在聊天',
  display: '😌 平静｜坐在沙发上｜微笑｜正在聊天',
  lastUpdate: 0,
  version: 0,
}

export function useCharacterStateRuntime(
  characterId: string | null,
  _scenePositionHint?: string,
): CharacterStateDisplay {
  const [display, setDisplay] = useState<CharacterStateDisplay>(EMPTY)
  const unsub = useRef<(() => void) | null>(null)

  const build = (state: CharacterState): CharacterStateDisplay => {
    const emo = EMOTION_TABLE[state.emotion] || EMOTION_TABLE.calm
    const act = ACTION_TABLE[state.action] || ACTION_TABLE.sitting
    const pose = POSE_TABLE[state.pose] || POSE_TABLE.on_sofa
    const expr = EXPRESSION_TABLE[state.expression] || EXPRESSION_TABLE.no_expression
    const inter = INTERACTION_TABLE[state.interaction] || INTERACTION_TABLE.chatting

    const levelNum = (typeof state.emotionLevel === 'number' ? state.emotionLevel : 1) as EmotionLevel

    // 让 Manager 自己生成 display 字符串（避免两套逻辑不一致）
    const manager = getCharacterStateManager(state.characterId || characterId || '')
    const displayStr = (manager && manager.getState().characterId === state.characterId)
      ? manager.getDisplayString()
      : buildFallbackDisplay(emo, pose, expr, inter, levelNum, act)

    return {
      emotion: state.emotion,
      emotionName: emo.name,
      emotionEmoji: emo.emoji,
      emotionLevel: levelNum,
      emotionLevelText: LEVEL_TEXT[levelNum] ?? '普通',
      action: state.action,
      actionName: act.name,
      pose: state.pose,
      poseName: pose.name,
      expression: state.expression,
      expressionName: expr.name,
      interaction: state.interaction,
      interactionName: inter.name,
      display: displayStr,
      lastUpdate: state.lastUpdate,
      version: state.version,
    }
  }

  useEffect(() => {
    if (!characterId) {
      setDisplay(EMPTY)
      return
    }
    const manager = getCharacterStateManager(characterId)
    unsub.current = manager.subscribe((s) => setDisplay(build(s)))

    return () => {
      unsub.current?.()
      unsub.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId])

  return display
}

/** 极端降级（manager 不存在时）用相同的 4 段格式拼一个，避免 UI 跳变 */
function buildFallbackDisplay(
  emo: { emoji: string; name: string },
  pose: { name: string },
  expr: { name: string },
  inter: { name: string },
  level: EmotionLevel,
  act: { name: string },
): string {
  const levelText = level >= 2 ? `(${level})` : ''
  const emoStr = `${emo.emoji} ${emo.name}${levelText}`
  const actionName = act.name || ''
  let segment2 = pose.name
  const posesNeedAction: (keyof typeof POSE_TABLE)[] = [
    'standing', 'leaning', 'bending_forward', 'sideways', 'hands_behind',
    'arms_crossed', 'hand_on_cheek', 'hands_on_knees', 'gently_near',
    'head_down', 'head_up', 'on_tiptoes',
  ]
  const poseKey = findPoseKey(pose.name)
  if (poseKey && posesNeedAction.includes(poseKey as any) && actionName && !pose.name.includes(actionName)) {
    segment2 = `${pose.name} ${actionName}`
  }
  const parts = [emoStr, segment2]
  if (expr.name) parts.push(expr.name)
  parts.push(inter.name)
  return parts.join('｜')
}

function findPoseKey(poseName: string): string | null {
  for (const [k, v] of Object.entries(POSE_TABLE)) {
    if (v.name === poseName) return k
  }
  return null
}
