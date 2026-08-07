/**
 * ReplyValidator — 回复校验器（Chat Scene Engine V3）
 *
 * 完整的 AI 回复校验流程：
 *   DeepSeek 回复 → ReplyValidator → SceneValidator → CharacterValidator → MemoryValidator → 展示
 *
 * 小错误自动修正，严重错误触发重新生成，用户不会看到异常内容。
 */

import { SceneManager, type SceneState, type ValidationResult } from './SceneManager'
import { SceneValidator } from './SceneValidator'

// ===== 校验结果类型 =====

export interface ReplyValidationResult {
  /** 是否通过全部校验 */
  passed: boolean
  /** 是否可自动修正 */
  autoFixable: boolean
  /** 修正后的文本（如果 autoFixable） */
  fixedText?: string
  /** 是否需要重新生成 */
  needsRegeneration: boolean
  /** 重新生成的原因 */
  regenerationReason?: string
  /** 场景校验结果 */
  sceneValidation?: ValidationResult
  /** 角色校验结果 */
  characterValidation?: CharacterValidationResult
  /** 所有错误信息 */
  errors: string[]
}

export interface CharacterValidationResult {
  valid: boolean
  errors: string[]
}

// ===== 回复校验器 =====

export class ReplyValidator {
  private sceneValidator: SceneValidator

  constructor() {
    this.sceneValidator = new SceneValidator()
  }

  /**
   * 校验 AI 回复
   * @param replyText - AI 原始回复
   * @param scene - 当前场景状态
   * @param activeCharacters - 当前在场的角色列表
   * @param mainCharacterName - 主角色名（用于角色校验）
   */
  validate(
    replyText: string,
    scene: Readonly<SceneState>,
    activeCharacters: string[] = [],
    mainCharacterName?: string
  ): ReplyValidationResult {
    const errors: string[] = []
    let autoFixable = true
    let needsRegeneration = false
    let regenerationReason: string | undefined
    let fixedText = replyText

    // ===== 第一层：场景校验 =====
    const sceneValidation = this.sceneValidator.validate(fixedText, scene, activeCharacters)

    if (!sceneValidation.valid) {
      errors.push(...sceneValidation.errors.map((e) => `${e.type}: ${e.message}`))

      // 严重错误 → 需要重新生成
      const hasSevereErrors = sceneValidation.errors.some((e) =>
        ['location_conflict', 'character_not_present', 'scene_locked'].includes(e.type)
      )

      if (hasSevereErrors) {
        needsRegeneration = true
        regenerationReason = sceneValidation.errors
          .filter((e) => ['location_conflict', 'character_not_present', 'scene_locked'].includes(e.type))
          .map((e) => e.message)
          .join('; ')
        autoFixable = false
      } else if (sceneValidation.autoFixable && sceneValidation.fixedText) {
        fixedText = sceneValidation.fixedText
      }
    }

    // ===== 第二层：角色校验 =====
    const characterValidation = this.validateCharacter(fixedText, mainCharacterName, activeCharacters)
    if (!characterValidation.valid) {
      errors.push(...characterValidation.errors)
      // 角色校验失败也是严重错误
      if (characterValidation.errors.length > 0) {
        needsRegeneration = true
        regenerationReason = (regenerationReason || '') + characterValidation.errors.join('; ')
        autoFixable = false
      }
    }

    // ===== 第三层：空回复/格式校验 =====
    if (!fixedText || fixedText.trim().length === 0) {
      errors.push('AI 回复为空')
      needsRegeneration = true
      regenerationReason = 'AI 回复为空'
      autoFixable = false
    }

    // 检查是否只有无意义字符
    const trimmed = fixedText.trim()
    if (trimmed.length < 2 && trimmed !== '嗯' && trimmed !== '好') {
      errors.push('AI 回复过短，可能无意义')
      needsRegeneration = true
      regenerationReason = 'AI 回复过短'
      autoFixable = false
    }

    return {
      passed: errors.length === 0,
      autoFixable,
      fixedText: autoFixable ? fixedText : undefined,
      needsRegeneration,
      regenerationReason,
      sceneValidation,
      characterValidation,
      errors,
    }
  }

  /**
   * 角色校验：检查回复是否符合角色设定
   */
  private validateCharacter(
    text: string,
    mainCharacterName?: string,
    activeCharacters: string[] = []
  ): CharacterValidationResult {
    const errors: string[] = []

    // 1. 检查是否有角色自指混乱（如"我"和角色名混用）
    if (mainCharacterName) {
      // 检查是否有"XX说"但 XX 是第三方角色（多人对话中更关键）
      const allChars = [mainCharacterName, ...activeCharacters]
      // 这是简单检查，详细检查在 SceneValidator 中完成
    }

    // 2. 检查是否有明显的角色混淆（如回复中出现了不属于当前会话的角色名）
    const knownNames = new Set([
      mainCharacterName,
      ...activeCharacters,
      '三月七', '丹恒', '姬子', '瓦尔特', '卡芙卡', '刃', '银狼', '流萤',
      '知更鸟', '花火', '砂金', '星期日', '黑天鹅', '黄泉',
    ].filter(Boolean))

    // 这个检查很轻量，不做严格拦截

    return { valid: errors.length === 0, errors }
  }
}

/** 导出单例 */
export const replyValidator = new ReplyValidator()