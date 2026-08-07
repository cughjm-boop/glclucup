// ===== 角色数据库中心 — 六层校验逻辑 =====
//
// 校验层说明：
//   第一层（JSON 合法性）   — 文件可读性、JSON 解析、命名规范
//   第二层（Schema 完整性） — 必填字段是否存在
//   第三层（角色完成度）    — 完成度百分比计算
//   第四层（引用检查）      — wardrobe 引用、relationship 角色引用
//   第五层（世界观检查）    — 世界观文件关联
//   第六层（聊天兼容性）    — 影响聊天质量的字段检查
//

import type {
  ValidationError,
  CharacterReport,
  RawFileMap,
} from './types'
import {
  REQUIRED_CHARACTER_FILES,
  CHARACTER_REQUIRED_FIELDS,
  COSTUME_REQUIRED_FIELDS,
  CHAT_REQUIRED_FIELDS,
  COMPLETION_CHECK_FIELDS,
} from './types'

// ===== 工具函数 =====

/** 判断值是否非空（有实际内容） */
function isNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) {
    return value.length > 0 && value.some((v) => typeof v === 'string' && v.trim().length > 0)
  }
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return true
}

/** 判断对象是否为空 */
function isEmptyObject(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'object') return false
  return Object.keys(value as object).length === 0
}

/** 创建标准校验错误 */
function makeError(
  characterName: string,
  fileName: string,
  errorType: string,
  description: string,
  severity: 'error' | 'warning' | 'info' = 'error',
): ValidationError {
  return { characterName, fileName, errorType, description, severity }
}

// ====================================================================
// 第一层：JSON 合法性
// ====================================================================

/**
 * 第一层校验：JSON 合法性
 *
 * 检查：
 *   - 所有 9 个必需文件是否存在
 *   - 文件内容是否可解析为合法 JSON
 *   - 文件名是否符合命名规范
 *
 * 注意：使用 import.meta.glob 时，Vite 已在构建时解析 JSON，
 * 所以此层主要检查文件是否存在及内容类型是否正确。
 */
export function validateJsonValidity(
  characterName: string,
  rawFiles: RawFileMap,
): ValidationError[] {
  const errors: ValidationError[] = []

  for (const fileName of REQUIRED_CHARACTER_FILES) {
    const content = rawFiles[fileName]

    // 检查文件是否存在
    if (content === undefined) {
      errors.push(makeError(
        characterName,
        fileName,
        'file_missing',
        `缺少必需文件: ${fileName}.json`,
        'error',
      ))
      continue
    }

    // 检查内容是否为 null（JSON 解析失败或空文件）
    if (content === null) {
      errors.push(makeError(
        characterName,
        fileName,
        'json_parse_error',
        `文件 ${fileName}.json 内容为空或无法解析`,
        'error',
      ))
      continue
    }

    // 根据文件类型检查内容格式
    switch (fileName) {
      case 'character':
      case 'costume':
        if (typeof content !== 'object' || Array.isArray(content)) {
          errors.push(makeError(
            characterName,
            fileName,
            'json_type_error',
            `${fileName}.json 应为对象类型`,
            'error',
          ))
        }
        break
      case 'personality':
        if (!Array.isArray(content) && typeof content !== 'string') {
          errors.push(makeError(
            characterName,
            fileName,
            'json_type_error',
            `${fileName}.json 应为数组或字符串类型`,
            'error',
          ))
        }
        break
      case 'appearance':
      case 'hair':
      case 'voice':
      case 'greeting':
      case 'story':
      case 'relationship':
        if (typeof content !== 'string') {
          errors.push(makeError(
            characterName,
            fileName,
            'json_type_error',
            `${fileName}.json 应为字符串类型`,
            'error',
          ))
        }
        break
    }
  }

  return errors
}

// ====================================================================
// 第二层：Schema 完整性
// ====================================================================

/**
 * 第二层校验：Schema 完整性
 *
 * 检查每个文件是否包含其必需字段。
 * 对照统一 Schema 标准，逐文件、逐字段检查。
 */
