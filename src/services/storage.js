const STORAGE_KEYS = {
  CHARACTERS: 'ai-chat-characters',
  MESSAGES: 'ai-chat-messages',
  SETTINGS: 'ai-chat-settings',
  MEMORIES: 'ai-chat-memories',
  MEMORY_SUMMARIES: 'ai-chat-memory-summaries',
  // 增强记忆系统
  ENHANCED_MEMORIES: 'ai-chat-enhanced-memories',
  USER_PROFILE: 'ai-chat-user-profile',
  COST_DATA: 'ai-chat-cost-data',
  MEMORY_MODE: 'ai-chat-memory-mode',
  EMOTION_CACHE: 'ai-chat-emotion-cache',
  SCHEDULED_TASKS: 'ai-chat-scheduled-tasks',
  // 角色记忆查看器
  EMOTION_HISTORY: 'ai-chat-emotion-history',
  RELATIONSHIPS: 'ai-chat-relationships',
  EVENTS: 'ai-chat-events',
  // 场景管理
  CURRENT_SCENE: 'ai-chat-current-scene',
  // 角色实时状态快照
  CHARACTER_STATE: 'ai-chat-character-state',
  // 角色衣橱
  CURRENT_OUTFIT: 'ai-chat-current-outfit',
  // 多人对话：在场额外角色
  ACTIVE_CHARACTERS: 'ai-chat-active-characters',
  // 多人对话：临时角色状态快照
  GUEST_CHARACTER_STATES: 'ai-chat-guest-character-states',
  // 场景事件摘要
  SCENE_EVENTS: 'ai-chat-scene-events',
  // 三层记忆金字塔（V2）
  MEMORIES_V2: 'ai-chat-memories-v2',       // { [characterId]: Array<MemoryItem> }
  MEMORY_ARCHIVES: 'ai-chat-memory-archives', // { [characterId]: Array<ArchiveItem> } 月度归档
  DAILY_CLEANUP_DAYS: 'ai-chat-daily-cleanup-days', // 日常琐事保留天数
  IMPRESSION_TEXT: 'ai-chat-impression-text', // { [characterId]: { text, updatedAt } } 核心印象文本
  // V2.1 记忆质量扩展
  MEMORY_CONFLICTS: 'ai-chat-memory-conflicts', // { [characterId]: Array<ConflictEntry> }
  // 关系重建
  RELATIONSHIP_SUMMARY: 'ai-chat-relationship-summary', // { [characterId]: RelationshipAnalysis }
  // A-2：调度器过滤日志（每轮 assistant 消息 id → 过滤记录）
  DISPATCHER_LOG_MAP: 'ai-chat-dispatcher-log-map-v1',
  // C-2：长沉默客串自动退场用户偏好
  AUTO_DISMISS_SETTINGS: 'ai-chat-auto-dismiss-settings-v1',
}

export function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    // Silently fail - storage full or unavailable
  }
}

export function removeFromStorage(key) {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    // Silently fail
  }
}

/**
 * 清理冗余功能残留数据（一次性执行）
 * 移除已废弃的"日记与回忆整理"、"睡前故事生成"、"人生轨迹预测"功能相关数据
 */
export function cleanupLegacyData() {
  const cleaned = []

  // 1. 清理 SCHEDULED_TASKS 中的冗余任务记录
  try {
    const tasks = loadFromStorage(STORAGE_KEYS.SCHEDULED_TASKS) || {}
    const legacyTaskKeys = ['bedtimeStory', 'lifeTrajectory', 'diaryOrganization']
    let tasksChanged = false
    for (const key of legacyTaskKeys) {
      if (tasks[key] !== undefined) {
        delete tasks[key]
        tasksChanged = true
        cleaned.push(`SCHEDULED_TASKS.${key}`)
      }
    }
    if (tasksChanged) {
      saveToStorage(STORAGE_KEYS.SCHEDULED_TASKS, tasks)
    }
  } catch {}

  // 2. 清理 ENHANCED_MEMORIES 中各角色的冗余数据
  try {
    const enhanced = loadFromStorage(STORAGE_KEYS.ENHANCED_MEMORIES) || {}
    const legacyEnhancedKeys = ['bedtimeStory', 'lifeTrajectory', 'diaryOrganization']
    let enhancedChanged = false
    for (const [charId, data] of Object.entries(enhanced)) {
      for (const key of legacyEnhancedKeys) {
        if (data[key] !== undefined) {
          delete data[key]
          enhancedChanged = true
          cleaned.push(`ENHANCED_MEMORIES.${charId}.${key}`)
        }
      }
    }
    if (enhancedChanged) {
      saveToStorage(STORAGE_KEYS.ENHANCED_MEMORIES, enhanced)
    }
  } catch {}

  return cleaned
}

export { STORAGE_KEYS }