// ===== 角色数据库中心 — 数据模型与类型定义 =====

/**
 * 角色文件信息
 * 描述单个 JSON 文件的状态
 */
export interface CharacterFile {
  /** 文件名，如 "personality.json" */
  fileName: string
  /** 相对于角色目录的路径，如 "流萤/personality.json" */
  filePath: string
  /** 文件是否存在 */
  exists: boolean
}

/**
 * Schema 字段定义
 * 描述统一 Schema 中单个字段的校验状态
 */
export interface SchemaField {
  /** 字段名，如 "name"、"personality" */
  fieldName: string
  /** 是否必填 */
  required: boolean
  /** 当前值（任意类型） */
  currentValue: unknown
  /** 是否缺失（必填字段为空/不存在） */
  isMissing: boolean
}

/**
 * 校验错误严重程度
 */
export type Severity = 'error' | 'warning' | 'info'

/**
 * 校验错误
 * 描述单条校验发现的问题
 */
export interface ValidationError {
  /** 角色名 */
  characterName: string
  /** 相关文件名（不含 .json），如 "personality" */
  fileName: string
  /** 错误类型标识，如 "schema_missing"、"json_parse_error" */
  errorType: string
  /** 人类可读的错误描述 */
  description: string
  /** 严重程度 */
  severity: Severity
}

/**
 * 单个角色的校验报告
 */
export interface CharacterReport {
  /** 角色名 */
  characterName: string
  /** 完成度百分比 (0-100) */
  completionPercentage: number
  /** 错误列表（severity === 'error'） */
  errors: ValidationError[]
  /** 警告列表（severity === 'warning'） */
  warnings: ValidationError[]
  /** 缺失字段列表（人类可读的字段名） */
  missingFields: string[]
}

/**
 * 整体扫描报告
 * 包含所有角色的校验结果汇总
 */
export interface ScanReport {
  /** 扫描时间（ISO 8601 格式） */
  scanTime: string
  /** 角色总数 */
  totalCharacters: number
  /** 世界观文件数量 */
  worldviewCount: number
  /** Schema 版本号 */
  schemaVersion: string
  /** 通过数量（无 error 级别问题的角色数） */
  passCount: number
  /** 警告总数量（所有角色的 warning 总和） */
  warningCount: number
  /** 错误总数量（所有角色的 error 总和） */
  errorCount: number
  /** 角色报告列表 */
  characterReports: CharacterReport[]
}

// ===== 内部类型 =====

/** 每个角色目录下必须存在的 JSON 文件列表 */
export const REQUIRED_CHARACTER_FILES = [
  'character',
  'personality',
  'appearance',
  'hair',
  'costume',
  'voice',
  'greeting',
  'story',
  'relationship',
] as const

export type RequiredFileName = (typeof REQUIRED_CHARACTER_FILES)[number]

/** character.json 的必填字段 */
export const CHARACTER_REQUIRED_FIELDS = [
  'name',
  'rarity',
  'path',
  'element',
  'faction',
  'identity',
] as const

/** costume.json 中每套服装的必填字段 */
export const COSTUME_REQUIRED_FIELDS = [
  'outfit',
  'hair',
  'accessories',
  'other_features',
  'style',
] as const

/** 聊天兼容性检查的必填字段 */
export const CHAT_REQUIRED_FIELDS = [
  'personality',
  'speaking_style',
  'greeting',
] as const

/** 角色完成度检查的字段列表 */
export const COMPLETION_CHECK_FIELDS = [
  { key: 'personality', label: 'personality' },
  { key: 'appearance', label: 'appearance' },
  { key: 'hair', label: 'hair' },
  { key: 'wardrobe', label: 'wardrobe' },
  { key: 'speaking_style', label: 'speaking_style' },
  { key: 'greeting', label: 'greeting' },
  { key: 'story_summary', label: 'story_summary' },
  { key: 'relationship', label: 'relationship' },
] as const

/** 原始文件数据映射：fileName → 解析后的 JSON 内容 */
export type RawFileMap = Record<string, unknown>