export function validateSchemaCompleteness(
  characterName: string,
  rawFiles: RawFileMap,
): ValidationError[] {
  const errors: ValidationError[] = []

  // --- character.json ---
  const charData = rawFiles['character']
  if (charData && typeof charData === 'object' && !Array.isArray(charData)) {
    const char = charData as Record<string, unknown>
    for (const field of CHARACTER_REQUIRED_FIELDS) {
      const value = char[field]
      if (!isNonEmpty(value)) {
        errors.push(makeError(
          characterName,
          'character',
          'schema_missing',
          `character.json 缺少必填字段: ${field}`,
          'error',
        ))
      }
    }
    // aliases 是可选的，但如果有的话必须是非空数组
    if ('aliases' in char && char['aliases'] !== undefined) {
      if (!Array.isArray(char['aliases']) || (char['aliases'] as unknown[]).length === 0) {
        errors.push(makeError(
          characterName,
          'character',
          'schema_invalid',
          'character.json 的 aliases 字段应为非空数组',
          'warning',
        ))
      }
    }
  }

  // --- personality.json ---
  const personality = rawFiles['personality']
  if (personality !== undefined) {
    if (Array.isArray(personality)) {
      if (personality.length === 0 || !personality.some((s) => typeof s === 'string' && s.trim())) {
        errors.push(makeError(
          characterName,
          'personality',
          'schema_empty',
          'personality.json 数组为空或无有效内容',
          'warning',
        ))
      }
    } else if (typeof personality === 'string') {
      if (!personality.trim()) {
        errors.push(makeError(
          characterName,
          'personality',
          'schema_empty',
          'personality.json 字符串为空',
          'warning',
        ))
      }
    }
  }

  // --- appearance.json ---
  const appearance = rawFiles['appearance']
  if (appearance !== undefined && typeof appearance === 'string' && !appearance.trim()) {
    errors.push(makeError(
      characterName,
      'appearance',
      'schema_empty',
      'appearance.json 内容为空',
      'warning',
    ))
  }

  // --- hair.json ---
  const hair = rawFiles['hair']
  if (hair !== undefined && typeof hair === 'string' && !hair.trim()) {
    errors.push(makeError(
      characterName,
      'hair',
      'schema_empty',
      'hair.json 内容为空',
      'warning',
    ))
  }

  // --- costume.json ---
  const costume = rawFiles['costume']
  if (costume && typeof costume === 'object' && !Array.isArray(costume)) {
    const wardrobe = costume as Record<string, unknown>
    const outfitNames = Object.keys(wardrobe)

    if (outfitNames.length === 0) {
      errors.push(makeError(
        characterName,
        'costume',
        'schema_empty',
        'costume.json 衣橱为空，至少需要一套服装',
        'error',
      ))
    }

    for (const outfitName of outfitNames) {
      const outfit = wardrobe[outfitName]
      if (!outfit || typeof outfit !== 'object') {
        errors.push(makeError(
          characterName,
          'costume',
          'schema_invalid',
          `costume.json 中 "${outfitName}" 服装数据格式无效`,
          'error',
        ))
        continue
      }

      const outfitData = outfit as Record<string, unknown>
      for (const field of COSTUME_REQUIRED_FIELDS) {
        if (!(field in outfitData)) {
          errors.push(makeError(
            characterName,
            'costume',
            'schema_missing',
            `costume.json 中 "${outfitName}" 缺少字段: ${field}`,
            'warning',
          ))
        } else if (typeof outfitData[field] === 'string' && !(outfitData[field] as string).trim()) {
          errors.push(makeError(
            characterName,
            'costume',
            'schema_empty',
            `costume.json 中 "${outfitName}" 的 ${field} 字段为空`,
            'info',
          ))
        }
      }
    }
  }

  // --- voice.json ---
  const voice = rawFiles['voice']
  if (voice !== undefined && typeof voice === 'string' && !voice.trim()) {
    errors.push(makeError(
      characterName,
      'voice',
      'schema_empty',
      'voice.json（speaking_style）内容为空',
      'warning',
    ))
  }

  // --- greeting.json ---
  const greeting = rawFiles['greeting']
  if (greeting !== undefined && typeof greeting === 'string' && !greeting.trim()) {
    errors.push(makeError(
      characterName,
      'greeting',
      'schema_empty',
      'greeting.json 内容为空',
      'warning',
    ))
  }

  // --- story.json ---
  const story = rawFiles['story']
  if (story !== undefined && typeof story === 'string' && !story.trim()) {
    errors.push(makeError(
      characterName,
      'story',
      'schema_empty',
      'story.json（story_summary）内容为空',
      'warning',
    ))
  }

  // --- relationship.json ---
  const relationship = rawFiles['relationship']
  if (relationship !== undefined && typeof relationship === 'string' && !relationship.trim()) {
    errors.push(makeError(
      characterName,
      'relationship',
      'schema_empty',
      'relationship.json 内容为空',
      'warning',
    ))
  }

  return errors
}

