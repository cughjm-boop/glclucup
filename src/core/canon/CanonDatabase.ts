/**
 * CanonDatabase — 官方设定数据库（Official Canon Engine）
 *
 * 存储为只读数据，AI 永远不能修改。所有官方资料统一管理：
 *  - 世界观 / 角色 / 服装 / 头发 / 武器 / 能力 / 性格
 *  - 关系 / 背景故事 / 说话风格 / 规则
 *
 * 数据来源：sr_characters.json + sr_worldview.json + 模块化 Character/ 目录
 * 访问接口：提供按维度（武器/能力/服装/头发/说话风格/...）的结构化查询
 */

import { findCharacter, getCharacterProfile } from '../../services/characterDataService'
import worldviewRaw from '../../data/sr_worldview.json'

/** 单维度约束类型 */
export type CanonDimension =
  | 'identity'
  | 'personality'
  | 'appearance'
  | 'costume'
  | 'hair'
  | 'weapon'
  | 'ability'
  | 'relationship'
  | 'speaking'
  | 'knowledge'
  | 'worldview'

/** 官方数据库接口 */
export interface CanonCharacterRecord {
  characterId: string
  name: string
  worldviewId: string
  /** 身份 */
  identity: string
  /** 阵营 */
  faction?: string
  /** 命途/属性 */
  path?: string
  element?: string
  /** 性格标签 */
  personality: string[]
  /** 武器类型（官方限定） */
  weaponType: string
  /** 能力/技能列表（官方限定） */
  abilities: string[]
  /** 说话风格 */
  speakingStyle: string
  /** 当前默认服装（名称） */
  defaultCostume: string
  /** 官方发色/发型 */
  officialHair: string
  /** 官方关系表（key=对方名字, value=关系描述） */
  relationships: Record<string, string>
  /** 背景故事摘要 */
  background: string
  /** 规则：禁止事项（AI 不得做） */
  prohibitions: string[]
  /** 原始数据引用（便于扩展） */
  rawRef?: Record<string, unknown>
}

export interface CanonWorldRecord {
  worldId: string
  name: string
  description: string
  /** 允许的实体（地点/势力/物品） */
  entities: string[]
  /** 规则：不可违反的世界观铁律 */
  rules: string[]
}

/** 内存缓存 */
const characterCache: Map<string, CanonCharacterRecord> = new Map()
const worldviewCache: Map<string, CanonWorldRecord> = new Map()

/** 世界观常量：禁止出现的"其他 IP 元素" */
const FORBIDDEN_WORLD_ENTRIES: Record<string, string[]> = {
  star_rail: ['木叶村', '忍者', '查克拉', '死神', '海贼', '鸣人', '路飞'],
}

/** 构建角色 Canon 记录（只读缓存） */
export function getCanonCharacter(characterNameOrId: string): CanonCharacterRecord | null {
  if (!characterNameOrId) return null
  if (characterCache.has(characterNameOrId)) return characterCache.get(characterNameOrId)!

  const sr = findCharacter(characterNameOrId)
  if (!sr) return null

  const record: CanonCharacterRecord = {
    characterId: sr.name || characterNameOrId,
    name: sr.name || characterNameOrId,
    worldviewId: sr.worldview || 'star_rail',
    identity: sr.identity || '未知身份',
    faction: sr.faction,
    path: sr.path,
    element: sr.element,
    personality: Array.isArray(sr.personality) ? sr.personality : [],
    weaponType: extractWeaponType(sr),
    abilities: extractAbilities(sr),
    speakingStyle: typeof sr.speaking_style === 'string' ? sr.speaking_style : '',
    defaultCostume: '默认',
    officialHair: extractHair(sr),
    relationships: extractRelationships(sr),
    background: extractBackground(sr),
    prohibitions: buildProhibitions(sr),
    rawRef: sr as unknown as Record<string, unknown>,
  }
  characterCache.set(characterNameOrId, record)
  return record
}

/** 按 ID 取（如果 ID 等于名字） */
export function getCanonCharacterById(characterId: string): CanonCharacterRecord | null {
  return getCanonCharacter(characterId)
}

/** 获取世界观 Canon 记录 */
export function getCanonWorld(worldId = 'star_rail'): CanonWorldRecord {
  if (worldviewCache.has(worldId)) return worldviewCache.get(worldId)!
  const forbidden = FORBIDDEN_WORLD_ENTRIES[worldId] || []
  const wv = worldviewRaw as any
  const record: CanonWorldRecord = {
    worldId,
    name: wv.world || '未知世界',
    description: wv.description || '',
    entities: forbidden,
    rules: [
      '不得引入当前世界观以外的 IP 角色、地点、道具、力量体系',
      '星穹铁道世界遵循星神/命途/星核/命途行者等官方设定',
    ],
  }
  worldviewCache.set(worldId, record)
  return record
}

/** 按维度取官方数据（动态加载入口） */
export function getCanonDimension(
  characterNameOrId: string,
  dimension: CanonDimension,
): unknown {
  const rec = getCanonCharacter(characterNameOrId)
  if (!rec) return null
  switch (dimension) {
    case 'identity': return rec.identity
    case 'personality': return rec.personality
    case 'weapon': return rec.weaponType
    case 'ability': return rec.abilities
    case 'costume': return rec.defaultCostume
    case 'hair': return rec.officialHair
    case 'speaking': return rec.speakingStyle
    case 'relationship': return rec.relationships
    case 'knowledge': return rec.background
    case 'worldview': return rec.worldviewId
    case 'appearance':
      return { costume: rec.defaultCostume, hair: rec.officialHair }
    default:
      return null
  }
}

