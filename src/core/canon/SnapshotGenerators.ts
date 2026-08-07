/**
 * SnapshotGenerators — 服装快照 & 自我认知快照
 *
 * - CostumeSnapshot: 程序自动生成当前服装摘要（外套/上衣/裙子/丝袜/鞋/饰品）
 * - SelfSnapshot: 让 AI 真正知道自己是谁（我是 XXX / 当前穿着 / 武器 / 情绪 / 位置）
 * - OtherCharacterSnapshot: 用户问其他角色外观时，程序自动生成摘要
 */

import type { CanonCharacterRecord } from './CanonDatabase'
import type { CanonDimension } from './CanonDatabase'

export interface CostumeSnapshotResult {
  name: string
  outerwear: string
  top: string
  bottom: string
  stockings: string
  shoes: string
  accessories: string
  hair: string
  fullText: string
}

export interface SelfSnapshotResult {
  text: string
  fields: Record<string, string>
}

export interface OtherCharacterSnapshotResult {
  text: string
}

/** 默认服装库（按角色） */
const DEFAULT_COSTUME_DB: Record<string, Partial<CostumeSnapshotResult>> = {
  流萤: {
    name: '默认战斗服',
    outerwear: '黑色军绿色短外套',
    top: '白色蕾丝背心',
    bottom: '黑色军绿色短裙',
    stockings: '白色过膝丝袜',
    shoes: '黑色军靴',
    accessories: '黑色颈圈',
  },
  银狼: {
    name: '默认便服',
    outerwear: '白色长版风衣',
    top: '黑色露肩T恤',
    bottom: '黑色紧身裤',
    stockings: '无',
    shoes: '白色运动鞋',
    accessories: '铆钉腰带，单边耳钉',
  },
  卡芙卡: {
    name: '默认长裙',
    outerwear: '深紫色长款大衣',
    top: '深紫色紧身背心',
    bottom: '深紫色长裙',
    stockings: '紫色过膝丝袜',
    shoes: '深紫色高跟鞋',
    accessories: '长款紫色手套，红色瞳孔',
  },
  知更鸟: {
    name: '默认歌姬服',
    outerwear: '蓝白色演出服外套',
    top: '白色蕾丝上衣',
    bottom: '蓝白色百褶裙',
    stockings: '白色连裤袜',
    shoes: '白色高跟鞋',
    accessories: '金长发饰',
  },
  刃: {
    name: '默认武士服',
    outerwear: '黑色和服外套',
    top: '白色无袖紧身衣',
    bottom: '黑色阔腿裤',
    stockings: '白色绑腿',
    shoes: '黑色木屐',
    accessories: '红色发带',
  },
  花火: {
    name: '默认便服',
    outerwear: '粉色短款棒球外套',
    top: '白色T恤',
    bottom: '粉色百褶裙',
    stockings: '白色过膝袜',
    shoes: '白色运动鞋',
    accessories: '双马尾发饰，护目镜',
  },
}

/** 生成 CostumeSnapshot */
export function buildCostumeSnapshot(
  record: CanonCharacterRecord,
  opts?: {
    /** 运行时覆盖（自定义换装） */
    runtimeCostume?: Partial<CostumeSnapshotResult>
  },
): CostumeSnapshotResult {
  const base = DEFAULT_COSTUME_DB[record.name] || {
    name: record.defaultCostume || '默认服装',
    outerwear: '官方设定外套',
    top: '官方设定上衣',
    bottom: '官方设定下装',
    stockings: '官方设定袜子',
    shoes: '官方设定鞋子',
    accessories: '官方设定饰品',
  }
  const merged: CostumeSnapshotResult = {
    name: runtimeCostume?.name || base.name || '默认服装',
    outerwear: runtimeCostume?.outerwear || base.outerwear || '官方设定外套',
    top: runtimeCostume?.top || base.top || '官方设定上衣',
    bottom: runtimeCostume?.bottom || base.bottom || '官方设定下装',
    stockings: runtimeCostume?.stockings || base.stockings || '官方设定袜子',
    shoes: runtimeCostume?.shoes || base.shoes || '官方设定鞋子',
    accessories: runtimeCostume?.accessories || base.accessories || '官方设定饰品',
    hair: record.officialHair,
    fullText: '',
  }
  merged.fullText =
    `服装：${merged.name}。` +
    `外套：${merged.outerwear}；` +
    `上衣：${merged.top}；` +
    `下装：${merged.bottom}；` +
    `丝袜：${merged.stockings}；` +
    `鞋：${merged.shoes}；` +
    `饰品：${merged.accessories}；` +
    `发型：${merged.hair}。`
  return merged
}

/** 生成 Self Snapshot */
export function buildSelfSnapshot(
  record: CanonCharacterRecord,
  opts?: {
    sceneInfo?: { location?: string; area?: string; position?: string }
    emotion?: string
    customCostume?: string
    weaponOverride?: string
  },
): string {
  const parts: string[] = []
  parts.push(`我是${record.name}。`)
  parts.push(`身份：${record.identity}。`)
  if (opts?.sceneInfo) {
    const { location, area, position } = opts.sceneInfo
    if (location) parts.push(`当前位置：${location}${area ? ' ' + area : ''}${position ? ' ' + position : ''}。`)
  }
  const costumeSnap = buildCostumeSnapshot(record)
  parts.push(`当前穿着：${costumeSnap.name}，${costumeSnap.outerwear}，${costumeSnap.top}，${costumeSnap.bottom}，${costumeSnap.shoes}。`)
  parts.push(`发型：${record.officialHair}。`)
  parts.push(`武器：${opts?.weaponOverride || record.weaponType}。`)
  if (opts?.emotion) parts.push(`当前情绪：${opts.emotion}。`)
  parts.push(`说话风格：保持${record.personality.slice(0, 3).join('、') || '官方'}人格，用第一人称回答。`)
  return parts.join('')
}

/** 生成 OtherCharacterSnapshot（用户评价他人用） */
export function buildOtherCharacterSnapshot(
  record: CanonCharacterRecord,
  opts?: {
    customCostume?: Partial<CostumeSnapshotResult>
  },
): string {
  const costumeSnap = buildCostumeSnapshot(record, { runtimeCostume: opts?.customCostume })
  return `${record.name}，${record.identity}，穿着${costumeSnap.name}（${costumeSnap.outerwear}、${costumeSnap.top}、${costumeSnap.bottom}、${costumeSnap.shoes}），发型${record.officialHair}。`
}

/** 仅供类型引用 */
export type { CanonDimension }
