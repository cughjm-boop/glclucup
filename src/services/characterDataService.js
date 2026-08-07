/**
 * 角色数据服务层
 * 
 * 职责：
 * 1. 从模块化目录结构（src/data/Character/{角色名}/）加载角色数据
 * 2. 提供与旧版 sr_characters.json 完全兼容的查询接口
 * 3. 支持按需加载单个角色数据，减少非必要数据注入
 * 
 * 使用 import.meta.glob 在编译时预加载所有 JSON 文件，
 * Vite 会将其打包为静态资源，运行时零网络请求。
 */

// ===== 编译时批量导入所有角色 JSON 文件 =====
// Vite 在构建时解析此 glob，生成静态导入映射
const _fileModules = import.meta.glob('../data/Character/**/*.json', { eager: true })

// ===== 模块级缓存 =====
const _cache = {
  /** @type {Object|null} 全量角色列表（首次加载后缓存） */
  allCharacters: null,
  /** @type {Map<string, Object>} 按角色名缓存单个角色数据 */
  byName: new Map(),
  /** @type {Object|null} 角色名称列表 */
  nameList: null,
}

/**
 * 从 glob 导入映射中提取所有角色名（目录名）
 * @returns {string[]}
 */
function extractCharacterNames() {
  const names = new Set()
  const prefix = '../data/Character/'
  for (const key of Object.keys(_fileModules)) {
    if (!key.startsWith(prefix)) continue
    const relative = key.slice(prefix.length)
    const slashIdx = relative.indexOf('/')
    if (slashIdx > 0) {
      names.add(relative.slice(0, slashIdx))
    }
  }
  return [...names]
}

/**
 * 读取单个角色文件的内容
 * @param {string} dirName - 角色目录名
 * @param {string} fileName - 文件名（不含 .json）
 * @returns {*} 文件内容，未找到返回 null
 */
function readCharacterFile(dirName, fileName) {
  const key = `../data/Character/${dirName}/${fileName}.json`
  const mod = _fileModules[key]
  if (mod) {
    return mod.default !== undefined ? mod.default : mod
  }
  return null
}

/**
 * 加载单个角色目录下的所有 JSON 文件，组装为完整角色对象
 * @param {string} dirName - 目录名（即角色名）
 * @returns {Object} 组装后的角色对象
 */
function loadCharacterFromDir(dirName) {
  const result = {
    name: dirName,
    aliases: [],
    rarity: '',
    path: '',
    element: '',
    faction: '',
    personality: [],
    identity: '',
    speaking_style: '',
    greeting: '',
    story_summary: '',
    wardrobe: {},
    relationship: '',
  }

  // character.json → 基础信息
  const charData = readCharacterFile(dirName, 'character')
  if (charData) {
    result.name = charData.name || dirName
    result.aliases = charData.aliases || []
    result.rarity = charData.rarity || ''
    result.path = charData.path || ''
    result.element = charData.element || ''
    result.faction = charData.faction || ''
    result.identity = charData.identity || ''
  }

  // personality.json
  const personality = readCharacterFile(dirName, 'personality')
  if (personality !== null && personality !== undefined) {
    result.personality = Array.isArray(personality) ? personality : (typeof personality === 'string' ? [personality] : [])
  }

  // story.json
  const story = readCharacterFile(dirName, 'story')
  if (story !== null && story !== undefined) {
    result.story_summary = typeof story === 'string' ? story : ''
  }

  // voice.json
  const voice = readCharacterFile(dirName, 'voice')
  if (voice !== null && voice !== undefined) {
    result.speaking_style = typeof voice === 'string' ? voice : ''
  }

  // greeting.json
  const greeting = readCharacterFile(dirName, 'greeting')
  if (greeting !== null && greeting !== undefined) {
    result.greeting = typeof greeting === 'string' ? greeting : ''
  }

  // costume.json
  const costume = readCharacterFile(dirName, 'costume')
  if (costume !== null && costume !== undefined && typeof costume === 'object') {
    result.wardrobe = costume
  }

  // relationship.json
  const relationship = readCharacterFile(dirName, 'relationship')
  if (relationship !== null && relationship !== undefined) {
    result.relationship = typeof relationship === 'string' ? relationship : ''
  }

  return result
}

// ===== 公共 API =====

/**
 * 获取所有角色数据（懒加载 + 缓存）
 * @returns {{ meta: Object, characters: Array<Object> }}
 */
export function getAllCharacters() {
  if (_cache.allCharacters) return _cache.allCharacters

  const names = extractCharacterNames()
  const characters = []

  for (const name of names) {
    const cached = _cache.byName.get(name)
    if (cached) {
      characters.push(cached)
      continue
    }

    const char = loadCharacterFromDir(name)
    if (char && char.name) {
      _cache.byName.set(name, char)
      characters.push(char)
    }
  }

  _cache.allCharacters = {
    meta: { world: '崩坏：星穹铁道', version: '2.7', description: '星穹铁道角色个人档案库', last_updated: '2026-08-02' },
    characters,
  }

  return _cache.allCharacters
}

/**
 * 按名称或别名查找角色
 * @param {string} name - 角色名或别名
 * @returns {Object|null}
 */