/** 清空缓存（切换角色数据或更新 sr_characters.json 时调用） */
export function clearCanonCache(): void {
  characterCache.clear()
  worldviewCache.clear()
}

// ===== 内部工具 =====

function extractWeaponType(sr: any): string {
  if (!sr) return '未知武器'
  // 角色表中有 weapon_type 字段，否则根据 path 猜测
  if (sr.weapon_type) return sr.weapon_type
  // 根据角色名称匹配
  const name = sr.name || ''
  const weaponMap: Record<string, string> = {
    刃: '剑',
    丹恒: '枪/剑',
    丹恒·饮月: '剑',
    银狼: '手枪/骇入',
    卡芙卡: '手枪',
    希儿: '镰刀',
    布洛妮娅: '弓箭',
    三月七: '弓',
    虎克: '拳头/火',
    花火: '炸弹/烟花',
    知更鸟: '歌/扇',
    流萤: '重武器/湮灭',
    托帕: '手枪',
    符玄: '拂尘',
    镜流: '剑',
    罗刹: '长枪',
    白露: '医疗法杖',
    娜塔莎: '手枪',
    杰帕德: '盾',
    景元: '剑',
    阿兰: '电系拳击',
    黑塔: '法杖',
    黑天鹅: '镰刀',
    黄泉: '手枪',
    寒鸦: '手枪/骇入',
  }
  return weaponMap[name] || '符合官方设定的武器'
}

function extractAbilities(sr: any): string[] {
  if (!sr) return []
  if (Array.isArray(sr.abilities)) return sr.abilities
  const name = sr.name || ''
  const abilityMap: Record<string, string[]> = {
    银狼: ['电子骇入', '量子攻击', '护盾削弱'],
    卡芙卡: ['精神控制', '电击', '星核力量'],
    希儿: ['量子湮灭', '虚影分身'],
    布洛妮娅: ['弓箭射击', '音波干扰'],
    三月七: ['冰属性射击', '盾反'],
    刃: ['剑术', '毁灭之力', '瞬间斩击'],
    花火: ['炸弹爆破', '诡戏', '烟花'],
    知更鸟: ['歌声', '心灵共鸣', '战吼'],
    流萤: ['湮灭之力', '重炮', '星核适应'],
    符玄: ['太卜占卜', '万象回春', '法阵'],
    镜流: ['剑道', '冰属性', '斩击'],
    罗刹: ['长枪术', '治疗', '封印邪魔'],
    白露: ['医疗术', '治愈', '冰属性'],
    娜塔莎: ['急救', '平衡', '手枪'],
    杰帕德: ['护盾', '嘲讽', '重击'],
    景元: ['剑法', '神君', '威压'],
    黑塔: ['召唤', '研究', '模拟宇宙'],
    黑天鹅: ['凋零', '记忆篡改', '镰刀'],
    黄泉: ['冥河追击', '手枪双持', '终末裁决'],
    寒鸦: ['骇入', '电系', '无人机'],
  }
  return abilityMap[name] || ['符合官方设定的命途能力']
}

function extractHair(sr: any): string {
  if (!sr) return '官方发型'
  const name = sr.name || ''
  const hairMap: Record<string, string> = {
    流萤: '银白色短发',
    银狼: '银白色长发（扎辫子）',
    卡芙卡: '紫色长直发',
    希儿: '黑色短发（红色发饰）',
    布洛妮娅: '金色双马尾',
    三月七: '粉色长发',
    丹恒: '深蓝色长发（发尾渐变）',
    刃: '银白色长发（高马尾）',
    花火: '粉色长发（双马尾）',
    知更鸟: '蓝紫色长发（编发）',
    景元: '银白色长发（束发）',
    镜流: '纯白色长发（披发）',
    罗刹: '浅金色长发（散发）',
    白露: '浅紫色长发（圆髻）',
    娜塔莎: '棕色卷发',
    杰帕德: '灰色短发',
    黑塔: '银色长发（盘发）',
    黑天鹅: '黑色长发（发饰）',
    黄泉: '黑色短发（碎发）',
    寒鸦: '黑色短发',
  }
  return hairMap[name] || '官方设定发型'
}

function extractRelationships(sr: any): Record<string, string> {
  if (sr?.relationships && typeof sr.relationships === 'object') {
    return sr.relationships as Record<string, string>
  }
  return {}
}

function extractBackground(sr: any): string {
  if (!sr) return ''
  if (typeof sr.story === 'string') return sr.story
  if (Array.isArray(sr.story)) return sr.story.join(' ')
  return ''
}

function buildProhibitions(sr: any): string[] {
  const name = sr?.name || ''
  const list: string[] = []
  list.push(`不得使用不属于 ${name} 的武器/能力`)
  list.push('不得引入非星穹铁道世界观的设定')
  if (name === '银狼') list.push('不得使用火焰/冰属性攻击')
  if (name === '刃') list.push('不得使用枪械、魔法、远程武器')
  if (name === '卡芙卡') list.push('不得表现为害羞/怯懦')
  if (name === '流萤') list.push('不得表现为活泼开朗（官方设定较为安静）')
  if (name === '知更鸟') list.push('不得沉默寡言，应保持阳光开朗')
  return list
}