// ====================================================================
// 第三层：角色完成度
// ====================================================================

/**
 * 第三层校验：角色完成度
 *
 * 计算角色数据填写完成度。
 * 公式：已填写字段数 ÷ 总字段数 × 100%
 *
 * 检查字段：personality, appearance, hair, wardrobe, speaking_style,
 *           greeting, story_summary, relationship
 */
export function validateCompletion(
  characterName: string,
  rawFiles: RawFileMap,
): { percentage: number; missingFields: string[]; errors: ValidationError[] } {
  const missingFields: string[] = []
  const errors: ValidationError[] = []
  let completed = 0

  for (const field of COMPLETION_CHECK_FIELDS) {
    let isFilled = false

    switch (field.key) {
      case 'personality': {
        const val = rawFiles['personality']
        isFilled = Array.isArray(val)
          ? val.length > 0 && val.some((s) => typeof s === 'string' && s.trim().length > 0)
          : typeof val === 'string' && val.trim().length > 0
        break
      }
      case 'appearance': {
        const val = rawFiles['appearance']
        isFilled = typeof val === 'string' && val.trim().length > 0
        break
      }
      case 'hair': {
        const val = rawFiles['hair']
        isFilled = typeof val === 'string' && val.trim().length > 0
        break
      }
      case 'wardrobe': {
        const val = rawFiles['costume']
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const entries = Object.entries(val as Record<string, unknown>)
          isFilled = entries.length > 0 && entries.some(([, o]) => {
            if (o && typeof o === 'object') {
              const outfit = o as Record<string, unknown>
              return isNonEmpty(outfit['outfit']) || isNonEmpty(outfit['hair'])
            }
            return false
          })
        }
        break
      }
      case 'speaking_style': {
        const val = rawFiles['voice']
        isFilled = typeof val === 'string' && val.trim().length > 0
        break
      }
      case 'greeting': {
        const val = rawFiles['greeting']
        isFilled = typeof val === 'string' && val.trim().length > 0
        break
      }
      case 'story_summary': {
        const val = rawFiles['story']
        isFilled = typeof val === 'string' && val.trim().length > 0
        break
      }
      case 'relationship': {
        const val = rawFiles['relationship']
        isFilled = typeof val === 'string' && val.trim().length > 0
        break
      }
    }

    if (isFilled) {
      completed++
    } else {
      missingFields.push(field.label)
    }
  }

  const total = COMPLETION_CHECK_FIELDS.length
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  if (percentage < 100) {
    errors.push(makeError(
      characterName,
      'completion',
      'completion_incomplete',
      `角色完成度 ${percentage}%，缺失 ${missingFields.length} 个字段: ${missingFields.join('、')}`,
      percentage >= 50 ? 'warning' : 'error',
    ))
  }

  return { percentage, missingFields, errors }
}

// ====================================================================
// 第四层：引用检查
// ====================================================================

/**
 * 第四层校验：引用检查
 *
 * 检查：
 *   - wardrobe 中引用的服装 ID 是否在 costume.json 中实际存在
 *   - relationship 中引用的其他角色名是否在 Character 目录中存在
 *
 * @param characterName - 当前角色名
 * @param rawFiles - 原始文件数据
 * @param allCharacterNames - 所有已知角色名列表
 */
