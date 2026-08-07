// ===== 角色数据库中心 — 公共 API =====
//
// 使用方式：
//   import { scanAllCharacters, scanCharacter, getAvailableCharacterNames } from '../tools/validator'
//
//   const report = scanAllCharacters()
//   console.log(report.totalCharacters, report.passCount)

// 类型导出
export type {
  CharacterFile,
  SchemaField,
  Severity,
  ValidationError,
  CharacterReport,
  ScanReport,
  RawFileMap,
  RequiredFileName,
} from './types'

// 常量导出
export {
  REQUIRED_CHARACTER_FILES,
  CHARACTER_REQUIRED_FIELDS,
  COSTUME_REQUIRED_FIELDS,
  CHAT_REQUIRED_FIELDS,
  COMPLETION_CHECK_FIELDS,
} from './types'

// 校验函数导出
export {
  validateJsonValidity,
  validateSchemaCompleteness,
  validateCompletion,
  validateReferences,
  validateWorldview,
  validateChatCompatibility,
  validateCharacter,
} from './validate'

// 扫描引擎导出
export {
  scanAllCharacters,
  scanCharacter,
  getAvailableCharacterNames,
  getAvailableWorldviewFiles,
  getSchemaVersion,
} from './scan'