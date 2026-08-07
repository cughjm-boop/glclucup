// ===== 角色数据库中心 — 扫描引擎 =====
//
// 职责：
//   1. 使用 import.meta.glob 扫描 /src/data/Character/ 目录下所有角色文件
//   2. 对每个角色执行六层校验
//   3. 生成统一的 ScanReport 对象
//
// 数据访问方式：
//   使用 Vite 的 import.meta.glob 在编译时预加载所有 JSON 文件，
//   与 characterDataService.js 保持一致的数据访问模式。
//   运行时零网络请求，适用于 Web 和 Capacitor (Android) 环境。

import type { ScanReport, CharacterReport, RawFileMap } from './types'
import { validateCharacter } from './validate'

// ===== 编译时批量导入所有角色 JSON 文件 =====
const _characterFileModules = import.meta.glob('../../data/Character/**/*.json', {
  eager: true,
}) as Record<string, { default?: unknown } | unknown>

// ===== 世界观文件扫描 =====
const _worldviewFileModules = import.meta.glob('../../data/worlds/**/*.json', {
  eager: true,
}) as Record<string, { default?: unknown } | unknown>

// 后备：检查 sr_worldview.json
const _srWorldviewModule = import.meta.glob('../../data/sr_worldview.json', {
  eager: true,
}) as Record<string, { default?: unknown } | unknown>

/** Schema 版本号 */
const SCHEMA_VERSION = '2.0.0'

// ===== 内部函数 =====

/**
 * 将 glob 模块的 key 转换为解析后的内容
 */
function unwrapModule(mod: { default?: unknown } | unknown): unknown {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    return (mod as { default: unknown }).default
  }
  return mod
}

/**
 * 从 glob 导入映射中提取所有角色名（目录名）
 */
function extractCharacterNames(): string[] {
  const names = new Set<string>()
  const prefix = '../../data/Character/'

  for (const key of Object.keys(_characterFileModules)) {
    if (!key.startsWith(prefix)) continue
    const relative = key.slice(prefix.length)
    const slashIdx = relative.indexOf('/')
    if (slashIdx > 0) {
      names.add(relative.slice(0, slashIdx))
    }
  }

  return [...names].sort()
}

/**
 * 从 glob 导入映射中提取角色文件数据
 * 返回 Map<角色名, RawFileMap>
 */
function groupFilesByCharacter(): Map<string, RawFileMap> {
  const characters = new Map<string, RawFileMap>()
  const prefix = '../../data/Character/'

  for (const [path, mod] of Object.entries(_characterFileModules)) {
    if (!path.startsWith(prefix)) continue

    const relative = path.slice(prefix.length)
    const slashIdx = relative.indexOf('/')
    if (slashIdx <= 0) continue

    const charName = relative.slice(0, slashIdx)
    // 文件名去掉 .json 后缀
    const fileName = relative.slice(slashIdx + 1).replace(/\.json$/, '')

    if (!characters.has(charName)) {
      characters.set(charName, {})
    }

    const content = unwrapModule(mod)
    characters.get(charName)![fileName] = content
  }

  return characters
}

/**
 * 获取世界观文件列表
 * 优先扫描 /data/worlds/ 目录，后备使用 sr_worldview.json
 */
function getWorldviewFiles(): string[] {
  const files: string[] = []

  // 扫描 /data/worlds/ 目录
  const prefix = '../../data/worlds/'
  for (const key of Object.keys(_worldviewFileModules)) {
    if (key.startsWith(prefix)) {
      const fileName = key.slice(prefix.length)
      files.push(fileName)
    }
  }

  // 后备：sr_worldview.json
  if (files.length === 0) {
    for (const key of Object.keys(_srWorldviewModule)) {
      if (key.includes('sr_worldview.json')) {
        files.push('sr_worldview.json')
        break
      }
    }
  }

  return files
}

// ===== 公共 API =====

/**
 * 扫描所有角色，生成完整的扫描报告
 *
 * 执行流程：
 *   1. 扫描 /src/data/Character/ 目录，提取所有角色
 *   2. 扫描世界观文件
 *   3. 对每个角色执行六层校验
 *   4. 汇总生成 ScanReport
 *
 * @returns ScanReport 完整扫描报告
 */
export function scanAllCharacters(): ScanReport {
  const scanTime = new Date().toISOString()
  const characterMap = groupFilesByCharacter()
  const allCharacterNames = [...characterMap.keys()]
  const worldviewFiles = getWorldviewFiles()

  const characterReports: CharacterReport[] = []

  for (const [charName, rawFiles] of characterMap) {
    const report = validateCharacter(
      charName,
      rawFiles,
      allCharacterNames,
      worldviewFiles,
    )
    characterReports.push(report)
  }

  // 按角色名排序
  characterReports.sort((a, b) => a.characterName.localeCompare(b.characterName, 'zh-Hans-CN'))

  // 汇总统计
  const totalCharacters = characterReports.length
  const passCount = characterReports.filter((r) => r.errors.length === 0).length
  const warningCount = characterReports.reduce((sum, r) => sum + r.warnings.length, 0)
  const errorCount = characterReports.reduce((sum, r) => sum + r.errors.length, 0)

  return {
    scanTime,
    totalCharacters,
    worldviewCount: worldviewFiles.length,
    schemaVersion: SCHEMA_VERSION,
    passCount,
    warningCount,
    errorCount,
    characterReports,
  }
}

/**
 * 扫描指定角色
 *
 * @param characterName - 角色名
 * @returns CharacterReport | null（角色不存在时返回 null）
 */
export function scanCharacter(characterName: string): CharacterReport | null {
  const characterMap = groupFilesByCharacter()
  const rawFiles = characterMap.get(characterName)

  if (!rawFiles) return null

  const allCharacterNames = [...characterMap.keys()]
  const worldviewFiles = getWorldviewFiles()

  return validateCharacter(
    characterName,
    rawFiles,
    allCharacterNames,
    worldviewFiles,
  )
}

/**
 * 获取可用的角色名列表
 *
 * @returns string[] 角色名数组
 */
export function getAvailableCharacterNames(): string[] {
  return extractCharacterNames()
}

/**
 * 获取可用的世界观文件列表
 *
 * @returns string[] 世界观文件名数组
 */
export function getAvailableWorldviewFiles(): string[] {
  return getWorldviewFiles()
}

/**
 * 获取 Schema 版本号
 *
 * @returns string 版本号
 */
export function getSchemaVersion(): string {
  return SCHEMA_VERSION
}

// 默认导出
export default {
  scanAllCharacters,
  scanCharacter,
  getAvailableCharacterNames,
  getAvailableWorldviewFiles,
  getSchemaVersion,
}