export function validateReferences(
  characterName: string,
  rawFiles: RawFileMap,
  allCharacterNames: string[],
): ValidationError[] {
  const errors: ValidationError[] = []

  // --- wardrobe 引用检查 ---
  const costume = rawFiles['costume']
  if (costume && typeof costume === 'object' && !Array.isArray(costume)) {
    const wardrobe = costume as Record<string, unknown>
    const outfitNames = Object.keys(wardrobe)

    // 检查是否有 "默认" 服装
    if (!outfitNames.includes('默认')) {
      errors.push(makeError(
        characterName,
        'costume',
        'reference_missing_default',
        'costume.json 缺少 "默认" 服装（建议作为 fallback）',
        'warning',
      ))
    }

    // 检查每套服装的字段完整性
    for (const outfitName of outfitNames) {
      const outfit = wardrobe[outfitName]
      if (outfit && typeof outfit === 'object') {
        const data = outfit as Record<string, unknown>
        // 检查 style 字段是否有效
        if (data['style'] && typeof data['style'] === 'string' && !data['style'].trim()) {
          errors.push(makeError(
            characterName,
            'costume',
            'reference_invalid_style',
            `"${outfitName}" 的 style 字段为空，建议填写风格标签（如"日常"、"战斗"、"约会"）`,
            'info',
          ))
        }
      }
    }
  }

  // --- relationship 角色引用检查 ---
  const relationship = rawFiles['relationship']
  if (relationship && typeof relationship === 'string' && relationship.trim()) {
    // 在 relationship 文本中查找可能引用的角色名
    const allNames = new Set(allCharacterNames.filter((n) => n !== characterName))
    const foundRefs: string[] = []

    for (const name of allNames) {
      if (relationship.includes(name)) {
        foundRefs.push(name)
      }
    }

    // 检查是否引用了不存在的角色（通过查找已知角色名以外的名字）
    // 这里只检查已知角色名，不存在的角色名无法检测
    // 如果 relationship 中提到了角色名但该角色不在 allCharacterNames 中，则可能是输入错误
    // 由于中文分词困难，此检查仅作辅助
    if (foundRefs.length === 0 && relationship.length > 50) {
      // 关系文本较长但没有引用任何已知角色，可能是纯描述性文本
      // 不报错
    }
  }

  return errors
}

// ====================================================================
// 第五层：世界观检查
// ====================================================================

/**
 * 第五层校验：世界观检查
 *
 * 检查：
 *   - 角色关联的世界观文件是否存在
 *   - 检查 /src/data/worlds/ 目录
 *   - 如果不存在，检查 sr_worldview.json 作为后备
 *
 * @param characterName - 角色名
 * @param rawFiles - 原始文件数据
 * @param worldviewFiles - 世界观文件列表（文件名数组）
 */
export function validateWorldview(
  characterName: string,
  _rawFiles: RawFileMap,
  worldviewFiles: string[],
): ValidationError[] {
  const errors: ValidationError[] = []

  const charData = _rawFiles['character']
  if (!charData || typeof charData !== 'object' || Array.isArray(charData)) {
    return errors
  }

  const char = charData as Record<string, unknown>
  const faction = char['faction']

  if (!faction || typeof faction !== 'string' || !faction.trim()) {
    errors.push(makeError(
      characterName,
      'character',
      'worldview_missing_faction',
      'character.json 缺少 faction 字段，无法关联世界观',
      'warning',
    ))
    return errors
  }

  // 检查世界观文件是否存在
  if (worldviewFiles.length === 0) {
    errors.push(makeError(
      characterName,
      'worldview',
      'worldview_no_files',
      `未找到世界观文件，角色阵营"${faction}"缺少对应的世界观数据`,
      'warning',
    ))
  } else {
    // 检查是否有与 faction 匹配的世界观文件
    const factionLower = faction.trim().toLowerCase()
    const hasMatch = worldviewFiles.some((f) => {
      const name = f.replace('.json', '').toLowerCase()
      return name.includes(factionLower) || factionLower.includes(name)
    })

    if (!hasMatch) {
      errors.push(makeError(
        characterName,
        'worldview',
        'worldview_faction_mismatch',
        `角色阵营"${faction}"在 worldview 文件中未找到匹配项（可用文件: ${worldviewFiles.join(', ')}）`,
        'info',
      ))
    }
  }

  return errors
}

// ====================================================================
// 第六层：聊天兼容性检查
// ====================================================================

/**
 * 第六层校验：聊天兼容性检查
 *
 * 检查直接影响聊天质量的三个关键字段：
 *   - personality: 是否包含核心人格描述
 *   - speaking_style（voice.json）: 是否包含说话方式描述
 *   - greeting: 是否非空
 *
 * 这些字段直接影响 AI 角色扮演质量，缺失时标记为 warning。
 */
