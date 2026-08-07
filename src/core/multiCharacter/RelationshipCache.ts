/**
 * RelationshipCache — 关系度本地缓存（Multi Character Engine V2）
 *
 * 每角色独立维护关系缓存，不每轮 Prompt 重新计算，减少 Token。
 * 支持：
 *  - 读取 / 更新
 *  - 按角色持久化到 localStorage
 *  - 与记忆系统的关系重建模块对接
 */

import type { RelationshipCache as RelationshipCacheType } from './CharacterRuntime'

const STORAGE_KEY = 'mce_v2_relationship_cache_v1'

/** 关系阶段文案 */
export const RELATIONSHIP_STAGE_LABEL: Record<RelationshipCacheType['stage'], string> = {
  stranger: '初识',
  acquaintance: '熟悉',
  friend: '好友',
  close_friend: '挚友',
}

/** 读取全部关系缓存 */
export function loadAllRelationships(): Record<string, RelationshipCacheType> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** 保存全部关系缓存 */
export function saveAllRelationships(data: Record<string, RelationshipCacheType>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* quota 忽略 */
  }
}

/** 读取单个角色的关系缓存 */
export function loadRelationship(characterId: string): RelationshipCacheType | null {
  const all = loadAllRelationships()
  return all[characterId] || null
}

/** 保存单个角色的关系缓存 */
export function saveRelationship(characterId: string, cache: RelationshipCacheType): void {
  const all = loadAllRelationships()
  all[characterId] = { ...cache, updatedAt: Date.now() }
  saveAllRelationships(all)
}

/** 删除单个角色的关系缓存 */
export function deleteRelationship(characterId: string): void {
  const all = loadAllRelationships()
  delete all[characterId]
  saveAllRelationships(all)
}

/** 生成关系度的 Prompt 注入文本 */
export function buildRelationshipPrompt(cache: RelationshipCacheType | null, characterName: string): string {
  if (!cache) return ''
  const stageLabel = RELATIONSHIP_STAGE_LABEL[cache.stage] || '未知'
  return `与用户关系：${stageLabel}（${cache.score}/100）· 数据来源：${cache.source}`
}

/** 从 relationshipBuilder 的摘要初始化关系缓存（桥接旧系统） */
export function initFromRelationshipSummary(
  characterId: string,
  summary: { score?: number; stage?: string } | null,
): RelationshipCacheType {
  const existing = loadRelationship(characterId)
  const base: RelationshipCacheType = existing || {
    score: 0,
    stage: 'stranger',
    updatedAt: Date.now(),
    source: 'local_memory',
  }
  if (summary?.typeof === 'object') {
    if (typeof summary.score === 'number') base.score = summary.score
    if (typeof summary.stage === 'string' && summary.stage in RELATIONSHIP_STAGE_LABEL) {
      base.stage = summary.stage as RelationshipCacheType['stage']
    }
  }
  base.updatedAt = Date.now()
  base.source = existing ? existing.source : 'import'
  saveRelationship(characterId, base)
  return base
}

/** 清空全部关系缓存 */
export function clearAllRelationships(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