export function findCharacter(name) {
  if (!name) return null
  const trimmed = name.trim()

  // 先查缓存
  for (const cached of _cache.byName.values()) {
    if (cached.name === trimmed || (cached.aliases || []).includes(trimmed)) {
      return cached
    }
  }

  // 未命中缓存，加载全部
  return getAllCharacters().characters.find(
    (c) => c.name === trimmed || (c.aliases || []).includes(trimmed)
  ) || null
}

/**
 * 搜索角色（模糊匹配）
 * @param {string} query - 搜索关键词
 * @returns {Object|null}
 */
export function searchCharacter(query) {
  if (!query || !query.trim()) return null
  const q = query.trim().toLowerCase()
  return getAllCharacters().characters.find(
    (c) =>
      c.name.toLowerCase() === q ||
      (c.aliases || []).some((a) => a.toLowerCase() === q) ||
      c.name.toLowerCase().includes(q) ||
      (c.aliases || []).some((a) => a.toLowerCase().includes(q))
  ) || null
}

/**
 * 获取角色完整档案
 * @param {string} name - 角色名
 * @returns {Object|null}
 */
export function getCharacterProfile(name) {
  if (!name) return null
  return findCharacter(name)
}

/**
 * 获取角色名称列表
 * @returns {string[]}
 */
export function getCharacterNameList() {
  if (_cache.nameList) return _cache.nameList
  _cache.nameList = getAllCharacters().characters.map((c) => c.name)
  return _cache.nameList
}

/**
 * 清除缓存（用于测试或数据更新后强制刷新）
 */
export function clearCache() {
  _cache.allCharacters = null
  _cache.byName.clear()
  _cache.nameList = null
}

// ===== 兼容旧接口 =====
// 提供与 srCharacterData 格式兼容的导出

export const srCharacterData = {
  meta: {
    world: '崩坏：星穹铁道',
    version: '2.7',
    description: '星穹铁道角色个人档案库',
    last_updated: '2026-08-02',
  },
  get characters() {
    return getAllCharacters().characters
  },
}

// ===== 角色完成度检查器 =====

/**
 * 检查指定角色的完成度
 * @param {string} characterName - 角色名称
 * @returns {{ 角色名: string, 完成度: string, 缺失字段: string[] }}
 */
export function checkCharacterCompletion(characterName) {
  const char = findCharacter(characterName)
  if (!char) {
    return {
      角色名: characterName,
      完成度: '0%',
      缺失字段: ['角色不存在'],
    }
  }

  const requiredFields = [
    { key: 'personality', label: 'personality', check: (v) => Array.isArray(v) && v.length > 0 && v.some((s) => typeof s === 'string' && s.trim()) },
    { key: 'wardrobe', label: 'wardrobe（至少一套服装）', check: (v) => v && typeof v === 'object' && Object.keys(v).length > 0 && Object.values(v).some((o) => o && (o.outfit || o.hair)) },
    { key: 'speaking_style', label: 'speaking_style', check: (v) => typeof v === 'string' && v.trim().length > 0 },
    { key: 'greeting', label: 'greeting', check: (v) => typeof v === 'string' && v.trim().length > 0 },
    { key: 'story_summary', label: 'story_summary', check: (v) => typeof v === 'string' && v.trim().length > 0 },
    { key: 'relationship', label: 'relationship', check: (v) => typeof v === 'string' && v.trim().length > 0 },
  ]

  // appearance 和 hair 从 wardrobe.默认 中检查
  const defaultOutfit = char.wardrobe && char.wardrobe['默认']
  if (defaultOutfit) {
    requiredFields.push(
      { key: 'appearance', label: 'appearance（外观整体描述）', check: () => defaultOutfit.other_features && typeof defaultOutfit.other_features === 'string' && defaultOutfit.other_features.trim().length > 0 },
      { key: 'hair', label: 'hair（头发设计拆解）', check: () => defaultOutfit.hair && typeof defaultOutfit.hair === 'string' && defaultOutfit.hair.trim().length > 0 }
    )
  } else {
    requiredFields.push(
      { key: 'appearance', label: 'appearance（外观整体描述）', check: () => false },
      { key: 'hair', label: 'hair（头发设计拆解）', check: () => false }
    )
  }

  const missing = []
  let completed = 0

  for (const field of requiredFields) {
    const value = char[field.key] !== undefined ? char[field.key] : undefined
    const defaultValue = defaultOutfit ? defaultOutfit[field.key] : undefined
    const checkValue = value !== undefined ? value : defaultValue
    if (field.check(checkValue !== undefined ? checkValue : null)) {
      completed++
    } else {
      missing.push(field.label)
    }
  }

  const total = requiredFields.length
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  return {
    角色名: characterName,
    完成度: `${percentage}%`,
    缺失字段: missing,
  }
}

/**
 * 获取所有角色的完成度概览
 * @returns {Array<{ 角色名: string, 完成度: string, 缺失字段: string[] }>}
 */
export function getAllCharacterCompletion() {
  return getAllCharacters().characters.map((c) => checkCharacterCompletion(c.name))
}

// 默认导出
export default {
  getAllCharacters,
  findCharacter,
  searchCharacter,
  getCharacterProfile,
  getCharacterNameList,
  clearCache,
  checkCharacterCompletion,
  getAllCharacterCompletion,
  srCharacterData,
}