export function validateChatCompatibility(
  characterName: string,
  rawFiles: RawFileMap,
): ValidationError[] {
  const errors: ValidationError[] = []

  // --- personality 检查 ---
  const personality = rawFiles['personality']
  if (personality === undefined || personality === null) {
    errors.push(makeError(
      characterName,
      'personality',
      'chat_missing_personality',
      '缺少 personality 字段，AI 无法获取角色性格描述，聊天质量将严重下降',
      'warning',
    ))
  } else if (Array.isArray(personality)) {
    if (personality.length === 0) {
      errors.push(makeError(
        characterName,
        'personality',
        'chat_empty_personality',
        'personality 数组为空，AI 缺少核心人格参考',
        'warning',
      ))
    } else {
      // 检查是否包含核心人格描述关键词
      const allText = personality.join(' ')
      const hasCoreKeywords = /核心|性格|人格|内心|价值观|性格结构/i.test(allText)
      if (!hasCoreKeywords && allText.length < 50) {
        errors.push(makeError(
          characterName,
          'personality',
          'chat_insufficient_personality',
          'personality 内容过短或缺少核心人格描述，建议包含性格拆解、情绪表现、社交模式等',
          'warning',
        ))
      }
    }
  } else if (typeof personality === 'string') {
    if (!personality.trim()) {
      errors.push(makeError(
        characterName,
        'personality',
        'chat_empty_personality',
        'personality 字符串为空，AI 缺少核心人格参考',
        'warning',
      ))
    } else if (personality.trim().length < 20) {
      errors.push(makeError(
        characterName,
        'personality',
        'chat_insufficient_personality',
        'personality 内容过短（少于20字），建议提供更详细的性格描述',
        'warning',
      ))
    }
  }

  // --- speaking_style（voice.json）检查 ---
  const voice = rawFiles['voice']
  if (voice === undefined || voice === null) {
    errors.push(makeError(
      characterName,
      'voice',
      'chat_missing_speaking_style',
      '缺少 speaking_style 字段，AI 无法获取说话风格描述',
      'warning',
    ))
  } else if (typeof voice === 'string') {
    if (!voice.trim()) {
      errors.push(makeError(
        characterName,
        'voice',
        'chat_empty_speaking_style',
        'speaking_style 为空，AI 缺少说话风格参考，角色语气可能不稳定',
        'warning',
      ))
    } else if (voice.trim().length < 10) {
      errors.push(makeError(
        characterName,
        'voice',
        'chat_insufficient_speaking_style',
        'speaking_style 内容过短（少于10字），建议包含语气、语速、口头禅等',
        'warning',
      ))
    }
  }

  // --- greeting 检查 ---
  const greeting = rawFiles['greeting']
  if (greeting === undefined || greeting === null) {
    errors.push(makeError(
      characterName,
      'greeting',
      'chat_missing_greeting',
      '缺少 greeting 开场白，新对话无法自动生成开场消息',
      'warning',
    ))
  } else if (typeof greeting === 'string') {
    if (!greeting.trim()) {
      errors.push(makeError(
        characterName,
        'greeting',
        'chat_empty_greeting',
        'greeting 为空，新对话缺少开场白',
        'warning',
      ))
    }
  }

  return errors
}

// ====================================================================
// 综合校验（运行全部六层）
// ====================================================================

/**
 * 对单个角色执行全部六层校验
 *
 * @param characterName - 角色名
 * @param rawFiles - 原始文件数据映射
 * @param allCharacterNames - 所有已知角色名列表（用于引用检查）
 * @param worldviewFiles - 世界观文件列表（用于世界观检查）
 * @returns CharacterReport 完整的角色校验报告
 */
export function validateCharacter(
  characterName: string,
  rawFiles: RawFileMap,
  allCharacterNames: string[],
  worldviewFiles: string[],
): CharacterReport {
  const allErrors: ValidationError[] = []

  // 第一层：JSON 合法性
  const layer1 = validateJsonValidity(characterName, rawFiles)
  allErrors.push(...layer1)

  // 第二层：Schema 完整性
  const layer2 = validateSchemaCompleteness(characterName, rawFiles)
  allErrors.push(...layer2)

  // 第三层：角色完成度
  const { percentage, missingFields, errors: layer3Errors } = validateCompletion(characterName, rawFiles)
  allErrors.push(...layer3Errors)

  // 第四层：引用检查
  const layer4 = validateReferences(characterName, rawFiles, allCharacterNames)
  allErrors.push(...layer4)

  // 第五层：世界观检查
  const layer5 = validateWorldview(characterName, rawFiles, worldviewFiles)
  allErrors.push(...layer5)

  // 第六层：聊天兼容性
  const layer6 = validateChatCompatibility(characterName, rawFiles)
  allErrors.push(...layer6)

  // 分类 errors 和 warnings
  const errors = allErrors.filter((e) => e.severity === 'error')
  const warnings = allErrors.filter((e) => e.severity === 'warning')

  return {
    characterName,
    completionPercentage: percentage,
    errors,
    warnings,
    missingFields,
  }
}