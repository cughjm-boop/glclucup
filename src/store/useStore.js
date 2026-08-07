import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from '../services/storage'
import { sendChatMessage, extractMemoryItems, generateMemorySummary, generateSceneEventSummary } from '../services/api'
import srWorldview from '../data/sr_worldview.json'
import { getSceneManager, initSceneManager, disposeSceneManager } from '../core/scene/SceneManager'
import { getSceneUpdater } from '../core/scene/SceneUpdater'
import { getCharacterStateManager } from '../core/character/CharacterStateManager'
import { getCharacterStateUpdater } from '../core/character/CharacterStateUpdater'
import { SceneValidator } from '../core/scene/SceneValidator'
import { ReplyValidator } from '../core/scene/ReplyValidator'
import { SceneSnapshot } from '../core/scene/SceneSnapshot'
import { findCharacter, searchCharacter, getCharacterProfile } from '../services/characterDataService'
import { scanAndBuildProfileText } from '../services/dynamicCharacterLoader'
import {
  senseEmotion,
  runPostConversationTasks,
  runScheduledMaintenance,
  getEnhancedContextForPrompt,
  checkAnniversaries,
  getUserProfile,
  syncUserProfileAcrossCharacters,
} from '../services/enhancedMemoryService'
import { recordCost, getCostData, getCurrentMonthCost, getMemoryMode, setMemoryMode, MEMORY_MODES } from '../services/costTracker'
import { downloadWithFallback, formatExportTime, getDateStr } from '../utils/exportUtils'
import { generateTimeContext, formatTimeContextForPrompt } from '../services/timeService'
import {
  getAllMemoriesV2,
  getMemoriesByTier,
  getCoreMemories,
  getEmotionalMemories,
  getDailyMemories,
  addMemoryV2,
  addMemoriesV2,
  updateMemoryV2,
  deleteMemoryV2,
  deleteMemoriesByMessageId,
  archiveOldDailyMemories,
  clearAllDailyMemories,
  getDailyChatInjection,
  getDeepChatInjection,
  classifyImportMemories,
  searchMemoriesV2,
  exportMemoriesV2,
  migrateOldMemories,
  getCleanupDays,
  setCleanupDays,
  getImpressionText,
  saveImpressionText,
  getArchives,
  MEMORY_TIERS,
  EMOTIONAL_SUB_CATEGORIES,
  getMemoryDashboardStats,
  getFullMemoryInjection,
} from '../services/memoriesV2Service'
import {
  getOptimizedInjection,
  getPendingConfirmations,
  confirmMemory,
  mentionMemory,
  updateLastMentionFromText,
  detectConflicts,
  getUnresolvedConflicts,
  resolveConflict,
  markAsTemporary,
  runQualityAudit,
  calculateHealthScore,
  migrateMemorySchema,
  decayHeat,
  mergeDuplicateMemories,
  autoLockMilestones,
  deleteExpiredMemories,
} from '../services/memoryQualityManager'
import {
  MemoryPipeline,
  processSingleMessage,
  processImportedMessages,
  generateImportReport,
  PIPELINE_STAGES,
  MEMORY_CATEGORIES,
} from '../services/memoryPipeline'
import {
  buildAndSaveRelationship,
  buildRelationshipFromImport,
  getRelationshipSummary,
  getRelationshipPrompt,
  getFormattedRelationshipSummary,
} from '../services/relationshipBuilder'
import {
  buildTimeline,
  getTimelinePrompt,
  getTimelineStats,
  getMilestoneChain,
  MemoryTimeline,
} from '../services/memoryTimeline'
import { MultiCharacterCoordinator } from '../core/coordinator/MultiCharacterCoordinator'
import { parseCommand } from '../core/command/CommandParser'
import { strictMatchLocalMultiEvent, getSystemMessageForEvent } from '../core/dispatcher/EventTypes'

// 默认设置
const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
  theme: 'system',
}

// 应用主题到 document
function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

// 将提取的记忆类型映射到内部类别
function mapTypeToCategory(type) {
  const map = {
    '个人信息': 'personal_info',
    '爱好': 'hobby',
    '关系': 'relationship',
    '事件': 'experience',
    '承诺': 'promise',
    '用户期望': 'user_expectation',
    'user_expectation': 'user_expectation',
    '其他': 'other',
    '角色信息': 'character_info',
    'character_info': 'character_info',
  }
  return map[type] || 'other'
}

// ===== 记忆类型分类 =====
const MEMORY_TYPE_CATEGORIES = {
  user_info: ['personal_info', 'hobby', 'preferences'],
  relationship_memory: ['relationship', 'promise', 'shared_experience', 'shared_property'],
  character_info: ['character_info'],
}

/**
 * 判断记忆类型
 * @param {string} category - 记忆类别
 * @returns {'user_info'|'relationship_memory'|'character_info'|'other'}
 */
function classifyMemoryType(category) {
  for (const [type, cats] of Object.entries(MEMORY_TYPE_CATEGORIES)) {
    if (cats.includes(category)) return type
  }
  return 'other'
}

/**
 * 检查角色是否使用了星穹铁道官方设定
 * @param {Object} character - 角色对象
 * @returns {Object|null} 官方角色数据
 */
function getOfficialCharacter(character) {
  if (!character || character.worldview !== 'star_rail') return null
  const ref = character.srCharacterRef || character.name
  return findCharacter(ref)
}

/**
 * 检查记忆内容是否与官方设定冲突
 * @param {Object} character - 角色对象
 * @param {string} category - 记忆类别
 * @param {string} content - 记忆内容
 * @returns {boolean} 是否冲突
 */
function checkMemoryConflict(character, category, content) {
  if (category !== 'character_info') return false
  const official = getOfficialCharacter(character)
  if (!official) return false
  const lower = content.toLowerCase()

  // 检查身份冲突
  if (official.identity && lower.includes(official.identity.toLowerCase()) === false) {
    // 如果内容声称角色身份不同于官方设定，则冲突
    const identityKeywords = ['身份', '是', '变成', '成为', '改行', '转行']
    if (identityKeywords.some((kw) => lower.includes(kw))) {
      return true
    }
  }

  // 检查性格冲突
  if (official.personality) {
    const hasConflict = official.personality.some((trait) => {
      const negations = [`不是${trait}`, `不${trait}`, `不再${trait}`, `改掉${trait}`]
      return negations.some((neg) => lower.includes(neg))
    })
    if (hasConflict) return true
  }

  return false
}

/**
 * 将导入分析输出的核心档案子分类映射到 V2 系统
 * @param {string} subCategory - "个人信息"|"关系"|"资产"
 * @returns {string|null}
 */
function mapCoreSubCategory(subCategory) {
  return subCategory || null
}

/**
 * 将导入分析输出的情感精华子分类映射到 V2 系统
 * @param {string} subCategory - "第一次"|"最时刻"|"困难与鼓励"|"最喜欢"
 * @returns {string|null}
 */
function mapEmotionalSubCategory(subCategory) {
  const map = {
    '第一次': 'first_time',
    '最时刻': 'best_moment',
    '困难与鼓励': 'hardship',
    '最喜欢': 'favorite',
  }
  return map[subCategory] || null
}

/**
 * 将 V2 三层分类映射回旧系统 category
 * @param {string} tier - 'core'|'emotional'|'daily'
 * @param {string|null} subCategory
 * @returns {string}
 */
function tierToOldCategory(tier, subCategory) {
  if (tier === 'core') {
    if (subCategory === '资产') return 'shared_property'
    if (subCategory === '关系') return 'relationship'
    return 'personal_info'
  }
  if (tier === 'emotional') {
    return 'shared_experience'
  }
  return 'other'
}

/**
 * 清理低可信度记忆（超过阈值时清理最早的）
 * @param {Array} memories - 记忆列表
 * @param {number} maxLowConfidence - 最大低可信度条目数
 * @returns {Array} 清理后的记忆列表
 */
function cleanupLowConfidenceMemories(memories, maxLowConfidence = 30) {
  const lowConfidence = memories.filter((m) => m.confidence === 'low')
  if (lowConfidence.length <= maxLowConfidence) return memories
  const toRemove = lowConfidence
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, lowConfidence.length - maxLowConfidence)
  const removeIds = new Set(toRemove.map((m) => m.id))
  return memories.filter((m) => !removeIds.has(m.id))
}

/**
 * 检测用户消息中的括号指令，并格式化为强制指令标记
 * 括号指令是最高优先级的剧情控制指令
 * 同时添加主语识别提示，帮助 AI 正确区分谁对谁做什么
 * @param {string} content - 用户原始消息
 * @param {string} characterName - 角色名称，用于分析主语
 * @returns {{ formatted: string, temporaryState: string|null }} 格式化后的消息内容和提取的临时状态
 */
function formatBracketCommands(content, characterName) {
  // 检测中文括号（）包裹的内容
  const bracketRegex = /（([^）]+)）/g
  const matches = [...content.matchAll(bracketRegex)]

  if (matches.length === 0) {
    return { formatted: content, temporaryState: null }
  }

  // 提取所有括号指令内容
  const commands = matches.map((m) => m[1].trim()).filter(Boolean)

  // 提取临时状态（性格相关的指令）
  let temporaryState = null
  const personalityKeywords = ['很凶', '生气', '大胆', '高冷', '温柔', '害羞', '冷漠', '热情', '开朗', '严肃', '调皮', '傲娇', '冷酷', '暴躁', '难过', '开心', '撒娇', '变', '变得']
  const sceneKeywords = ['场景', '时间', '突然', '现在改', '切换']

  for (const cmd of commands) {
    // 检查是否是临时状态指令（角色名 + 性格关键词）
    const hasPersonality = personalityKeywords.some((kw) => cmd.includes(kw))
    const hasSceneKeyword = sceneKeywords.some((kw) => cmd.includes(kw))
    const mentionsCharName = characterName && cmd.includes(characterName)

    if (hasPersonality && !hasSceneKeyword && (mentionsCharName || cmd.startsWith('你'))) {
      temporaryState = cmd
      break // 只取第一个临时状态指令
    }
  }

  // 分析每条括号指令中的主语
  const subjectHints = []
  commands.forEach((cmd) => {
    const startsWithMe = cmd.startsWith('我') && !cmd.startsWith('我们')
    const startsWithUser = cmd.startsWith('用户')
    const hasUserAsSubject = startsWithMe || startsWithUser

    if (hasUserAsSubject) {
      subjectHints.push(`"${cmd}" → 主语是"${startsWithMe ? '我' : '用户'}"（用户），动作由用户发起`)
    } else if (cmd.includes('场景') || cmd.includes('时间') || cmd.includes('突然') || cmd.includes('现在改')) {
      subjectHints.push(`"${cmd}" → 场景/环境指令，直接改变剧情环境`)
    } else {
      subjectHints.push(`"${cmd}" → 主语是角色名（你），动作由角色发起`)
    }

    // 额外提示：如果指令中同时出现"我"和角色名，明确指出宾语
    const hasMeInMiddle = cmd.includes('我') && !startsWithMe
    const hasCharName = characterName && cmd.includes(characterName)
    if (hasMeInMiddle && hasCharName) {
      subjectHints.push(`  ⚠️ 注意：此指令中"${characterName}"是主语（角色），"我"是宾语（用户）`)
    }
    if (startsWithMe && hasCharName) {
      subjectHints.push(`  ⚠️ 注意：此指令中"我"是主语（用户），"${characterName}"是宾语（角色）`)
    }
  })

  // 为每条括号指令添加标记，让 AI 明确这是强制指令
  let formatted = content
  formatted = formatted.replace(bracketRegex, (match, cmd) => {
    return `【强制剧情指令：${cmd.trim()}】`
  })

  // 构建主语识别提示
  let subjectHint = ''
  if (subjectHints.length > 0) {
    subjectHint = '\n\n【主语识别提示】请仔细分析以下指令中谁对谁做了什么，不要搞反：\n' +
      subjectHints.map((h) => '  - ' + h).join('\n') +
      '\n  - "我" = 用户（对话方），"你" = 角色（你自己），"角色名" = 角色（你自己）'
  }

  // 添加临时状态提醒
  let tempStateHint = ''
  if (temporaryState) {
    tempStateHint = `\n\n【临时状态提醒】用户要求你临时表现：${temporaryState}。这仅在本条回复中生效，你的基础性格设定不变，下一条消息后自动恢复。`
  }

  // 在消息开头添加全局指令提示
  const prefix = `⚠️ 【最高优先级】以下消息包含强制剧情指令，请立即无条件执行括号内的剧情，并强制覆盖当前任何状态。指令不影响角色基础性格设定。\n\n`
  const suffix = `${subjectHint}${tempStateHint}\n\n⚠️ 请先执行上面的括号指令，再进行正常回复。`

  return { formatted: prefix + formatted + suffix, temporaryState }
}

// ===== 场景解析逻辑 =====

// 默认场景物品映射（按房间类型）
const DEFAULT_SCENE_ITEMS = {
  '客厅': ['沙发', '茶几', '电视', '地毯', '窗帘', '书架'],
  '卧室': ['床', '衣柜', '床头柜', '台灯', '梳妆台'],
  '厨房': ['灶台', '冰箱', '水槽', '橱柜', '餐桌'],
  '书房': ['书桌', '书架', '电脑', '台灯', '椅子'],
  '浴室': ['浴缸', '洗手台', '镜子', '马桶', '淋浴'],
  '阳台': ['晾衣架', '花盆', '藤椅', '小茶几'],
  '咖啡店': ['咖啡桌', '椅子', '吧台', '咖啡机', '菜单'],
  '餐厅': ['餐桌', '椅子', '菜单', '餐具'],
  '公园': ['长椅', '树木', '草地', '小径', '花坛'],
  '办公室': ['办公桌', '电脑', '椅子', '文件柜', '打印机'],
  '商场': ['店铺', '电梯', '休息区', '试衣间'],
  '电影院': ['银幕', '座椅', '爆米花机', '售票处'],
  '海边': ['沙滩', '海水', '遮阳伞', '躺椅', '贝壳'],
  '车内': ['方向盘', '座椅', '后视镜', '音响'],
  '医院': ['病床', '床头柜', '呼叫铃', '输液架', '椅子'],
  '教室': ['课桌', '黑板', '讲台', '投影仪', '椅子'],
  '健身房': ['跑步机', '哑铃', '瑜伽垫', '镜子', '储物柜'],
  '图书馆': ['书架', '阅览桌', '台灯', '椅子', '借阅机'],
}

// 明确的场景转移触发词（需要匹配完整短语，而非单个词）
const SCENE_TRANSITION_PATTERNS = [
  /我们回(.{1,6})(?:吧|去|了)/,
  /去(.{1,6})(?:看看|一下|转转|逛逛)/,
  /到(.{1,6})(?:去|来)/,
  /去(.{1,6})(?:吧|了|啦)/,
  /走，?去(.{1,6})/,
  /进(.{1,6})(?:了|去|吧)/,
  /前往(.{1,6})/,
  /出发去(.{1,6})/,
  /移步(.{1,6})/,
  /换到(.{1,6})(?:去|吧)?/,
]

// 场景设置触发词（初次或重新设定场景）
const SCENE_SETTING_PATTERNS = [
  /(?:我们)?(?:现在|这会儿)?在(.{1,8})(?:里|呢|哦|啊|呀|吧|！|$)/,
  /这里是(.{1,8})/,
  /来到了(.{1,8})/,
  /我在(.{1,8})(?:里|呢|哦|啊|呀|吧|！|$)/,
  /(?:这|现在)是(.{1,8})(?:店|厅|室|吧|馆|院|场|站|所|间|园|廊|台|铺|坊|处|局|中心|广场|大厦|小区|公寓|酒店|宾馆)/,
]

// 模糊词汇 —— 仅凭这些词不能触发场景转移
const AMBIGUOUS_WORDS = ['躺一下', '躺一会', '躺会儿', '累了', '困了', '想休息', '休息一下', '休息一会', '闭一会眼睛', '闭下眼睛', '眯一会', '眯一会儿', '打个盹', '小憩', '睡一会', '睡一会儿']

/**
 * 从用户消息中解析场景信息
 * @param {string} content - 用户消息内容
 * @param {Object} currentScene - 当前场景 { name, items }
 * @returns {{ scene: Object|null, isTransition: boolean, isNewSetting: boolean }}
 *   - scene: 解析出的场景数据，null 表示无变化
 *   - isTransition: 是否是场景转移
 *   - isNewSetting: 是否是场景设定/重新设定
 */
function parseSceneFromMessage(content, currentScene) {
  if (!content || !content.trim()) return { scene: null, isTransition: false, isNewSetting: false }

  // 去掉内容中的括号指令部分，避免干扰场景解析
  const cleanContent = content.replace(/（[^）]+）/g, '').trim()

  // 1. 首先检查括号指令中的场景切换
  const bracketMatch = content.match(/（场景(?:切换|转移|转换|变更|改为|变成|挪到)[到至]?(.{1,8})）/)
  if (bracketMatch) {
    const sceneName = bracketMatch[1].trim()
    return {
      scene: { name: sceneName, items: DEFAULT_SCENE_ITEMS[sceneName] || [] },
      isTransition: true,
      isNewSetting: false,
    }
  }

  // 检查括号指令中的场景设定
  const bracketSetMatch = content.match(/（场景[：:](.{1,8})）/);
  if (bracketSetMatch) {
    const sceneName = bracketSetMatch[1].trim()
    return {
      scene: { name: sceneName, items: DEFAULT_SCENE_ITEMS[sceneName] || [] },
      isTransition: false,
      isNewSetting: true,
    }
  }

  // 2. 检查是否包含模糊词汇 —— 如果只有模糊词汇，不触发场景转移
  const hasOnlyAmbiguousWords = AMBIGUOUS_WORDS.some((w) => {
    // 检查消息中是否主要就是这些模糊词
    const withoutAmbiguous = cleanContent.replace(new RegExp(w, 'g'), '').trim()
    return withoutAmbiguous.length < 3
  })
  if (hasOnlyAmbiguousWords && cleanContent.length < 20) {
    return { scene: null, isTransition: false, isNewSetting: false }
  }

  // 3. 检查明确的场景转移意图
  for (const pattern of SCENE_TRANSITION_PATTERNS) {
    const match = cleanContent.match(pattern)
    if (match) {
      const target = match[1].trim()
      // 排除模糊词
      if (AMBIGUOUS_WORDS.some((w) => target.includes(w))) continue
      // 排除"睡觉"等模糊转移（如"去睡觉"应该去卧室，但仅当用户明确说"去卧室"）
      if (target === '睡觉' || target === '休息' || target === '躺') continue
      return {
        scene: { name: target, items: DEFAULT_SCENE_ITEMS[target] || [] },
        isTransition: true,
        isNewSetting: false,
      }
    }
  }

  // 4. 检查场景设定/重新设定
  for (const pattern of SCENE_SETTING_PATTERNS) {
    const match = cleanContent.match(pattern)
    if (match) {
      const sceneName = match[1].trim()
      if (!sceneName || sceneName.length > 8) continue
      return {
        scene: { name: sceneName, items: DEFAULT_SCENE_ITEMS[sceneName] || [] },
        isTransition: false,
        isNewSetting: true,
      }
    }
  }

  return { scene: null, isTransition: false, isNewSetting: false }
}

/**
 * 从用户消息中提取新提到的物品
 * @param {string} content - 用户消息
 * @param {string[]} currentItems - 当前场景已有物品
 * @returns {string[]} 新提取到的物品
 */
function extractNewItems(content, currentItems) {
  if (!content) return []
  const cleanContent = content.replace(/（[^）]+）/g, '').trim()
  const currentSet = new Set(currentItems.map((i) => i.toLowerCase()))

  // 常见物品关键词列表
  const itemKeywords = [
    '沙发', '茶几', '电视', '地毯', '窗帘', '书架', '遥控器', '抱枕', '毯子', '杯子',
    '床', '衣柜', '床头柜', '台灯', '梳妆台', '被子', '枕头',
    '灶台', '冰箱', '水槽', '橱柜', '餐桌', '微波炉', '烤箱', '咖啡机', '水壶',
    '书桌', '电脑', '椅子', '台灯', '笔', '本子', '手机',
    '浴缸', '洗手台', '镜子', '马桶', '淋浴', '毛巾', '浴巾',
    '咖啡桌', '吧台', '菜单', '咖啡', '蛋糕', '餐巾纸',
    '餐桌', '餐具', '筷子', '碗', '盘子', '杯子', '菜单',
    '长椅', '树木', '花坛', '喷泉', '秋千',
    '办公桌', '文件柜', '打印机', '名片', '文件夹',
    '银幕', '座椅', '爆米花', '饮料', '3D眼镜',
    '方向盘', '音响', '空调', '后视镜', '安全带',
    '病床', '呼叫铃', '输液架', '药瓶', '病历',
    '黑板', '讲台', '投影仪', '课本', '粉笔',
    '跑步机', '哑铃', '瑜伽垫', '储物柜', '毛巾',
    '阅览桌', '借阅机', '书签', '借书卡',
    '晾衣架', '花盆', '藤椅', '小茶几', '绿植',
    '店铺', '电梯', '休息区', '试衣间', '购物袋',
    '沙滩', '海水', '遮阳伞', '躺椅', '贝壳', '游泳圈',
  ]

  const newItems = []
  for (const keyword of itemKeywords) {
    if (cleanContent.includes(keyword) && !currentSet.has(keyword.toLowerCase())) {
      newItems.push(keyword)
    }
  }
  return newItems
}

// ===== 角色实时状态快照解析 =====

/**
 * 从用户消息中解析角色状态变更
 * 只有在括号指令或明确动作描述时才会更新状态
 * 建议性话语（如"多出去走走"）不会触发状态更新
 * 
 * @param {string} content - 用户消息内容
 * @param {Object} currentState - 当前角色状态 { position, clothing, action, heldItems }
 * @param {string} characterName - 角色名称
 * @returns {{ state: Object|null, changed: boolean }}
 */
function parseCharacterStateFromMessage(content, currentState, characterName) {
  if (!content || !content.trim()) return { state: null, changed: false, costumeChange: null }

  const updates = {}
  let changed = false
  let costumeChange = null // { outfitName: string, description: string, isTemp: boolean }

  // 1. 解析括号指令中的状态变更（最高优先级）
  const bracketRegex = /（([^）]+)）/g
  const bracketMatches = [...content.matchAll(bracketRegex)]
  const bracketCommands = bracketMatches.map((m) => m[1].trim()).filter(Boolean)

  for (const cmd of bracketCommands) {
    // 角色换装（支持多种换装表达）
    const clothingPatterns = [
      new RegExp(`(${characterName}|你)(?:换上了|穿上了|换成了|穿着|换了|穿上|换装)(.+)`),
      new RegExp(`(${characterName}|你)(?:换(?:了)?(?:一|这)?(?:身|套|件))(.+)`),
    ]
    let clothingMatch = null
    for (const pattern of clothingPatterns) {
      clothingMatch = cmd.match(pattern)
      if (clothingMatch) break
    }
    
    if (clothingMatch) {
      const newClothing = clothingMatch[2].replace(/[了，。！？、]$/, '').trim()
      if (newClothing && newClothing.length < 30) {
        updates.clothing = newClothing
        changed = true
        // 标记换装事件：force=true 表示用户括号指令强制换装
        costumeChange = { outfitName: newClothing, description: newClothing, isTemp: true }
      }
    }

    // 角色放下/丢掉物品
    const dropMatch = cmd.match(new RegExp(`(${characterName}|你)(?:放下了|丢掉了|扔掉了|吃完了|喝完了|放回了)(.+)`))
    if (dropMatch) {
      const droppedItem = dropMatch[2].replace(/[了，。！？、]$/, '').trim()
      if (currentState.heldItems && currentState.heldItems.length > 0) {
        const newItems = currentState.heldItems.filter(
          (item) => !item.includes(droppedItem) && !droppedItem.includes(item)
        )
        if (newItems.length !== currentState.heldItems.length) {
          updates.heldItems = newItems
          changed = true
        }
      }
    }

    // 角色拿起/获得物品
    const pickupMatch = cmd.match(new RegExp(`(${characterName}|你)(?:拿起了|端起了|捡起了|接过了|收到了)(.+)`))
    if (pickupMatch) {
      const pickedItem = pickupMatch[2].replace(/[了，。！？、]$/, '').trim()
      if (pickedItem && pickedItem.length < 20) {
        const existing = currentState.heldItems || []
        if (!existing.some((item) => item.includes(pickedItem) || pickedItem.includes(item))) {
          updates.heldItems = [...existing, pickedItem]
          changed = true
        }
      }
    }

    // 角色动作变更
    const actionMatch = cmd.match(new RegExp(`(${characterName}|你)(?:站起身|站起来|坐下了|躺下了|走过去|走过来|跑起来|停下来|开始)(.*)`))
    if (actionMatch) {
      const actionPart = actionMatch[2] ? actionMatch[0].replace(new RegExp(`^${characterName}|^你`), '').trim() : actionMatch[0]
      const actionText = actionPart.replace(/[了，。！？、]$/, '').trim()
      if (actionText && actionText.length < 20) {
        updates.action = actionText
        changed = true
      }
    }

    // 注意：场景/位置变更**仅由 SceneEngine（V3）解析器）处理
    // 禁止 parseCharacterStateFromMessage 解析，避免位置被对话文本污染
    // 真需要切换场景位置必须通过用户明确指令 "我们去沙滩吧" 等由 SceneUpdater.parseUserMessage 写入 SceneManager
  }

  // 2. 解析普通对话中的明确动作（非建议性话语）
  // 仅处理主语是"你"（角色）的明确动作指令
  // 过滤掉建议性话语（如"你要多..."、"你应该..."、"建议你..."）
  const cleanContent = content.replace(/（[^）]+）/g, '').trim()

  // 检查是否是建议性话语（不触发状态变更）
  const suggestionPatterns = [
    /你要多/, /你应该/, /你最好/, /建议你/, /你可以试试/, /不妨/, /不如/,
    /多出去走走/, /多运动/, /多锻炼/, /多休息/, /早点睡/,
  ]
  const isSuggestion = suggestionPatterns.some((p) => p.test(cleanContent))
  if (isSuggestion) {
    // 建议性话语不触发状态更新，但返回当前状态不变
    return { state: null, changed: false, costumeChange: null }
  }

  // 明确的放下物品指令
  if (!changed) {
    const dropPatterns = [
      /(?:把|将)(?:那个|这个|手里的|手上)?(.{1,6})(?:放下|放下来|放一边|丢掉|扔了)/,
      /(?:放下|丢掉)(?:那个|这个|手里的|手上)?(.{1,6})/,
    ]
    for (const pattern of dropPatterns) {
      const match = cleanContent.match(pattern)
      if (match) {
        const droppedItem = match[1].trim()
        if (currentState.heldItems && currentState.heldItems.length > 0) {
          const newItems = currentState.heldItems.filter(
            (item) => !item.includes(droppedItem) && !droppedItem.includes(item)
          )
          if (newItems.length !== currentState.heldItems.length) {
            updates.heldItems = newItems
            changed = true
          }
        }
        break
      }
    }
  }

  // 明确的拿起物品指令
  if (!changed) {
    const pickupPatterns = [
      /(?:帮我)?(?:拿|端|取|递)(?:一下|过来)?(?:那个|这)?(.{1,8})/,
      /(?:去)?(?:拿|端|取)(?:一下|过来)?(?:那个|这)?(.{1,8})/,
    ]
    for (const pattern of pickupPatterns) {
      const match = cleanContent.match(pattern)
      if (match) {
        const item = match[1].trim()
        if (item && item.length < 15 && !item.includes('给我') && !item.includes('帮')) {
          const existing = currentState.heldItems || []
          if (!existing.some((i) => i.includes(item) || item.includes(i))) {
            updates.heldItems = [...existing, item]
            changed = true
          }
        }
        break
      }
    }
  }

  return { state: changed ? updates : null, changed, costumeChange }
}

// ===== 多人聊天严格本地事件路由（V2 最终优化） =====
/**
 * 严格本地处理 6 种召唤/离场句式（绝不送入 AI 推理）。
 *
 * 命中成功：更新 activeCharacters / guestCharacterStates / 插系统消息 + 插该角色自己的本地问候/离开消息
 * 命中失败：返回本地错误（绝不调 DeepSeek）
 *
 * @param {{
 *   content: string,
 *   currentCharacterId: string,
 *   mainCharName: string,
 *   sceneName: string,
 *   activeChars: string[],
 *   getStore: () => any,
 *   setStore: (patch: any) => void,
 * }} ctx
 * @returns {{ handled: boolean, skipAiCall: boolean, errorMessage?: string }}
 */
function processStrictLocalMultiEvent(ctx) {
  const { content, currentCharacterId, mainCharName, sceneName, activeChars, getStore, setStore } = ctx
  if (!content || !content.trim()) return { handled: false, skipAiCall: false }

  const strict = strictMatchLocalMultiEvent(content)
  if (!strict) return { handled: false, skipAiCall: false }

  // 查档案（确认角色真实存在）—— 不存在 → 本地错误，不调 AI
  const profile = findCharacter(strict.rawTargetName)
  if (!profile || !profile.name) {
    const err =
      strict.type === 'CharacterEnter'
        ? `嗯…我好像不认识「${strict.rawTargetName}」这个人呢，你能换个名字再告诉我吗？`
        : `咦？在场的人里好像没有「${strict.rawTargetName}」哦…`
    return { handled: true, skipAiCall: true, errorMessage: err, success: false }
  }

  const targetName = profile.name
  const targetId = _nameToId(targetName)
  const targetAlias = (profile.aliases && profile.aliases[0]) || targetName
  const isMainItself = targetName === mainCharName

  // ==== 召唤 ====
  if (strict.type === 'CharacterEnter') {
    if (isMainItself) {
      return {
        handled: true, skipAiCall: true, success: false,
        errorMessage: `${targetName}一直都在这里陪着你呀～不用再召唤我啦。`,
      }
    }
    if (activeChars.includes(targetName)) {
      return {
        handled: true, skipAiCall: true, success: false,
        errorMessage: `${targetName}已经在旁边啦，你转过头就能看到她哦。`,
      }
    }
    if (activeChars.length >= MAX_ACTIVE_CHARACTERS - 1) {
      return {
        handled: true, skipAiCall: true, success: false,
        errorMessage: `人太多了有点挤…（当前最多 ${MAX_ACTIVE_CHARACTERS} 人同时在场），先送走谁再叫吧？`,
      }
    }

    // —— 成功：更新状态 + 插系统消息 + 插该角色自己本地回应 ——
    const newActive = [...activeChars, targetName]
    const nextActiveCharacters = { ...getStore().activeCharacters, [currentCharacterId]: newActive }
    setStore({ activeCharacters: nextActiveCharacters })
    saveToStorage(STORAGE_KEYS.ACTIVE_CHARACTERS, nextActiveCharacters)

    // 初始化 guest 独立状态（M3：角色状态独立）
    getStore().updateGuestCharacterState(currentCharacterId, targetName, {
      position: sceneName || '客厅',
      action: '加入了对话',
      emotion: '开心',
      clothing: profile.wardrobe?.默认?.outfit || '默认服装',
      heldItems: [],
    })

    // 系统消息
    const systemText = getSystemMessageForEvent({
      type: 'CharacterEnter', targetName, summary: `${targetName}加入了聊天`, createdAt: Date.now(), id: '',
    })
    const now = Date.now()
    const systemMsg = {
      id: uuidv4(), characterId: currentCharacterId, role: 'system',
      content: systemText, speaker: '系统', timestamp: now, _local: true,
    }
    // 该角色自己回应（B1：必须自己回应，不由主角色代答）
    const greet = profile.greeting && profile.greeting.length > 1
      ? profile.greeting
      : _defaultGreetingFor(profile, mainCharName)
    const greetMsg = {
      id: uuidv4(), characterId: currentCharacterId, role: 'assistant',
      content: greet, speaker: targetName, speakerId: targetId,
      timestamp: now + 1, _local: true,
    }

    const charMessages = getStore().messages[currentCharacterId] || []
    const nextMessages = {
      ...getStore().messages,
      [currentCharacterId]: [...charMessages, systemMsg, greetMsg],
    }
    setStore({ messages: nextMessages, isLoading: false })
    saveToStorage(STORAGE_KEYS.MESSAGES, nextMessages)

    // 多人会话开始
    if (activeChars.length === 0) {
      getStore().setMultiCharSessionStart(now)
    }
    return { handled: true, skipAiCall: true, success: true, eventType: 'CharacterEnter', targetName, targetId }
  }

  // ==== 离场 ====
  if (strict.type === 'CharacterLeave') {
    if (isMainItself) {
      return {
        handled: true, skipAiCall: true, success: false,
        errorMessage: `我才不要走呢😤，要一直陪着你。`,
      }
    }
    if (!activeChars.includes(targetName)) {
      return {
        handled: true, skipAiCall: true, success: false,
        errorMessage: `咦…${targetName}好像不在这边哦，是不是记错啦？`,
      }
    }

    // —— 成功：移除 + 插系统消息 + 插该角色自己本地回应 ——
    const newActive = activeChars.filter((n) => n !== targetName)
    const nextActiveCharacters = { ...getStore().activeCharacters, [currentCharacterId]: newActive }
    setStore({ activeCharacters: nextActiveCharacters })
    saveToStorage(STORAGE_KEYS.ACTIVE_CHARACTERS, nextActiveCharacters)
    getStore().removeGuestCharacterState(currentCharacterId, targetName)

    const now = Date.now()
    const systemText = getSystemMessageForEvent({
      type: 'CharacterLeave', targetName, summary: `${targetName}离开了`, createdAt: now, id: '',
    })
    const systemMsg = {
      id: uuidv4(), characterId: currentCharacterId, role: 'system',
      content: systemText, speaker: '系统', timestamp: now, _local: true,
    }
    const farewell = _defaultFarewellFor(profile, mainCharName)
    const farewellMsg = {
      id: uuidv4(), characterId: currentCharacterId, role: 'assistant',
      content: farewell, speaker: targetName, speakerId: targetId,
      timestamp: now + 1, _local: true,
    }
    const charMessages = getStore().messages[currentCharacterId] || []
    const nextMessages = {
      ...getStore().messages,
      [currentCharacterId]: [...charMessages, systemMsg, farewellMsg],
    }
    setStore({ messages: nextMessages, isLoading: false })
    saveToStorage(STORAGE_KEYS.MESSAGES, nextMessages)

    // 会话结束
    if (newActive.length === 0 && activeChars.length > 0) {
      // 让外层后续（sessionJustEnded）逻辑做摘要；这里只清 isLoading 不阻塞
    }
    return { handled: true, skipAiCall: true, success: true, eventType: 'CharacterLeave', targetName, targetId }
  }

  return { handled: false, skipAiCall: false }
}

function _nameToId(name) {
  if (!name) return 'guest'
  return name.toLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, '')
}

function _defaultGreetingFor(profile, mainCharName) {
  const style = String(profile.speaking_style || '').trim()
  // 按性格生成一句符合她本人口吻的招呼（本地生成，不调 AI）
  const name = profile.name
  const personality = Array.isArray(profile.personality) ? profile.personality.join(',') : String(profile.personality || '')
  const shy = /害羞|内敛|怕生|胆怯|内向|温柔|安静/.test(personality)
  const active = /活泼|开朗|元气|外向|热情|天真|单纯|调皮/.test(personality)
  const cool = /冷静|冷淡|高冷|少言|沉稳|沉稳冷静|清冷/.test(personality)
  const gentle = /温柔|温柔端庄|温婉|善良|体贴|关怀|治愈/.test(personality) || style.includes('温柔')
  const elegant = /优雅|端庄|大方|知性|淑女|高贵/.test(personality) || /知更鸟|卡芙卡|布洛妮娅|娜塔莎|赫丽娅/.test(name)
  const funny = /调皮|捉弄|恶作剧|搞怪|幽默|花火/.test(personality + name)
  const warrior = /刃|银狼|杰帕德|瓦尔特|景元|丹恒|桑博|卢卡|虎克|希儿|佩拉|驭空/.test(name)

  if (/流萤|Firefly/.test(name)) {
    return `（听见你叫她，眼睛一下子亮了起来，快步走到你身边）我来了～我来了！今天也要和${mainCharName || '你'}{开心地}在一起！✨`
  }
  if (/三月七|March7|三月/.test(name)) {
    return `（突然从背后蹦出来，拍了拍你的肩膀）嘿嘿～本小姐驾到！${mainCharName || '你'}想我了没？😆📸`
  }
  if (/知更鸟|Robin/.test(name)) {
    return `（轻轻放下小提琴，朝你温柔颔首）我来了呢。能再为${mainCharName || '你'}唱歌，真的很开心。🎶`
  }
  if (/卡芙卡|Kafka/.test(name)) {
    return `（指尖还绕着一缕发丝，嘴角带着似笑非笑的弧度）嗯？叫我过来…是又想我了吗，小乖乖？😉`
  }
  if (/银狼|SilverWolf/.test(name)) {
    return `（头也没抬地敲了最后一下键盘，屏幕映出"VICTORY"）…来了。要开黑还是查资料？`
  }
  if (/花火|Sparkle/.test(name)) {
    return `（一阵铃鼓般的笑声由远及近，少女旋着圈出现在你面前）哦呵呵呵～～被你找到啦！这次要玩什么？🎭`
  }
  if (/刃|Blade/.test(name)) {
    return `（沉默地走过来，目光平静，只淡淡点了一下头）……来了。`
  }

  if (funny) return `（俏皮地眨眨眼）哟～${mainCharName || '你'}想起我啦？这次可不许再让我等太久哦！🎪`
  if (cool && warrior) return `（脚步很轻，转眼到了你身后）来了。说吧，去哪。`
  if (shy) return `（听见声音，微微红了脸，小声走过来）嗯、嗯…我、我来了…不要一直盯着我看啦…`
  if (elegant) return `（温雅地走近，颔首一笑）很高兴见到你。需要我为${mainCharName || '你'}做些什么？`
  if (gentle) return `（柔声应着，步伐从容地走到你身旁）我在这呢。${mainCharName || '你'}今天还好吗？`
  if (active) return `（风风火火地跑过来）我来啦我来啦！！有什么好玩的？快说快说～🎊`
  if (cool) return `（抬了抬眼，应声站起）来了。什么事。`
  return `（应声走近）嗯，我在。${mainCharName || '你'}叫我？`
}

function _defaultFarewellFor(profile, mainCharName) {
  const name = profile.name
  const personality = Array.isArray(profile.personality) ? profile.personality.join(',') : String(profile.personality || '')
  const shy = /害羞|内敛|怕生|胆怯|内向/.test(personality)
  const active = /活泼|开朗|元气|外向|热情|天真|单纯|调皮/.test(personality)
  const cool = /冷静|冷淡|高冷|少言|沉稳|清冷/.test(personality)
  const elegant = /优雅|端庄|大方|知性|淑女|高贵/.test(personality) || /知更鸟|卡芙卡|布洛妮娅|娜塔莎|赫丽娅/.test(name)
  const funny = /调皮|捉弄|恶作剧|搞怪|幽默|花火/.test(personality + name)
  const warrior = /刃|银狼|杰帕德|瓦尔特|景元|丹恒|桑博|卢卡|虎克|希儿|佩拉|驭空/.test(name)

  if (/流萤|Firefly/.test(name)) {
    return `（有点恋恋不舍地握紧了一下手，又很快松开）那、那我先回去啦…下次一定要再叫我哦！一定哦！🥺💙`
  }
  if (/三月七|March7|三月/.test(name)) {
    return `（冲你挥了挥手里的相机）好啦好啦～本小姐先撤！记得想我哦！不然下次我要挠你痒痒啦！😜👋`
  }
  if (/知更鸟|Robin/.test(name)) {
    return `（轻轻欠身，像幕布落下时那样温柔微笑）那么，我先告辞了。期待下次再为${mainCharName || '你'}唱歌。🎻`
  }
  if (/卡芙卡|Kafka/.test(name)) {
    return `（弯了弯指尖，做了个"下次再说"的口型）嗯…那就先这样。乖乖等我回来，不许偷偷想别人哦。💋`
  }
  if (/银狼|SilverWolf/.test(name)) {
    return `（指尖一点，游戏界面瞬间消失在空气里）…走了。有事直接丢任务给我。`
  }
  if (/花火|Sparkle/.test(name)) {
    return `（双手捧着脸，眼里满是促狭）哦呀～这就散场啦？真可惜…那我们下次再玩个更刺激的，哦？🎪✨`
  }
  if (/刃|Blade/.test(name)) {
    return `（转身时披风扫过一道弧线，没有回头）……走了。`
  }
  if (funny) return `（朝你挥挥手，背影还不忘比个鬼脸）拜拜～～下次再让我吓你一跳哦！🎭`
  if (cool && warrior) return `（点头示意）先走了。有事联系。`
  if (shy) return `（低着头小声说）那、那我走啦…你、你要好好的哦…`
  if (elegant) return `（温雅地颌首）那么，我先告辞了。下次再会。`
  if (active) return `（挥着手跑远）拜拜拜拜！！要想我哦——！！🥰`
  if (cool) return `（起身，没再多说）走了。`
  return `（点点头）好，那我先走了。保重。`
}

// ===== 多人对话：召唤/遣散解析 =====

// 召唤触发词模式
const SUMMON_PATTERNS = [
  /(.{1,6})(?:走了过来|也加入了聊天|推门进来|出现了|走来了|过来了|加入了|来了)/,
  /召唤(.{1,6})/,
  /叫(.{1,6})(?:过来|一下|来)/,
]

// 遣散触发词模式
const DISMISS_PATTERNS = [
  /(.{1,6})(?:离开了|走了|退出了|回去了|消失了|退场)/,
]

// 最大同时在场角色数（含主角色）
const MAX_ACTIVE_CHARACTERS = 4

/**
 * 在 sr_characters.json 中查找角色
 * @param {string} name - 角色名或别名
 * @returns {Object|null} 角色数据
 */
function findSRCharacter(name) {
  if (!name) return null
  return findCharacter(name)
}

/**
 * 从用户消息中解析召唤/遣散指令
 * @param {string} content - 用户消息内容
 * @param {string[]} currentActive - 当前在场的额外角色名列表
 * @returns {{ summoned: string|null, dismissed: string|null, error: string|null }}
 */
function parseMultiCharacterCommand(content, currentActive) {
  if (!content || !content.trim()) return { summoned: null, dismissed: null, error: null }

  // 提取所有括号指令
  const bracketRegex = /（([^）]+)）/g
  const matches = [...content.matchAll(bracketRegex)]
  const commands = matches.map((m) => m[1].trim()).filter(Boolean)

  let summoned = null
  let dismissed = null
  let error = null

  for (const cmd of commands) {
    // 检查遣散
    for (const pattern of DISMISS_PATTERNS) {
      const match = cmd.match(pattern)
      if (match) {
        const name = match[1].trim()
        const srChar = findSRCharacter(name)
        if (srChar && currentActive.includes(srChar.name)) {
          dismissed = srChar.name
        }
        break
      }
    }

    // 检查召唤
    if (!dismissed) {
      for (const pattern of SUMMON_PATTERNS) {
        const match = cmd.match(pattern)
        if (match) {
          const name = match[1].trim()
          const srChar = findSRCharacter(name)
          if (srChar) {
            if (currentActive.includes(srChar.name)) {
              // 已经在场，不重复添加
              break
            }
            if (currentActive.length >= MAX_ACTIVE_CHARACTERS - 1) {
              error = '人太多了，有点挤呢...下次再叫他们吧。'
              break
            }
            summoned = srChar.name
          } else {
            error = '我好像不认识这个人呢...'
          }
          break
        }
      }
    }
  }

  return { summoned, dismissed, error }
}

/**
 * 构建多人对话中额外角色的核心设定（精简版，约200-300 token/角色）
 * @param {string} charName - 角色名
 * @returns {string|null} 格式化文本
 */
function buildGuestCharacterProfile(charName) {
  const srChar = findSRCharacter(charName)
  if (!srChar) return null

  const parts = []
  parts.push(`【${srChar.name}】`)
  parts.push(`- 身份：${srChar.identity || '未知'}`)
  if (srChar.personality && srChar.personality.length > 0) {
    parts.push(`- 性格：${srChar.personality.slice(0, 3).join('、')}`)
  }
  if (srChar.speaking_style) {
    // 截取说话风格的前150字
    const style = srChar.speaking_style.length > 150
      ? srChar.speaking_style.slice(0, 150) + '...'
      : srChar.speaking_style
    parts.push(`- 说话风格：${style}`)
  }
  if (srChar.faction) {
    parts.push(`- 阵营：${srChar.faction}`)
  }
  if (srChar.path) {
    parts.push(`- 命途/属性：${srChar.path} / ${srChar.element || '未知'}`)
  }
  // 战斗方式简要说明
  if (srChar.wardrobe?.默认?.other_features) {
    const features = srChar.wardrobe['默认'].other_features
    // 提取战斗相关描述
    const combatRelated = features.length > 200 ? features.slice(0, 200) + '...' : features
    parts.push(`- 特征：${combatRelated}`)
  }

  return parts.join('\n')
}

/**
 * 构建多人对话的系统提示词上下文
 * @param {Object} mainCharacter - 主要角色
 * @param {string[]} activeChars - 在场的额外角色名列表
 * @param {string} officialProfileText - 主角色官方设定文本
 * @returns {string} 多人对话上下文文本
 */
function buildMultiCharacterContext(mainCharacter, activeChars, officialProfileText) {
  if (!activeChars || activeChars.length === 0) return ''

  const parts = []
  parts.push('═══════════════════════════════════════════════')
  parts.push('【多人对话模式 — 当前在场角色】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push(`当前对话模式：多人对话。你在本轮中需要同时扮演以下角色：`)
  parts.push('')
  parts.push(`1. 主要角色：${mainCharacter.name}（始终在场，完整设定见上文）`)
  activeChars.forEach((name, i) => {
    parts.push(`${i + 2}. 临时角色：${name}`)
  })
  parts.push('')
  parts.push('═══════════════════════════════════════════════')
  parts.push('【临时角色核心设定】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  activeChars.forEach((name) => {
    const profile = buildGuestCharacterProfile(name)
    if (profile) {
      parts.push(profile)
      parts.push('')
    }
  })
  parts.push('═══════════════════════════════════════════════')
  parts.push('【多人对话回复格式 — 严格遵循】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push('你的回复必须包含每个在场角色的发言。格式如下：')
  parts.push('')
  parts.push(`${mainCharacter.name}：（动作描述或直接说话）发言内容`)
  activeChars.forEach((name) => {
    parts.push(`${name}：（动作描述或直接说话）发言内容`)
  })
  parts.push('')
  parts.push('格式规则：')
  parts.push('1. 每个角色一行，以"角色名："开头。')
  parts.push('2. 角色名后接中文冒号"："，然后是发言内容。')
  parts.push(`3. 发言顺序：严格遵循【回复调度指令】中的串行顺序（被点名角色先说话）。不要让主要角色抢在前面。`)
  parts.push('4. 每个角色的发言必须符合其性格和说话风格，形成自然互动。')
  parts.push('5. 角色之间要有对话感，不能各说各话。')
  parts.push('6. 动作描述放在括号（）中，放在发言内容之前。')
  parts.push('7. 不要包含"你："作为用户发言——用户会自己说话。')
  parts.push('8. 只说【回复调度指令】明确允许的角色；其他人保持沉默，不要出声。')
  parts.push('')
  parts.push('═══════════════════════════════════════════════')
  parts.push('【多人对话硬性约束】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push('1. 每个角色的发言必须严格遵循其 sr_characters.json 官方设定。')
  parts.push('2. 不能出现角色混淆：卡芙卡不能用流萤的语气，流萤不能用冷兵器战斗。')
  parts.push('3. 如果用户括号指令与某个角色的官方设定冲突，该角色应自然纠正。')
  parts.push(`4. 最多同时在场 ${MAX_ACTIVE_CHARACTERS} 个角色，超过时主角色应提示。`)
  parts.push('5. 所有角色回复必须基于星穹铁道官方世界观。')
  parts.push('6. 绝对禁止主角色（默认第一个人）代替被点名角色说话。如果用户问"三月七昨天开心吗"，必须由三月七自己回答，流萤不能替她答。')
  parts.push('7. 每个角色只允许出现在一个场景中，不能跳场景，不能乱改地点。如果当前场景在客厅，就不要突然说在海边。')
  parts.push('')
  parts.push('═══════════════════════════════════════════════')
  parts.push('【记忆归属严格规则（重要！）】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push('1. 每个角色只能读取 / 复述自己的私人记忆，绝不允许偷看别人的记忆。')
  parts.push(`   - 例：用户问「三月七，昨天我们去海边好玩吗」→ 三月七只能用 owner="三月七" 或 participants 包含自己的 memory / timeline / scene_events 回答。`)
  parts.push(`   - 例：流萤绝对不能替三月七复述「昨天堆了沙堡」这种经历，除非流萤本人昨天也参与了（participants 里有流萤）。`)
  parts.push('2. 如果用户点名某角色问一个问题，必须由那个被点名角色自己回答，不允许任何人代答。')
  parts.push('3. 若被点名角色没有对应记忆 → 必须由她自己按自己的性格自然回应，例如：「唔…昨天我好像没跟你们一起去海边呢，不知道具体发生了什么…」')
  parts.push('   - 绝对不可以编造别人的经历，也不可以把别的角色记忆当成自己的。')
  parts.push('4. 回答只引用自己亲身参与的事，不确定的就老实说不知道，不要 AI 自由发挥。')
  parts.push('')

  return parts.join('\n')
}

/**
 * 解析 AI 的多角色回复为独立消息数组
 * @param {string} reply - AI 原始回复
 * @param {string} mainCharName - 主要角色名
 * @param {string[]} activeChars - 在场的额外角色名列表
 * @param {string} characterId - 主角色ID
 * @returns {Array} 消息数组 [{ role: 'assistant', speaker: string, content: string }]
 */
function parseMultiCharacterReply(reply, mainCharName, activeChars, characterId) {
  if (!reply || !activeChars || activeChars.length === 0) {
    // 单人模式，不需要解析
    return null
  }

  const allNames = [mainCharName, ...activeChars]
  const messages = []
  const lines = reply.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 尝试匹配 "角色名：内容" 或 "角色名:内容" 格式
    let matched = false
    for (const name of allNames) {
      const prefix = `${name}：`
      const prefixAlt = `${name}:`
      if (trimmed.startsWith(prefix)) {
        messages.push({
          id: uuidv4(),
          characterId,
          role: 'assistant',
          speaker: name,
          content: trimmed.slice(prefix.length).trim(),
          timestamp: Date.now(),
        })
        matched = true
        break
      }
      if (trimmed.startsWith(prefixAlt)) {
        messages.push({
          id: uuidv4(),
          characterId,
          role: 'assistant',
          speaker: name,
          content: trimmed.slice(prefixAlt.length).trim(),
          timestamp: Date.now(),
        })
        matched = true
        break
      }
    }
    // 如果以 "你：" 开头，跳过（用户发言）
    if (trimmed.startsWith('你：') || trimmed.startsWith('你:')) {
      matched = true
    }
    // 不匹配任何角色的行，合并到上一条消息
    if (!matched && messages.length > 0) {
      messages[messages.length - 1].content += '\n' + trimmed
    }
  }

  return messages.length > 0 ? messages : null
}

const useStore = create((set, get) => ({
  // ===== 状态 =====
  characters: loadFromStorage(STORAGE_KEYS.CHARACTERS) || [],
  messages: loadFromStorage(STORAGE_KEYS.MESSAGES) || {},
  memories: loadFromStorage(STORAGE_KEYS.MEMORIES) || {},
  memorySummaries: loadFromStorage(STORAGE_KEYS.MEMORY_SUMMARIES) || {},
  enhancedMemories: loadFromStorage(STORAGE_KEYS.ENHANCED_MEMORIES) || {},
  emotionHistory: loadFromStorage(STORAGE_KEYS.EMOTION_HISTORY) || {},
  relationships: loadFromStorage(STORAGE_KEYS.RELATIONSHIPS) || {},
  events: loadFromStorage(STORAGE_KEYS.EVENTS) || {},
  currentCharacterId: null,
  settings: { ...DEFAULT_SETTINGS, ...(loadFromStorage(STORAGE_KEYS.SETTINGS) || {}) },
  isLoading: false,
  error: null,
  view: 'chat',
  fullScreenPageOpen: false,
  editingCharacterId: null,
  // 增强记忆系统状态
  emotionContext: null,
  costData: getCostData(),
  memoryMode: getMemoryMode(),
  // 导入状态
  importState: null, // { status: 'idle'|'parsing'|'preview'|'extracting'|'done'|'error', progress, stats, error }
  memoryDashboardFilter: null, // 从导入报告跳转到记忆仪表盘时预设的筛选层级：'core'|'emotional'|'daily'
  // 临时状态追踪（性格分层：仅当次有效，不会被持久化）
  temporaryStates: {}, // { [characterId]: { state: string, source: 'bracket'|'dialogue', expiresAt: timestamp } }
  // 场景追踪（按角色ID存储）
  currentScene: loadFromStorage(STORAGE_KEYS.CURRENT_SCENE) || {}, // { [characterId]: { name: string, items: string[], timestamp: number } }
  // 角色实时状态快照（按角色ID存储）
  characterState: loadFromStorage(STORAGE_KEYS.CHARACTER_STATE) || {}, // { [characterId]: { position, clothing, action, heldItems, timestamp } }
  // 角色衣橱数据（按角色ID存储，从 sr_characters.json 加载并可由用户自定义）
  wardrobeData: {}, // { [characterId]: { "默认": { outfit, hair, accessories, other_features, style }, ... } }
  // 当前选中服装（按角色ID存储）
  currentOutfit: loadFromStorage(STORAGE_KEYS.CURRENT_OUTFIT) || {}, // { [characterId]: "默认" }
  // 多人对话：当前在场的额外角色（按主角色ID存储，不含主角色本人）
  activeCharacters: loadFromStorage(STORAGE_KEYS.ACTIVE_CHARACTERS) || {}, // { [characterId]: string[] } 角色名数组
  // 多人对话：临时角色（guest）的状态快照（按主角色ID+guest名存储）
  guestCharacterStates: loadFromStorage(STORAGE_KEYS.GUEST_CHARACTER_STATES) || {}, // { [characterId]: { [guestName]: { position, clothing, action, heldItems, timestamp } } }
  // 场景事件摘要
  sceneEvents: loadFromStorage(STORAGE_KEYS.SCENE_EVENTS) || [], // [{ id, date, participants, summary, characterId }]
  // 多人对话会话追踪
  multiCharSessionStart: null, // 当前多人对话会话开始时间戳
  // 三层记忆金字塔（V2）
  memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {},
  cleanupDays: getCleanupDays(),
  impressionText: loadFromStorage(STORAGE_KEYS.IMPRESSION_TEXT) || {},
  // V2.1 记忆质量状态
  memoryHealthScores: {}, // { characterId: { score, details } }
  pendingConfirmations: [], // 待确认的记忆
  memoryConflicts: [], // 未解决的记忆冲突
  // V2 记忆仪表盘
  memoryDashboardStats: null, // 当前展示角色的记忆仪表盘统计
  relationshipSummary: null, // 当前角色的关系摘要
  memoryTimelineData: null, // 当前角色的记忆时间轴数据

  // A-2：调度器过滤日志显示偏好（默认开，有内容才显示折叠条）
  showDispatcherLogs: (() => {
    try {
      const v = localStorage.getItem('ai-chat-ui-pref-show-dispatcher-logs')
      if (v === null) return true
      return v === '1'
    } catch (_) { return true }
  })(),
  // C-2：长沉默自动退场非阻塞提示气泡 { guestName, reason, timestamp }[]
  autoDismissToasts: [],

  // 初始化主题
  initTheme: () => {
    const { settings } = get()
    applyTheme(settings.theme || 'system')
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (get().settings.theme === 'system') {
        applyTheme('system')
      }
    }
    mq.addEventListener('change', handler)
  },

  setTheme: (theme) => {
    const settings = { ...get().settings, theme }
    set({ settings })
    saveToStorage(STORAGE_KEYS.SETTINGS, settings)
    applyTheme(theme)
  },

  // ===== 角色管理 =====
  createCharacter: (characterData) => {
    const newCharacter = {
      id: uuidv4(),
      ...characterData,
      avatar: characterData.avatar || '',
      createdAt: Date.now(),
    }
    const characters = [...get().characters, newCharacter]
    set({ characters, view: 'chat', currentCharacterId: newCharacter.id })
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
    return newCharacter
  },

  updateCharacter: (id, characterData) => {
    const characters = get().characters.map((c) =>
      c.id === id ? { ...c, ...characterData } : c
    )
    set({ characters, view: 'chat', editingCharacterId: null })
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
  },

  deleteCharacter: (id) => {
    const characters = get().characters.filter((c) => c.id !== id)
    const messages = { ...get().messages }
    delete messages[id]
    const memories = { ...get().memories }
    delete memories[id]
    const memorySummaries = { ...get().memorySummaries }
    delete memorySummaries[id]
    const enhancedMemories = { ...get().enhancedMemories }
    delete enhancedMemories[id]

    // 清理 V2 记忆和归档
    const memoriesV2 = { ...get().memoriesV2 }
    delete memoriesV2[id]
    saveToStorage(STORAGE_KEYS.MEMORIES_V2, memoriesV2)

    const archives = loadFromStorage(STORAGE_KEYS.MEMORY_ARCHIVES) || {}
    delete archives[id]
    saveToStorage(STORAGE_KEYS.MEMORY_ARCHIVES, archives)

    const impressionText = { ...get().impressionText }
    delete impressionText[id]
    saveToStorage(STORAGE_KEYS.IMPRESSION_TEXT, impressionText)

    // 清理 V3 场景引擎
    SceneSnapshot.delete(id)
    disposeSceneManager(id)

    const updates = { characters, messages, memories, memorySummaries, enhancedMemories, memoriesV2, impressionText }
    if (get().currentCharacterId === id) {
      updates.currentCharacterId = characters.length > 0 ? characters[0].id : null
    }

    set(updates)
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
    saveToStorage(STORAGE_KEYS.MESSAGES, messages)
    saveToStorage(STORAGE_KEYS.MEMORIES, memories)
    saveToStorage(STORAGE_KEYS.MEMORY_SUMMARIES, memorySummaries)
    saveToStorage(STORAGE_KEYS.ENHANCED_MEMORIES, enhancedMemories)
  },

  setCurrentCharacter: (id) => {
    set({ currentCharacterId: id, view: 'chat' })
    // V3 场景引擎初始化：切换角色时尝试恢复场景快照
    if (id && !getSceneManager(id).getState().version) {
      SceneSnapshot.restore(id)
    }
  },

  // ===== 导入记忆 =====
  setCharacterMemory: (characterId, memoryMessages) => {
    const characters = get().characters.map((c) =>
      c.id === characterId ? { ...c, importedMemory: memoryMessages } : c
    )
    set({ characters })
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
  },

  clearCharacterMemory: (characterId) => {
    const characters = get().characters.map((c) => {
      if (c.id === characterId) {
        const { importedMemory, ...rest } = c
        return rest
      }
      return c
    })
    set({ characters })
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
  },

  // ===== 长期记忆管理 =====
  getMemories: (characterId) => {
    return get().memories[characterId] || []
  },

  getMemorySummary: (characterId) => {
    return get().memorySummaries[characterId] || null
  },

  addMemory: (characterId, content, source = 'manual', category = '', extra = {}) => {
    const memories = { ...get().memories }
    const list = [...(memories[characterId] || [])]
    const now = Date.now()

    // 判断记忆类型，角色信息类自动标记为低可信度
    const memoryType = classifyMemoryType(category)
    const confidence = extra.confidence || (memoryType === 'character_info' ? 'low' : 'high')

    // 检查是否与官方设定冲突
    const { characters } = get()
    const character = characters.find((c) => c.id === characterId)
    if (character && checkMemoryConflict(character, category, content)) {
      // 冲突的记忆不添加，但需要通知调用方
      return { conflict: true }
    }

    list.push({
      id: uuidv4(),
      category,
      content,
      source,
      confidence,
      strength: extra.strength ?? 100,
      important: extra.important ?? false,
      createdAt: now,
      updatedAt: now,
    })
    memories[characterId] = list
    set({ memories })
    saveToStorage(STORAGE_KEYS.MEMORIES, memories)
    return { conflict: false }
  },

  addMemories: (characterId, items) => {
    const memories = { ...get().memories }
    const list = [...(memories[characterId] || [])]
    const now = Date.now()

    // 获取角色信息用于冲突检测
    const { characters } = get()
    const character = characters.find((c) => c.id === characterId)
    let discardedCount = 0

    items.forEach((item) => {
      const { category, content } = item
      if (!content || !content.trim()) return
      const normalizedContent = content.trim()

      // 与官方设定冲突的角色信息直接丢弃
      if (character && checkMemoryConflict(character, category, normalizedContent)) {
        discardedCount++
        return
      }

      const existingIndex = list.findIndex(
        (m) =>
          m.category === category &&
          m.content.trim().toLowerCase() === normalizedContent.toLowerCase()
      )

      // 判断记忆类型，角色信息类自动标记为低可信度
      const memoryType = classifyMemoryType(category)
      const confidence = memoryType === 'character_info' ? 'low' : 'high'

      if (existingIndex >= 0) {
        list[existingIndex] = {
          ...list[existingIndex],
          confidence,
          updatedAt: now,
        }
      } else {
        list.push({
          id: uuidv4(),
          category,
          content: normalizedContent,
          source: 'auto',
          confidence,
          strength: 100,
          important: false,
          createdAt: now,
          updatedAt: now,
        })
      }
    })

    memories[characterId] = list
    set({ memories })
    saveToStorage(STORAGE_KEYS.MEMORIES, memories)

    // 清理低可信度条目（超过 30 条时清理最早的）
    if (discardedCount > 0 || list.some((m) => m.confidence === 'low')) {
      const cleaned = cleanupLowConfidenceMemories(list)
      if (cleaned.length !== list.length) {
        memories[characterId] = cleaned
        set({ memories })
        saveToStorage(STORAGE_KEYS.MEMORIES, memories)
      }
    }

    return { discardedCount }
  },

  updateMemory: (characterId, memoryId, updates) => {
    const memories = { ...get().memories }
    const list = (memories[characterId] || []).map((m) =>
      m.id === memoryId
        ? { ...m, ...updates, updatedAt: Date.now() }
        : m
    )
    memories[characterId] = list
    set({ memories })
    saveToStorage(STORAGE_KEYS.MEMORIES, memories)
  },

  toggleImportant: (characterId, memoryId) => {
    const memories = { ...get().memories }
    const list = (memories[characterId] || []).map((m) =>
      m.id === memoryId ? { ...m, important: !m.important, updatedAt: Date.now() } : m
    )
    memories[characterId] = list
    set({ memories })
    saveToStorage(STORAGE_KEYS.MEMORIES, memories)
  },

  deleteMemory: (characterId, memoryId) => {
    const memories = { ...get().memories }
    memories[characterId] = (memories[characterId] || []).filter((m) => m.id !== memoryId)
    set({ memories })
    saveToStorage(STORAGE_KEYS.MEMORIES, memories)
  },

  clearMemories: (characterId) => {
    const memories = { ...get().memories }
    delete memories[characterId]
    const summaries = { ...get().memorySummaries }
    delete summaries[characterId]
    set({ memories, memorySummaries: summaries })
    saveToStorage(STORAGE_KEYS.MEMORIES, memories)
    saveToStorage(STORAGE_KEYS.MEMORY_SUMMARIES, summaries)
  },

  setMemorySummary: (characterId, summary) => {
    const summaries = { ...get().memorySummaries }
    summaries[characterId] = { content: summary, updatedAt: Date.now() }
    set({ memorySummaries: summaries })
    saveToStorage(STORAGE_KEYS.MEMORY_SUMMARIES, summaries)
  },

  deleteCharacterMemory: (id) => {
    const memories = { ...get().memories }
    delete memories[id]
    const summaries = { ...get().memorySummaries }
    delete summaries[id]
    set({ memories, memorySummaries: summaries })
    saveToStorage(STORAGE_KEYS.MEMORIES, memories)
    saveToStorage(STORAGE_KEYS.MEMORY_SUMMARIES, summaries)
  },

  // ===== 增强记忆管理 =====
  getEnhancedMemories: (characterId) => {
    return get().enhancedMemories[characterId] || {}
  },

  // ===== 临时状态管理（性格分层：仅当次有效） =====
  /**
   * 设置角色的临时状态（从括号指令或对话中提取）
   * 临时状态仅在当前回复中生效，下一条消息后自动清除
   */
  setTemporaryState: (characterId, state) => {
    const tempStates = { ...get().temporaryStates }
    tempStates[characterId] = { state, source: 'bracket', setAt: Date.now() }
    set({ temporaryStates: tempStates })
  },

  /**
   * 清除角色的临时状态
   * 当新消息没有括号指令时自动调用
   */
  clearTemporaryState: (characterId) => {
    const tempStates = { ...get().temporaryStates }
    if (tempStates[characterId]) {
      delete tempStates[characterId]
      set({ temporaryStates: tempStates })
    }
  },

  /**
   * 获取角色的当前临时状态（如果有）
   * @returns {string|null} 临时状态描述，如"很凶"、"大胆"
   */
  getTemporaryState: (characterId) => {
    const temp = get().temporaryStates[characterId]
    if (temp) return temp.state
    return null
  },

  // ===== 场景管理 =====
  /**
   * 更新指定角色的当前场景
   * @param {string} characterId - 角色ID
   * @param {Object} sceneData - 场景数据 { name, items }
   */
  updateScene: (characterId, sceneData) => {
    const currentScene = { ...get().currentScene }
    const existing = currentScene[characterId] || { name: '默认场景', items: [], timestamp: 0 }
    currentScene[characterId] = {
      ...existing,
      ...sceneData,
      timestamp: Date.now(),
    }
    set({ currentScene })
    saveToStorage(STORAGE_KEYS.CURRENT_SCENE, currentScene)
  },

  /**
   * 获取指定角色的当前场景，如果没有则返回默认场景
   * @param {string} characterId - 角色ID
   * @returns {{ name: string, items: string[], timestamp: number }}
   */
  getCurrentScene: (characterId) => {
    const scene = get().currentScene[characterId]
    if (scene) return scene
    return { name: '默认场景', items: [], timestamp: 0 }
  },

  /**
   * 重置指定角色的场景为默认
   * @param {string} characterId - 角色ID
   */
  resetScene: (characterId) => {
    const currentScene = { ...get().currentScene }
    currentScene[characterId] = { name: '默认场景', items: [], timestamp: Date.now() }
    set({ currentScene })
    saveToStorage(STORAGE_KEYS.CURRENT_SCENE, currentScene)
  },

  // ===== 角色实时状态快照管理 =====
  /**
   * 获取指定角色的默认状态
   */
  getDefaultState: () => ({
    position: '',
    clothing: '',
    action: '',
    heldItems: [],
    timestamp: 0,
  }),

  /**
   * 更新指定角色的状态快照
   *
   * ⚠️ 单一数据源策略（SceneRuntime + CharacterStateEngine V2）：
   *   - position / emotion / emotionLevel / pose / expression / interaction：
   *     禁止普通调用方直接写入（避免聊天文本反向污染顶部"位置/状态"行）。
   *   - 只有通过 __source === 'SceneEngine' 签名的信任路径（SceneManager
   *     + CharacterStateManager 后向同步），才能同时写入上述字段。
   *   - clothing / heldItems / action：任意路径允许写入（它们是独立功能，
   *     不在 CharacterStateEngine V2 的严格白名单机制里；action 为兼容保留）。
   */
  updateCharacterState: (characterId, stateData) => {
    const characterState = { ...get().characterState }
    const existing = characterState[characterId] || get().getDefaultState()

    const safeData = { ...stateData }
    const trusted = safeData.__source === 'SceneEngine'
    if (trusted) delete safeData.__source

    // 1) position
    if (!trusted && safeData && 'position' in safeData && safeData.position) {
      console.warn(
        '[updateCharacterState] ⚠️ 已丢弃 position 更新：position 只能由 SceneRuntime 写入。' +
        ` 尝试写入：${JSON.stringify(safeData.position)}`,
      )
      delete safeData.position
    }
    // 2) emotion
    if (!trusted && safeData && 'emotion' in safeData && safeData.emotion) {
      console.warn(
        '[updateCharacterState] ⚠️ 已丢弃 emotion 更新：emotion 只能由 CharacterStateRuntime 写入。' +
        ` 尝试写入：${JSON.stringify(safeData.emotion)}`,
      )
      delete safeData.emotion
    }
    // 3) emotionLevel
    if (!trusted && safeData && 'emotionLevel' in safeData && safeData.emotionLevel != null) {
      console.warn(
        '[updateCharacterState] ⚠️ 已丢弃 emotionLevel 更新。' +
        ` 尝试写入：${JSON.stringify(safeData.emotionLevel)}`,
      )
      delete safeData.emotionLevel
    }
    // 4) pose
    if (!trusted && safeData && 'pose' in safeData && safeData.pose) {
      console.warn(
        '[updateCharacterState] ⚠️ 已丢弃 pose 更新：pose 只能由 CharacterStateRuntime 写入。' +
        ` 尝试写入：${JSON.stringify(safeData.pose)}`,
      )
      delete safeData.pose
    }
    // 5) expression
    if (!trusted && safeData && 'expression' in safeData && safeData.expression) {
      console.warn(
        '[updateCharacterState] ⚠️ 已丢弃 expression 更新：expression 只能由 CharacterStateRuntime 写入。' +
        ` 尝试写入：${JSON.stringify(safeData.expression)}`,
      )
      delete safeData.expression
    }
    // 6) interaction
    if (!trusted && safeData && 'interaction' in safeData && safeData.interaction) {
      console.warn(
        '[updateCharacterState] ⚠️ 已丢弃 interaction 更新：interaction 只能由 CharacterStateRuntime 写入。' +
        ` 尝试写入：${JSON.stringify(safeData.interaction)}`,
      )
      delete safeData.interaction
    }

    characterState[characterId] = {
      ...existing,
      ...safeData,
      timestamp: Date.now(),
    }
    set({ characterState })
    saveToStorage(STORAGE_KEYS.CHARACTER_STATE, characterState)
  },

  /**
   * 获取指定角色的当前状态快照
   * @param {string} characterId - 角色ID
   * @returns {{ position: string, clothing: string, action: string, heldItems: string[], timestamp: number }}
   */
  getCharacterState: (characterId) => {
    const state = get().characterState[characterId]
    if (state) return state
    return get().getDefaultState()
  },

  /**
   * 重置指定角色的状态快照为默认
   * @param {string} characterId - 角色ID
   */
  resetCharacterState: (characterId) => {
    const characterState = { ...get().characterState }
    characterState[characterId] = get().getDefaultState()
    set({ characterState })
    saveToStorage(STORAGE_KEYS.CHARACTER_STATE, characterState)
  },

  // ===== 角色衣橱管理 =====
  /**
   * 初始化角色衣橱数据（从 sr_characters.json 加载）
   * @param {string} characterId - 角色ID
   * @param {Object} character - 角色对象（含 srCharacterRef）
   */
  initWardrobe: (characterId, character) => {
    if (!character || character.worldview !== 'star_rail') return
    
    const { wardrobeData } = get()
    if (wardrobeData[characterId]) return // 已初始化
    
    const srChar = findCharacter(character.srCharacterRef || character.name)
    
    if (srChar && srChar.wardrobe) {
      wardrobeData[characterId] = JSON.parse(JSON.stringify(srChar.wardrobe))
      set({ wardrobeData })
    }
  },

  /**
   * 获取角色衣橱
   * @param {string} characterId - 角色ID
   * @returns {Object} 衣橱数据 { "服装名": { outfit, hair, accessories, other_features, style } }
   */
  getWardrobe: (characterId) => {
    const { wardrobeData } = get()
    return wardrobeData[characterId] || null
  },

  /**
   * 添加或更新衣橱中的服装
   * @param {string} characterId - 角色ID
   * @param {string} outfitName - 服装名称
   * @param {Object} outfitData - 服装数据 { outfit, hair, accessories, other_features, style }
   */
  updateWardrobe: (characterId, outfitName, outfitData) => {
    const { wardrobeData } = get()
    if (!wardrobeData[characterId]) {
      wardrobeData[characterId] = {}
    }
    wardrobeData[characterId] = {
      ...wardrobeData[characterId],
      [outfitName]: {
        outfit: outfitData.outfit || '',
        hair: outfitData.hair || '',
        accessories: outfitData.accessories || '',
        other_features: outfitData.other_features || '',
        style: outfitData.style || '日常',
      },
    }
    set({ wardrobeData })
  },

  /**
   * 删除衣橱中的服装（不允许删除"默认"）
   * @param {string} characterId - 角色ID
   * @param {string} outfitName - 服装名称
   */
  deleteOutfit: (characterId, outfitName) => {
    if (outfitName === '默认') return // 不允许删除默认服装
    const { wardrobeData, currentOutfit } = get()
    if (wardrobeData[characterId]) {
      delete wardrobeData[characterId][outfitName]
      set({ wardrobeData })
    }
    // 如果当前穿的是被删除的服装，切换回默认
    if (currentOutfit[characterId] === outfitName) {
      currentOutfit[characterId] = '默认'
      set({ currentOutfit })
      saveToStorage(STORAGE_KEYS.CURRENT_OUTFIT, currentOutfit)
    }
  },

  /**
   * 获取角色当前穿着的服装名称
   * @param {string} characterId - 角色ID
   * @returns {string} 服装名称
   */
  getCurrentOutfitName: (characterId) => {
    const { currentOutfit } = get()
    return currentOutfit[characterId] || '默认'
  },

  /**
   * 设置角色当前穿着的服装
   * @param {string} characterId - 角色ID
   * @param {string} outfitName - 服装名称
   */
  setCurrentOutfit: (characterId, outfitName) => {
    const { currentOutfit } = get()
    currentOutfit[characterId] = outfitName
    set({ currentOutfit })
    saveToStorage(STORAGE_KEYS.CURRENT_OUTFIT, currentOutfit)
  },

  /**
   * 获取当前服装的完整描述文本
   * @param {string} characterId - 角色ID
   * @returns {string} 服装描述
   */
  getCurrentOutfitDescription: (characterId) => {
    const { wardrobeData, currentOutfit } = get()
    const wardrobe = wardrobeData[characterId]
    const outfitName = currentOutfit[characterId] || '默认'
    
    if (!wardrobe || !wardrobe[outfitName]) {
      return ''
    }
    
    const outfit = wardrobe[outfitName]
    const parts = []
    if (outfit.outfit) parts.push(outfit.outfit)
    if (outfit.hair) parts.push(outfit.hair)
    if (outfit.accessories) parts.push(outfit.accessories)
    if (outfit.other_features) parts.push(outfit.other_features)
    return parts.join('；')
  },

  /**
   * AI智能选择服装：根据场景关键词匹配 style 标签
   * 换装优先级：用户括号指令 > AI智能选择 > 默认服装
   * @param {string} characterId - 角色ID
   * @param {string} sceneHint - 场景关键词（如"海边"、"宴会"、"运动"）
   * @returns {{ outfitName: string, description: string, matched: boolean }}
   */
  selectCostume: (characterId, sceneHint) => {
    const { wardrobeData, currentOutfit } = get()
    const wardrobe = wardrobeData[characterId]
    
    if (!wardrobe || Object.keys(wardrobe).length === 0) {
      return { outfitName: '默认', description: '', matched: false }
    }
    
    if (!sceneHint) {
      const name = currentOutfit[characterId] || '默认'
      return { outfitName: name, description: get().getCurrentOutfitDescription(characterId), matched: false }
    }
    
    const hint = sceneHint.toLowerCase()
    
    // 场景 → style 标签映射
    const sceneStyleMap = {
      '海边': ['泳装', '夏日', '度假', '清凉'],
      '沙滩': ['泳装', '夏日', '度假', '清凉'],
      '游泳': ['泳装', '运动'],
      '宴会': ['礼服', '正式', '华丽', '晚宴'],
      '舞会': ['礼服', '正式', '华丽'],
      '派对': ['派对', '休闲', '时尚'],
      '运动': ['运动', '休闲'],
      '跑步': ['运动', '休闲'],
      '健身': ['运动', '休闲'],
      '睡衣': ['睡衣', '居家'],
      '睡觉': ['睡衣', '居家'],
      '居家': ['居家', '休闲', '日常'],
      '约会': ['约会', '时尚', '可爱'],
      '正式': ['正式', '礼服', '商务'],
      '战斗': ['战斗', '机甲'],
      '外出': ['外出', '日常', '休闲'],
      '逛街': ['休闲', '时尚', '日常'],
      '咖啡': ['休闲', '日常'],
      '旅行': ['旅行', '休闲', '日常'],
      '冬天': ['冬装', '保暖'],
      '夏天': ['夏装', '清凉', '泳装'],
      '下雨': ['雨衣', '日常'],
    }
    
    // 找到匹配的 style 标签
    let targetStyles = []
    for (const [keyword, styles] of Object.entries(sceneStyleMap)) {
      if (hint.includes(keyword)) {
        targetStyles = styles
        break
      }
    }
    
    if (targetStyles.length === 0) {
      const name = currentOutfit[characterId] || '默认'
      return { outfitName: name, description: get().getCurrentOutfitDescription(characterId), matched: false }
    }
    
    // 从衣橱中找匹配 style 的服装
    let bestMatch = null
    let bestScore = 0
    
    for (const [name, data] of Object.entries(wardrobe)) {
      if (name === '默认') continue
      const style = (data.style || '').toLowerCase()
      for (let i = 0; i < targetStyles.length; i++) {
        if (style.includes(targetStyles[i].toLowerCase())) {
          const score = targetStyles.length - i // 越靠前的标签得分越高
          if (score > bestScore) {
            bestScore = score
            bestMatch = { name, data }
          }
          break
        }
      }
    }
    
    if (bestMatch) {
      const parts = []
      if (bestMatch.data.outfit) parts.push(bestMatch.data.outfit)
      if (bestMatch.data.hair) parts.push(bestMatch.data.hair)
      if (bestMatch.data.accessories) parts.push(bestMatch.data.accessories)
      if (bestMatch.data.other_features) parts.push(bestMatch.data.other_features)
      return { outfitName: bestMatch.name, description: parts.join('；'), matched: true }
    }
    
    // 没有匹配的服装，使用默认服装做合理演绎
    const defaultOutfit = wardrobe['默认']
    if (defaultOutfit) {
      const parts = []
      if (defaultOutfit.outfit) parts.push(defaultOutfit.outfit)
      if (defaultOutfit.hair) parts.push(defaultOutfit.hair)
      if (defaultOutfit.accessories) parts.push(defaultOutfit.accessories)
      if (defaultOutfit.other_features) parts.push(defaultOutfit.other_features)
      return { outfitName: '默认', description: parts.join('；'), matched: false }
    }
    
    return { outfitName: '默认', description: '', matched: false }
  },

  // ===== 多人对话：临时角色状态管理 =====
  /**
   * 获取指定 guest 角色的状态快照
   * @param {string} characterId - 主角色ID
   * @param {string} guestName - guest 角色名
   * @returns {Object} 状态快照
   */
  getGuestCharacterState: (characterId, guestName) => {
    const guestStates = get().guestCharacterStates
    const key = `${characterId}:${guestName}`
    const state = guestStates[key]
    if (state) return state
    return get().getDefaultState()
  },

  /**
   * 更新指定 guest 角色的状态快照
   * @param {string} characterId - 主角色ID
   * @param {string} guestName - guest 角色名
   * @param {Object} stateData - 要更新的状态字段
   */
  updateGuestCharacterState: (characterId, guestName, stateData) => {
    const guestCharacterStates = { ...get().guestCharacterStates }
    const key = `${characterId}:${guestName}`
    const existing = guestCharacterStates[key] || get().getDefaultState()
    guestCharacterStates[key] = {
      ...existing,
      ...stateData,
      timestamp: Date.now(),
    }
    set({ guestCharacterStates })
    saveToStorage(STORAGE_KEYS.GUEST_CHARACTER_STATES, guestCharacterStates)
  },

  /**
   * 移除指定 guest 角色的状态快照（角色离开时调用）
   * @param {string} characterId - 主角色ID
   * @param {string} guestName - guest 角色名
   */
  removeGuestCharacterState: (characterId, guestName) => {
    const guestCharacterStates = { ...get().guestCharacterStates }
    const key = `${characterId}:${guestName}`
    delete guestCharacterStates[key]
    set({ guestCharacterStates })
    saveToStorage(STORAGE_KEYS.GUEST_CHARACTER_STATES, guestCharacterStates)
  },

  // ===== 场景事件摘要管理 =====

  /**
   * 获取所有场景事件
   * @returns {Array}
   */
  getSceneEvents: () => {
    return get().sceneEvents || []
  },

  /**
   * 获取包含指定角色的所有场景事件摘要
   * @param {string} characterName - 角色名
   * @returns {Array}
   */
  getCharacterSceneEvents: (characterName) => {
    const events = get().sceneEvents || []
    return events.filter((e) =>
      e.participants && e.participants.includes(characterName)
    ).sort((a, b) => new Date(b.date) - new Date(a.date))
  },

  /**
   * 添加场景事件摘要
   * @param {Object} eventData - { date, participants, summary, characterId }
   * @returns {Object} 新创建的事件
   */
  addSceneEvent: (eventData) => {
    const sceneEvents = [...get().sceneEvents]
    const newEvent = {
      id: uuidv4(),
      date: eventData.date || new Date().toISOString(),
      participants: eventData.participants || [],
      summary: eventData.summary || '',
      characterId: eventData.characterId || null,
      createdAt: Date.now(),
    }
    sceneEvents.push(newEvent)
    set({ sceneEvents })
    saveToStorage(STORAGE_KEYS.SCENE_EVENTS, sceneEvents)
    return newEvent
  },

  /**
   * 删除场景事件
   * @param {string} eventId - 事件ID
   */
  deleteSceneEvent: (eventId) => {
    const sceneEvents = get().sceneEvents.filter((e) => e.id !== eventId)
    set({ sceneEvents })
    saveToStorage(STORAGE_KEYS.SCENE_EVENTS, sceneEvents)
  },

  /**
   * 设置多人对话会话开始时间
   */
  setMultiCharSessionStart: (timestamp) => {
    set({ multiCharSessionStart: timestamp })
  },

  // ================================================================
  // A-2：调度器过滤日志 UI 支撑
  // ================================================================
  /**
   * 读取某角色某条 assistant 消息对应的调度器过滤日志
   */
  getDispatcherLogForMessage: (characterId, messageId) => {
    try {
      const key = STORAGE_KEYS.DISPATCHER_LOG_MAP
      const all = loadFromStorage(key) || {}
      const perChar = all[characterId] || {}
      return perChar[messageId] || null
    } catch (_) { return null }
  },

  /**
   * 读取某角色最近 N 条 assistant 消息的调度器日志（按消息时间倒序返回对应有日志的）
   */
  getRecentDispatcherLogsForCharacter: (characterId, messageIds) => {
    try {
      const key = STORAGE_KEYS.DISPATCHER_LOG_MAP
      const all = loadFromStorage(key) || {}
      const perChar = all[characterId] || {}
      const ids = Array.isArray(messageIds) ? messageIds : []
      const out = []
      for (const mid of ids) {
        if (perChar[mid]) out.push({ messageId: mid, log: perChar[mid] })
      }
      return out
    } catch (_) { return [] }
  },

  /** 开启/关闭调度器过滤日志折叠条显示 */
  setShowDispatcherLogs: (on) => {
    set({ showDispatcherLogs: !!on })
    try { localStorage.setItem('ai-chat-ui-pref-show-dispatcher-logs', on ? '1' : '0') } catch (_) {}
  },

  /** 清除某角色或全局调度器过滤日志（可选） */
  clearDispatcherLogs: (characterId) => {
    try {
      const key = STORAGE_KEYS.DISPATCHER_LOG_MAP
      const all = loadFromStorage(key) || {}
      if (characterId) {
        delete all[characterId]
      } else {
        for (const k of Object.keys(all)) delete all[k]
      }
      saveToStorage(key, all)
    } catch (_) {}
  },

  // ================================================================
  // C-1：顶部模式角标 + 一键解散所有客串
  // ================================================================
  /**
   * 一键解散当前主角色的所有客串角色（回到单人模式），插入系统消息
   * @returns {string[]} 被解散的角色名列表
   */
  dismissAllGuests: () => {
    const { currentCharacterId, activeCharacters, guestCharacterStates, messages, characters } = get()
    if (!currentCharacterId) return []
    const mainChar = characters.find((c) => c.id === currentCharacterId)
    const mainName = mainChar?.name || '主角色'
    const activeChars = activeCharacters[currentCharacterId] || []
    if (activeChars.length === 0) return []

    // 1. 更新 activeCharacters
    const nextActive = { ...activeCharacters, [currentCharacterId]: [] }
    // 2. 清理所有 guest 的独立状态
    const nextGuestStates = { ...guestCharacterStates }
    for (const name of activeChars) {
      const k = `${currentCharacterId}:${name}`
      delete nextGuestStates[k]
    }
    // 3. 插入"系统消息"（一键解散）
    const now = Date.now()
    const systemMsg = {
      id: uuidv4(),
      characterId: currentCharacterId,
      role: 'system',
      content: `【系统】多人聊天结束，${activeChars.join('、')} 已离开，现在只留下${mainName}陪你了。`,
      speaker: '系统',
      timestamp: now,
      _local: true,
    }
    const charMessages = messages[currentCharacterId] || []
    const nextMessages = {
      ...messages,
      [currentCharacterId]: [...charMessages, systemMsg],
    }

    set({
      activeCharacters: nextActive,
      guestCharacterStates: nextGuestStates,
      messages: nextMessages,
      multiCharSessionStart: null,
    })
    saveToStorage(STORAGE_KEYS.ACTIVE_CHARACTERS, nextActive)
    saveToStorage(STORAGE_KEYS.GUEST_CHARACTER_STATES, nextGuestStates)
    saveToStorage(STORAGE_KEYS.MESSAGES, nextMessages)
    return activeChars
  },

  // ================================================================
  // C-2：长沉默客串自动退场 Watcher
  // ================================================================
  /**
   * 读取长沉默客串自动退场用户偏好
   */
  getAutoDismissSettings: () => {
    try {
      const s = loadFromStorage(STORAGE_KEYS.AUTO_DISMISS_SETTINGS) || {}
      const minutes = Number(s.minutes)
      return {
        // 支持：0=关闭 | 15 | 30 | 60
        minutes: [0, 15, 30, 60].includes(minutes) ? minutes : 30,
      }
    } catch (_) {
      return { minutes: 30 }
    }
  },

  /**
   * 设置长沉默客串自动退场用户偏好
   */
  setAutoDismissSettings: (patch) => {
    try {
      const cur = get().getAutoDismissSettings()
      const next = { ...cur, ...(patch || {}) }
      if (![0, 15, 30, 60].includes(Number(next.minutes))) next.minutes = 30
      saveToStorage(STORAGE_KEYS.AUTO_DISMISS_SETTINGS, next)
      return next
    } catch (_) { return null }
  },

  /**
   * 当某 guest 发言 / 被召唤时，更新其 lastSpeakTime（写入独立状态，不影响原有字段）
   */
  touchGuestLastSpeakTime: (characterId, guestName) => {
    if (!characterId || !guestName) return
    const guestCharacterStates = { ...get().guestCharacterStates }
    const key = `${characterId}:${guestName}`
    const existing = guestCharacterStates[key] || {}
    guestCharacterStates[key] = { ...existing, lastSpeakTime: Date.now() }
    set({ guestCharacterStates })
    saveToStorage(STORAGE_KEYS.GUEST_CHARACTER_STATES, guestCharacterStates)
  },

  /**
   * 在 messages 写入时同步"每条 assistant 消息 speaker 的 lastSpeakTime"
   */
  syncSpeakerLastSpeakTimesFromMessages: (characterId, finalMessagesArr) => {
    if (!characterId || !Array.isArray(finalMessagesArr)) return
    const guestCharacterStates = { ...get().guestCharacterStates }
    let changed = false
    const activeNow = new Set(get().activeCharacters[characterId] || [])
    for (const m of finalMessagesArr) {
      if (!m || m.role !== 'assistant') continue
      const name = m.speaker
      if (!name || !activeNow.has(name)) continue
      const key = `${characterId}:${name}`
      const ts = Number(m.timestamp) || Date.now()
      const existing = guestCharacterStates[key] || {}
      if (!existing.lastSpeakTime || existing.lastSpeakTime < ts) {
        guestCharacterStates[key] = { ...existing, lastSpeakTime: ts }
        changed = true
      }
    }
    if (changed) {
      set({ guestCharacterStates })
      saveToStorage(STORAGE_KEYS.GUEST_CHARACTER_STATES, guestCharacterStates)
    }
  },

  /**
   * C-2 Watcher：检查并执行长沉默客串自动退场（返回 {dismissed:[], toasts:[]}，让 UI 挂非阻塞气泡）
   * 只处理"当前主角色"，避免跨角色扫描。
   */
  runAutoDismissWatcherOnce: () => {
    const { currentCharacterId, activeCharacters, guestCharacterStates, messages, characters } = get()
    if (!currentCharacterId) return { dismissed: [], toasts: [] }

    const pref = get().getAutoDismissSettings()
    if (pref.minutes === 0) return { dismissed: [], toasts: [] } // 关闭

    const thresholdMs = pref.minutes * 60 * 1000
    const now = Date.now()
    const activeChars = activeCharacters[currentCharacterId] || []
    if (activeChars.length === 0) return { dismissed: [], toasts: [] }

    const toDismiss = []
    for (const name of activeChars) {
      const k = `${currentCharacterId}:${name}`
      const state = guestCharacterStates[k] || {}
      const last = Number(state.lastSpeakTime) || 0
      // 如果从未发言，用"被召唤的初始化时间"兜底（state.timestamp）
      const base = last > 0 ? last : (Number(state.timestamp) || now)
      if (now - base >= thresholdMs) {
        toDismiss.push(name)
      }
    }
    if (toDismiss.length === 0) return { dismissed: [], toasts: [] }

    // 执行离场（每个角色：activeChars 移除、状态移除、插系统消息）
    const nextActive = activeChars.filter((n) => !toDismiss.includes(n))
    const nextActiveCharacters = { ...activeCharacters, [currentCharacterId]: nextActive }
    const nextGuestStates = { ...guestCharacterStates }
    for (const name of toDismiss) {
      const k = `${currentCharacterId}:${name}`
      delete nextGuestStates[k]
    }

    const systemParts = toDismiss.map(
      (n) => `【系统】${n} 沉默了${pref.minutes}分钟以上，先回去休息了（自动退场）。`,
    )
    const mainChar = characters.find((c) => c.id === currentCharacterId)
    if (nextActive.length === 0 && toDismiss.length > 0) {
      systemParts.push(`【系统】现在只留下${mainChar?.name || '主角色'}陪你了。`)
    }
    const systemMsg = {
      id: uuidv4(),
      characterId: currentCharacterId,
      role: 'system',
      content: systemParts.join('\n'),
      speaker: '系统',
      timestamp: now,
      _local: true,
    }
    const charMessages = messages[currentCharacterId] || []
    const nextMessages = {
      ...messages,
      [currentCharacterId]: [...charMessages, systemMsg],
    }

    const toasts = toDismiss.map((n) => ({
      guestName: n,
      reason: `沉默了${pref.minutes}分钟，自动退场了`,
      timestamp: now,
    }))

    set({
      activeCharacters: nextActiveCharacters,
      guestCharacterStates: nextGuestStates,
      messages: nextMessages,
      multiCharSessionStart: nextActive.length === 0 ? null : get().multiCharSessionStart,
      autoDismissToasts: [...(get().autoDismissToasts || []), ...toasts].slice(-5), // 最多5条
    })
    saveToStorage(STORAGE_KEYS.ACTIVE_CHARACTERS, nextActiveCharacters)
    saveToStorage(STORAGE_KEYS.GUEST_CHARACTER_STATES, nextGuestStates)
    saveToStorage(STORAGE_KEYS.MESSAGES, nextMessages)
    return { dismissed: toDismiss, toasts }
  },

  /** 清除一条/所有自动退场提示气泡（非阻塞） */
  clearAutoDismissToast: (idxOrAll = 'all') => {
    const cur = get().autoDismissToasts || []
    if (idxOrAll === 'all') {
      set({ autoDismissToasts: [] })
    } else if (Number.isInteger(idxOrAll) && cur[idxOrAll]) {
      const next = [...cur]
      next.splice(idxOrAll, 1)
      set({ autoDismissToasts: next })
    }
  },

  // ===== 消息管理（增强版） =====
  sendMessage: async (content, quoteTarget = null) => {
    const { currentCharacterId, characters, messages, settings, memorySummaries, memories, enhancedMemories, temporaryStates } = get()
    if (!currentCharacterId || !content.trim()) return

    const character = characters.find((c) => c.id === currentCharacterId)
    if (!character) return

    // 追问10分钟时效检查 + 仅限最后一条 AI 回复（追问对象约束）
    if (quoteTarget) {
      const QUOTE_WINDOW = 10 * 60 * 1000 // 10分钟
      const elapsed = Date.now() - quoteTarget.timestamp
      if (elapsed > QUOTE_WINDOW) {
        set({ error: '该消息已超过可追问时间' })
        return
      }
      // 追问对象必须是最后一条 AI 消息（用户只能针对最新 AI 回复追问）
      // 避免引用历史旧消息，保持上下文连续
      const existing = messages[currentCharacterId] || []
      for (let i = existing.length - 1; i >= 0; i--) {
        const m = existing[i]
        if (m.id === quoteTarget.id) break
        if (m.role === 'assistant' && !m.recalled) {
          set({ error: '仅能追问最后一条 AI 回复' })
          return
        }
      }
    }

    const userMessage = {
      id: uuidv4(),
      characterId: currentCharacterId,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      quoteTarget: quoteTarget ? {
        messageId: quoteTarget.id,
        content: quoteTarget.content,
        sender: quoteTarget.role === 'user' ? '用户' : (character.name || 'AI'),
        timestamp: quoteTarget.timestamp,
      } : null,
    }

    const charMessages = messages[currentCharacterId] || []
    const updatedMessages = {
      ...messages,
      [currentCharacterId]: [...charMessages, userMessage],
    }

    set({ messages: updatedMessages, isLoading: true, error: null })
    saveToStorage(STORAGE_KEYS.MESSAGES, updatedMessages)

    // ===== V3 场景解析与更新（SceneEngine） =====
    // 使用 SceneUpdater 解析用户消息中的场景变更指令
    const sceneUpdater = getSceneUpdater(currentCharacterId)
    const sceneCommands = sceneUpdater.parseUserMessage(content.trim())
    const sceneChanged = sceneUpdater.applyCommands(sceneCommands)

    // ===== V1 角色状态解析与更新（CharacterStateEngine） =====
    // 解析用户消息中提到的"情绪/动作/互动"指令，严格按白名单识别。
    // 禁止把任意聊天文本写入 CharacterStateManager，从源头避免顶部污染。
    const charStateUpdater = getCharacterStateUpdater(currentCharacterId)
    const charStateChanged = charStateUpdater.applyUserMessage(content.trim())

    // 同步向后兼容：更新旧版 currentScene 和 characterState
    // ---------------------------------------------------------------
    // ⚠️ 注意：这里是"权威数据"的后向同步（SceneManager → legacy store）。
    //   因此使用 __source: 'SceneEngine' 签名，允许 updateCharacterState
    //   写入 position 字段（默认已被普通路径的守卫拦截）。
    // ---------------------------------------------------------------
    const sceneManager = getSceneManager(currentCharacterId)
    const sceneState = sceneManager.getState()
    const charStateManager = getCharacterStateManager(currentCharacterId)
    const charStateLatest = charStateManager.getState()
    const __charStateNameMap = {
      emotion: {
        happy: '开心', gentle: '温柔', shy: '害羞', calm: '平静', relaxed: '放松',
        excited: '兴奋', thinking: '思考中', sleepy: '困倦', nervous: '紧张', sad: '难过',
        angry: '生气', disappointed: '失落', surprised: '惊讶', confused: '迷惑',
        grievance: '委屈', expectant: '期待', attached: '依恋', relieved: '安心',
        amused: '忍俊不禁', blushing: '脸红',
      },
      action: {
        sitting: '坐着', standing: '站着', leaning_wall: '靠着墙', walking: '走路',
        strolling: '散步', turning_back: '回头', waving: '挥手', nodding: '点头',
        shaking_head: '摇头', stretching: '伸懒腰', reading: '看书', using_phone: '看手机',
        drinking_water: '喝水', drinking_tea: '喝茶', eating: '吃东西', cooking: '做饭',
        cleaning_room: '整理房间', looking_out_window: '望向窗外', spacing_out: '发呆',
        thinking: '思考', resting: '休息', sleeping: '睡觉', just_woke: '刚醒来',
        speaking_softly: '轻声说话', moving_closer: '靠近你', stepping_back: '后退半步',
        holding_hands: '牵手', hugging: '拥抱', stroking_hair: '抚摸头发',
        chuckling: '轻笑', sighing: '叹气', avoiding_eyes: '躲闪视线',
        fidgeting_clothes: '摆弄衣角',
      },
      pose: {
        on_sofa: '坐在沙发上', on_bedside: '坐在床边', standing: '站立',
        leaning: '斜靠着', bending_forward: '俯身', sideways: '侧身',
        hands_behind: '双手背后', arms_crossed: '双手抱胸', hand_on_cheek: '单手扶脸',
        hands_on_knees: '双手放在膝上', gently_near: '轻轻靠近', head_down: '低头',
        head_up: '抬头', on_tiptoes: '微微踮脚', huddled_corner: '缩在角落',
        lying_lazy: '慵懒地躺着',
      },
      expression: {
        smile: '微笑', laugh: '笑', giggle: '偷笑', soft_smile: '浅笑',
        gentle_smile: '温柔笑', blush: '害羞脸红', serious: '认真', shocked: '惊讶',
        puzzled: '困惑', squinting: '眯眼', winking: '眨眼', silent: '沉默',
        frowning: '皱眉', contemplative: '若有所思', dejected: '失落', helpless: '无奈',
        fond: '宠溺', coquettish: '撒娇', staring: '认真注视', no_expression: '',
      },
      interaction: {
        chatting: '正在聊天', waiting: '等待回复', looking_at_you: '看着你',
        accompanying: '陪着你', snuggling_you: '依偎着你', holding_your_hand: '牵着你的手',
        hugging_you: '拥抱你', leaning_on_you: '轻轻靠着你', listening_to_you: '听你说话',
        being_praised: '被你夸奖', being_comforted: '被你安慰', being_teased: '被你逗笑',
        jealous: '吃醋中', missing_you: '想你', worrying_about_you: '担心你',
        guarding_you: '守着你', on_date: '约会中', enjoying_view: '一起看风景',
        resting_together: '一起休息',
      },
    }

    if (sceneChanged || charStateChanged) {
      if (sceneChanged) {
        get().updateScene(currentCharacterId, {
          name: sceneState.location,
          items: sceneState.interactableObjects.map((o) => o.name),
        })
      }
      get().updateCharacterState(currentCharacterId, {
        __source: 'SceneEngine',
        position: `${sceneState.location}${sceneState.area ? ' ' + sceneState.area : ''}${sceneState.position ? ' ' + sceneState.position : ''}`.trim(),
        action: __charStateNameMap.action[charStateLatest.action] || charStateLatest.action || '',
        emotion: __charStateNameMap.emotion[charStateLatest.emotion] || charStateLatest.emotion || '',
        emotionLevel: charStateLatest.emotionLevel != null ? charStateLatest.emotionLevel : 1,
        pose: __charStateNameMap.pose[charStateLatest.pose] || charStateLatest.pose || '',
        expression: __charStateNameMap.expression[charStateLatest.expression] || charStateLatest.expression || '',
        interaction: __charStateNameMap.interaction[charStateLatest.interaction] || charStateLatest.interaction || '',
      })
    }

    // 获取场景快照提示词（V3 极简版，几十 Token）
    const sceneSnapshotPrompt = sceneManager.buildSnapshotPrompt()

    // 保持向后兼容：旧版场景上下文
    const sceneContext = get().getCurrentScene(currentCharacterId)

    // ===== 角色状态快照解析与更新 =====
    const currentCharState = get().getCharacterState(currentCharacterId)
    const stateResult = parseCharacterStateFromMessage(content.trim(), currentCharState, character.name)

    if (stateResult.changed && stateResult.state) {
      get().updateCharacterState(currentCharacterId, stateResult.state)
    }

    // ===== 角色衣橱初始化与换装逻辑 =====
    // 换装优先级：用户括号指令 > AI智能选择 > 默认服装
    get().initWardrobe(currentCharacterId, character)

    // 1. 处理括号指令强制换装
    if (stateResult.costumeChange && stateResult.costumeChange.isTemp) {
      const { outfitName, description } = stateResult.costumeChange
      const wardrobe = get().getWardrobe(currentCharacterId)
      
      // 检查衣橱中是否有同名服装
      if (wardrobe && wardrobe[outfitName]) {
        // 衣橱中有此服装，直接切换
        get().setCurrentOutfit(currentCharacterId, outfitName)
      } else {
        // 衣橱中没有此服装，生成临时服装条目（用户括号指令强制）
        // 官方角色不受此限制影响（自定义服装）
        get().updateWardrobe(currentCharacterId, outfitName, {
          outfit: description,
          hair: '',
          accessories: '',
          other_features: '',
          style: '临时',
        })
        get().setCurrentOutfit(currentCharacterId, outfitName)
      }
      
      // 确保状态快照中的衣着字段已更新
      const currentState = get().getCharacterState(currentCharacterId)
      if (!currentState.clothing || currentState.clothing !== description) {
        get().updateCharacterState(currentCharacterId, { clothing: description })
      }
    }
    // 2. AI智能选择：场景触发自动换装（无括号指令时）
    else if (!stateResult.costumeChange) {
      // 检测场景关键词，触发AI智能换装
      const sceneKeywords = ['海边', '沙滩', '游泳', '宴会', '舞会', '派对', '运动', '跑步', '健身', '睡觉', '居家', '约会', '正式', '战斗', '逛街', '旅行', '冬天', '夏天', '下雨']
      const cleanContent = content.replace(/（[^）]+）/g, '').trim()
      let matchedScene = null
      for (const kw of sceneKeywords) {
        if (cleanContent.includes(kw)) {
          matchedScene = kw
          break
        }
      }
      
      if (matchedScene) {
        const costumeResult = get().selectCostume(currentCharacterId, matchedScene)
        if (costumeResult.matched && costumeResult.description) {
          // AI智能选择成功，更新衣着
          get().setCurrentOutfit(currentCharacterId, costumeResult.outfitName)
          get().updateCharacterState(currentCharacterId, { clothing: costumeResult.description })
        }
        // 如果没匹配到，保持默认服装不变
      }
    }

    // ===== Prompt 上下文：用 SceneRuntime + CharacterStateRuntime 权威数据 覆盖 =====
    // ---------------------------------------------------------------
    // 背景：stateContext 会被注入到「角色当前实时状态」Prompt 区块里。
    // 必须完全使用 Runtime（单一数据源）的值，避免 AI 收到上一帧的旧值。
    //   - position：来自 SceneManager（权威位置）
    //   - action / emotion / emotionLevel / pose / expression / interaction：
    //     全部来自 CharacterStateManager
    // （clothing / heldItems 仍然读取 legacy characterState，独立功能）
    // ---------------------------------------------------------------
    const __rawStateContextBase = get().getCharacterState(currentCharacterId)
    const __authoritativePosition = [
      sceneState.location,
      sceneState.area,
      sceneState.position,
    ].filter(Boolean).join(' ').trim()
    const __a = (map, key, fallback = '') => (map[key] || key || fallback)

    const stateContext = {
      ...__rawStateContextBase,
      position: __authoritativePosition,
      emotion: __a(__charStateNameMap.emotion, charStateLatest.emotion, __rawStateContextBase.emotion || ''),
      emotionLevel: charStateLatest.emotionLevel != null ? charStateLatest.emotionLevel : 1,
      action: __a(__charStateNameMap.action, charStateLatest.action, __rawStateContextBase.action || ''),
      pose: __a(__charStateNameMap.pose, charStateLatest.pose, __rawStateContextBase.pose || ''),
      expression: __a(__charStateNameMap.expression, charStateLatest.expression, __rawStateContextBase.expression || ''),
      interaction: __a(__charStateNameMap.interaction, charStateLatest.interaction, ''),
    }

    // 获取官方角色设定档案（设定铁三角 · 宪法层）—— 提前计算，供多人对话上下文使用
    const officialProfile = buildOfficialCharacterProfile(character)
    // 按需动态加载：根据用户消息关键词智能决定注入哪些数据模块
    const { text: officialProfileText } = scanAndBuildProfileText(officialProfile, character, content.trim())

    // ===== 现实时间同步 =====
    const timeContext = generateTimeContext(charMessages)
    const timeContextText = formatTimeContextForPrompt(timeContext)

    // ===== V5 多人聊天协调器 =====
    // 获取可用角色列表（用于 CommandParser 验证）
    const availableCharactersList = characters.map((c) => ({ id: c.id, name: c.name }))
    const activeChars = get().activeCharacters[currentCharacterId] || []
    
    // 初始化 V5 协调器
    const coordinator = MultiCharacterCoordinator.get({
      characterId: currentCharacterId,
      characterName: character.name,
      availableCharacters: availableCharactersList,
      initialActiveCharacters: activeChars,
      initialScene: {
        location: sceneContext?.name || '默认场景',
      },
    })

    // V5 命令解析（以 / 开头的命令必须本地处理）
    const parsedCommand = parseCommand(content.trim())
    if (parsedCommand) {
      const commandResult = coordinator.processUserMessage(content.trim())
      
      // 如果是本地命令（召唤、遣散等），直接返回系统消息
      if (commandResult.type === 'command' || commandResult.type === 'error') {
        const systemMessage = {
          id: uuidv4(),
          characterId: currentCharacterId,
          role: 'assistant',
          content: commandResult.systemMessage || commandResult.error || '命令执行失败',
          speaker: '系统',
          timestamp: Date.now(),
          systemType: 'command',
        }
        const finalMessages = {
          ...get().messages,
          [currentCharacterId]: [...(get().messages[currentCharacterId] || []), systemMessage],
        }
        set({ 
          messages: finalMessages, 
          isLoading: false,
          activeCharacters: {
            ...get().activeCharacters,
            [currentCharacterId]: commandResult.activeCharacters,
          },
        })
        saveToStorage(STORAGE_KEYS.MESSAGES, finalMessages)
        saveToStorage(STORAGE_KEYS.ACTIVE_CHARACTERS, {
          ...get().activeCharacters,
          [currentCharacterId]: commandResult.activeCharacters,
        })
        return
      }
      // 如果是需要 AI 处理的命令（/换装、/场景等），继续走 AI 流程
      // commandResult.type === 'chat'
    }

    // ===== 多人聊天严格本地事件（6 种句式，绝不送入 AI）=====
    {
      const localR = processStrictLocalMultiEvent({
        content: content.trim(),
        currentCharacterId,
        mainCharName: character.name,
        sceneName: (sceneState && sceneState.name) || (sceneContext && sceneContext.name) || '',
        activeChars,
        getStore: get,
        setStore: set,
      })
      if (localR.handled) {
        if (localR.skipAiCall && localR.errorMessage) {
          // 本地错误：主角色转述（符合"失败本地返回"要求）
          const now = Date.now()
          const errorMessage = {
            id: uuidv4(),
            characterId: currentCharacterId,
            role: 'assistant',
            content: localR.errorMessage,
            speaker: character.name,
            timestamp: now,
            _local: true,
          }
          const finalMessages = {
            ...get().messages,
            [currentCharacterId]: [...(get().messages[currentCharacterId] || []), errorMessage],
          }
          set({ messages: finalMessages, isLoading: false })
          saveToStorage(STORAGE_KEYS.MESSAGES, finalMessages)
        } else if (localR.success && localR.targetId && localR.targetName && coordinator && coordinator.dispatcher) {
          // 成功：同步 V5 ConversationRuntime（addCharacter / removeCharacter），保持权威一致
          try {
            if (localR.eventType === 'CharacterEnter') {
              coordinator.dispatcher.summonCharacter({
                characterId: localR.targetId,
                characterName: localR.targetName,
                position: (sceneState && sceneState.name) || (sceneContext && sceneContext.name) || '默认场景',
                action: '加入了对话',
              })
              // C-2：新召唤进来的角色，初始化 lastSpeakTime = now
              try { get().touchGuestLastSpeakTime(currentCharacterId, localR.targetName) } catch (_e) {}
            } else if (localR.eventType === 'CharacterLeave') {
              coordinator.dispatcher.dismissCharacter(localR.targetId)
            }
          } catch (e) {
            console.warn('[LocalEvent] 同步 V5 Runtime 失败（不影响主流程）：', e)
          }
        }
        // 记录最近召唤/离场的角色 → 聊天页输入框上方快捷入口
        if (localR.targetName) {
          try {
            const LS_KEY = 'ai-chat.recentCharacters.v1'
            const MAX = 8
            let arr = []
            try {
              const raw = window.localStorage.getItem(LS_KEY)
              arr = raw ? (JSON.parse(raw) || []) : []
              if (!Array.isArray(arr)) arr = []
            } catch { arr = [] }
            arr = arr.filter((x) => x && x.name !== localR.targetName)
            arr.unshift({ name: localR.targetName, lastAt: Date.now() })
            try { window.localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(0, MAX))) } catch {}
          } catch { /* ignore */ }
        }
        return
      }
    }

    // ===== 多人对话：召唤/遣散解析（V4 兼容模式）=====
    const multiResult = parseMultiCharacterCommand(content.trim(), activeChars)

    // 处理召唤/遣散错误（角色不存在或人数超限）—— 不调用 API，直接由主角色回复
    if (multiResult.error) {
      const errorMessage = {
        id: uuidv4(),
        characterId: currentCharacterId,
        role: 'assistant',
        content: multiResult.error,
        speaker: character.name,
        timestamp: Date.now(),
      }
      const finalMessages = {
        ...get().messages,
        [currentCharacterId]: [...(get().messages[currentCharacterId] || []), errorMessage],
      }
      set({ messages: finalMessages, isLoading: false })
      saveToStorage(STORAGE_KEYS.MESSAGES, finalMessages)
      return
    }

    // 更新 activeCharacters 和 guest 状态
    let newActiveChars = [...activeChars]
    let sessionJustStarted = false
    let sessionJustEnded = false
    const dismissedCharName = multiResult.dismissed || null

    if (multiResult.summoned) {
      // 检测会话开始：从空到有
      if (activeChars.length === 0) {
        sessionJustStarted = true
        get().setMultiCharSessionStart(Date.now())
      }
      newActiveChars = [...newActiveChars, multiResult.summoned]
      // 初始化 guest 角色状态
      get().updateGuestCharacterState(currentCharacterId, multiResult.summoned, {
        position: sceneContext?.name || '',
        action: '加入了对话',
      })
    }
    if (multiResult.dismissed) {
      newActiveChars = newActiveChars.filter((n) => n !== multiResult.dismissed)
      // 清除 guest 角色状态
      get().removeGuestCharacterState(currentCharacterId, multiResult.dismissed)
      // 检测会话结束：从有到空
      if (newActiveChars.length === 0 && activeChars.length > 0) {
        sessionJustEnded = true
      }
    }

    if (multiResult.summoned || multiResult.dismissed) {
      const activeCharacters = { ...get().activeCharacters }
      activeCharacters[currentCharacterId] = newActiveChars
      set({ activeCharacters })
      saveToStorage(STORAGE_KEYS.ACTIVE_CHARACTERS, activeCharacters)
    }

    // 构建多人对话上下文（用于注入系统提示词）
    // 包含历史场景事件摘要（用于再次召唤时的记忆接续）
    let multiCharacterContext = ''
    if (newActiveChars.length > 0) {
      multiCharacterContext = buildMultiCharacterContext(character, newActiveChars, officialProfileText)

      // 注入历史场景事件摘要：为每个被召唤的角色检索历史摘要
      if (multiResult.summoned) {
        const historicalSummaries = get().getCharacterSceneEvents(multiResult.summoned)
        if (historicalSummaries.length > 0) {
          const historyParts = []
          historyParts.push('')
          historyParts.push('═══════════════════════════════════════════════')
          historyParts.push('【历史场景事件 — 角色记忆接续】')
          historyParts.push('═══════════════════════════════════════════════')
          historyParts.push('')
          historyParts.push(`以下是 ${multiResult.summoned} 之前与 ${character.name} 及用户的对话记录摘要。`)
          historyParts.push('你可以基于这些历史事件自然地提及或延续对话：')
          historyParts.push('')
          historicalSummaries.slice(0, 5).forEach((evt, i) => {
            const dateStr = new Date(evt.date).toLocaleDateString('zh-CN')
            historyParts.push(`${i + 1}. [${dateStr}] ${evt.summary}`)
          })
          historyParts.push('')
          historyParts.push('注意：在对话中自然提及历史事件即可，不需要逐条复述。')
          historyParts.push('')
          multiCharacterContext = multiCharacterContext + '\n' + historyParts.join('\n')
        }
      }
    }

    try {
      // 3. 实时情绪感知（异步，不阻塞）
      let emotionContext = null
      if (settings.apiKey) {
        senseEmotion(character, content.trim()).then((result) => {
          if (result) set({ emotionContext: result })
        }).catch(() => {})
      }

      // 过滤掉已撤回的消息，不发送给 AI
      const activeMessages = [...charMessages, userMessage].filter((m) => !m.recalled)
      const conversationHistory = activeMessages.map((m) => {
        if (m.role === 'user') {
          const result = formatBracketCommands(m.content, character.name)
          return { role: m.role, content: result.formatted }
        }
        return { role: m.role, content: m.content }
      })

      // 管理临时状态：检查最后一条用户消息是否有括号指令
      const lastUserMsg = [...charMessages, userMessage].filter((m) => m.role === 'user').pop()
      if (lastUserMsg) {
        const { temporaryState } = formatBracketCommands(lastUserMsg.content, character.name)
        if (temporaryState) {
          get().setTemporaryState(currentCharacterId, temporaryState)
        } else {
          get().clearTemporaryState(currentCharacterId)
        }
      }

      const memorySummary = memorySummaries[currentCharacterId] || null
      const charMemories = memories[currentCharacterId] || []

      // 获取增强记忆上下文
      const enhancedContext = getEnhancedContextForPrompt(currentCharacterId)
      const userProfile = getUserProfile()

      // 获取世界观上下文
      const worldviewContext = buildWorldviewContext(character)

      // 检查纪念日
      const anniversaries = checkAnniversaries(charMemories)

      // ===== 追问上下文构建 =====
      let quotedContext = null
      if (quoteTarget) {
        const activeForContext = charMessages.filter((m) => !m.recalled)
        const targetIndex = activeForContext.findIndex((m) => m.id === quoteTarget.id)
        if (targetIndex >= 0) {
          const CONTEXT_RANGE = 5
          const start = Math.max(0, targetIndex - CONTEXT_RANGE)
          const end = Math.min(activeForContext.length, targetIndex + CONTEXT_RANGE + 1)
          const contextMessages = activeForContext.slice(start, end)

          quotedContext = {
            targetMessage: {
              content: quoteTarget.content,
              sender: quoteTarget.role === 'user' ? '用户' : (character.name || 'AI'),
              time: new Date(quoteTarget.timestamp).toLocaleString('zh-CN'),
            },
            surroundingMessages: contextMessages.map((m) => {
              const result = m.role === 'user'
                ? { role: 'user', content: m.content }
                : { role: 'assistant', content: m.content }
              return {
                ...result,
                sender: m.role === 'user' ? '用户' : (character.name || 'AI'),
                time: new Date(m.timestamp).toLocaleString('zh-CN'),
                isTarget: m.id === quoteTarget.id,
              }
            }),
          }
        }
      }

      // ===== Token 优化：多人对话模式裁剪上下文窗口至最近 20 条 =====
      let conversationHistoryToSend = conversationHistory
      if (newActiveChars.length > 0) {
        conversationHistoryToSend = conversationHistory.slice(-20)
      }

      // ===== V2 三层记忆注入：使用优化版（可信度 + 热度 + 相关度）=====
      const v2Injection = getOptimizedInjection(currentCharacterId, content.trim())

      const reply = await sendChatMessage(
        conversationHistoryToSend,
        character,
        settings,
        memorySummary,
        charMemories,
        emotionContext,
        enhancedContext,
        userProfile,
        worldviewContext,
        sceneContext,
        stateContext,
        timeContextText,
        quotedContext,
        officialProfileText,
        multiCharacterContext,
        v2Injection,
        sceneSnapshotPrompt
      )

      // 提取 reply 和 usage
      let replyText = reply.reply || reply
      const usage = reply.usage || null

      // 记录聊天成本（按角色追踪）
      const allInputText = conversationHistoryToSend.map((m) => m.content).join('\n') + (enhancedContext || '')
      recordCost(allInputText, replyText, 'chat', currentCharacterId, usage)

      // ================================================================
      // B-2 + A-1：回复校验 + 重写最多 2 次上限（防 loading 卡死）
      // 同时产出 filterDropped / filterRemarks 给 A-2 的调度器过滤日志 UI
      // ================================================================
      const MAX_REGEN = 2
      let regenCount = 0
      let lastRegenReason = ''
      const filterDropped = []
      const filterRemarks = []
      let usedAutoFixInsteadOfRegen = false
      let exhaustedMaxRegen = false

      // 把 SceneEngine validator + Multi validateReply + Canon 三者的产出合并成 remarks
      const pushIssueToRemarks = (title, issue, level = 'warning') => {
        filterRemarks.push({
          title,
          level,
          type: issue?.type || 'unknown',
          message: issue?.message || String(issue || ''),
          at: new Date().toISOString(),
        })
      }

      // 当前输入用于 Canon 校验（复用 userMessage）
      const canonUserMessage = typeof content === 'string' ? content : ''

      // 如果有 activeChars（多人），先跑 ReplyValidator（ReplyPlan 的 allowedSpeakerNames 版本）
      const replyPlan = get()._lastReplyPlan || null
      const allowedSpeakers = replyPlan && Array.isArray(replyPlan.mustReply) && replyPlan.mustReply.length > 0
        ? Array.from(new Set([...replyPlan.mustReply, ...(replyPlan.optionalReply || [])]))
        : null
      const sceneStateNow = sceneManager.getState()
      const sceneLocation = (sceneStateNow && (sceneStateNow.name || sceneStateNow.sceneName)) || (sceneContext && (sceneContext.name || sceneContext.sceneName)) || undefined

      // 开始最多 MAX_REGEN+1 次校验循环
      let finalUsedText = replyText
      let validated = false
      while (!validated) {
        const sceneValidator = new ReplyValidator()
        const sceneReport = sceneValidator.validate(
          finalUsedText,
          sceneStateNow,
          newActiveChars,
          character.name,
        )
        for (const is of (sceneReport.issues || [])) {
          pushIssueToRemarks('SceneEngine', is, is.level || 'warning')
        }

        let multiReport = null
        if (newActiveChars.length > 0) {
          // 多人回复的允许角色：如果有 ReplyPlan，则用它；否则所有在场角色（含主）允许
          const knownForMulti = Array.from(new Set([character.name, ...newActiveChars]))
          const allowedForMulti = Array.isArray(allowedSpeakers) && allowedSpeakers.length
            ? allowedSpeakers
            : knownForMulti
          // 组装 allPresent（构造简单 CharacterRuntime 形态占位：只需要 characterName 足以）
          const allPresent = knownForMulti.map((n) => ({ characterName: n, state: 'awake', position: sceneLocation || '默认' }))
          try {
            // 懒加载避免单测 Node 环境 import .ts 失败
            const ReplyV = require('../core/multiCharacter/ReplyValidator')
            multiReport = ReplyV.validateReply({
              reply: finalUsedText,
              speaker: allPresent[0],
              allPresent,
              messages: [],
              knownCharacterNames: knownForMulti,
              allowedSpeakerNames: allowedForMulti,
            })
            for (const is of (multiReport.issues || [])) {
              pushIssueToRemarks('ReplyPlan / SpeakerOverreach', is, is.level || 'warning')
            }
          } catch (_e) { /* 懒加载失败则走 SceneEngine 兜底 */ }
        }

        // Canon 校验（validateWithRuntime）
        let canonReport = null
        try {
          const C = require('../core/canon')
          // 组装 plan（如果没 replyPlan，给一个兼容空结构：mustReply = 主 + 客人）
          const plan = replyPlan && typeof replyPlan === 'object'
            ? replyPlan
            : { mustReply: [character.name, ...newActiveChars].filter(Boolean), optionalReply: [], silent: [] }
          // 组装 runtime（activeCharacters 是名字列表，符合签名的 string[] 即可）
          const activeList = [character.name, ...newActiveChars].filter(Boolean)
          const runtime = {
            activeCharacters: activeList,
            characterRuntime: Object.fromEntries(
              activeList.map((n) => [
                n,
                { characterName: n, state: 'awake', position: sceneLocation || '默认', action: '聊天中', costume: '默认', weapon: '默认' },
              ]),
            ),
            scene: { location: sceneLocation, area: (sceneContext && sceneContext.area) || undefined },
          }
          canonReport = C.validateWithRuntime(finalUsedText, runtime, plan, undefined, { threshold: 95, autoFix: true })
          for (const v of (canonReport.violations || [])) {
            pushIssueToRemarks('Canon 官方设定', v, v.level || 'warning')
          }
        } catch (_ec) { /* 忽略加载失败 */ }

        // 判定：需要重写吗？
        const needSceneRegen = !sceneReport.passed && sceneReport.needsRegeneration
        const multiNeedRegen = multiReport && multiReport.shouldRegenerate === true
        const canonNeedRegen = canonReport && canonReport.shouldRegenerate === true
        const needRegenerate = needSceneRegen || multiNeedRegen || canonNeedRegen

        const sceneHasAutoFix = sceneReport.autoFixable && sceneReport.fixedText
        const multiHasAutoFix = multiReport && typeof multiReport.fixedText === 'string' && multiReport.fixedText.trim().length > 0
        const canonHasAutoFix = canonReport && typeof canonReport.fixedReply === 'string' && canonReport.fixedReply.trim().length > 0
        const hasAnyAutoFix = sceneHasAutoFix || multiHasAutoFix || canonHasAutoFix

        if (!needRegenerate) {
          // 无严重违规：能用。若有 autoFix（非强制 regenerate 的小问题），使用 autoFix 版本
          if (hasAnyAutoFix) {
            if (canonHasAutoFix) finalUsedText = canonReport.fixedReply
            else if (multiHasAutoFix) finalUsedText = multiReport.fixedText
            else finalUsedText = sceneReport.fixedText
            usedAutoFixInsteadOfRegen = true
            filterRemarks.push({
              title: '自动修正采用',
              level: 'info',
              type: 'auto_fix_applied',
              message:
                (canonHasAutoFix ? 'Canon.fixedReply 已采用' : multiHasAutoFix ? '多人 ReplyValidator.fixedText 已采用' : 'Scene 小错误 autoFixable') +
                `（共 ${filterRemarks.length} 条问题）`,
              at: new Date().toISOString(),
            })
          }
          validated = true
          break
        }

        // 需要 regenerate。看看还剩几次机会
        if (regenCount >= MAX_REGEN) {
          // B-2：达到上限 — 不再调 API，直接优先使用 autoFix 版本落盘，没有就用原始文本
          exhaustedMaxRegen = true
          filterDropped.push({
            level: 'warning',
            type: 'max_regen_exhausted',
            speaker: lastRegenReason ? 'ALL' : undefined,
            reason: `连续 ${regenCount} 次违反调度规则（${lastRegenReason || '校验不通过'}），已停止重写并输出精简回答。`,
          })
          if (hasAnyAutoFix) {
            if (canonHasAutoFix) finalUsedText = canonReport.fixedReply
            else if (multiHasAutoFix) finalUsedText = multiReport.fixedText
            else finalUsedText = sceneReport.fixedText
          }
          validated = true
          break
        }

        // 还有重写机会：向 DeepSeek 再要一次
        regenCount += 1
        const regenReasons = []
        if (sceneReport.needsRegeneration && sceneReport.regenerationReason) regenReasons.push(sceneReport.regenerationReason)
        if (multiReport && multiReport.issues && multiReport.issues.some((x) => x.level === 'error')) {
          const firstErr = multiReport.issues.find((x) => x.level === 'error')
          if (firstErr) regenReasons.push(firstErr.message)
        }
        if (canonReport && canonReport.violations && canonReport.violations.some((v) => v.level === 'error')) {
          const cv = canonReport.violations.find((v) => v.level === 'error')
          if (cv) regenReasons.push(cv.message)
        }
        lastRegenReason = regenReasons[0] || '规则违规'
        const regenHintTail =
          sceneLocation ? ` 不要离开当前地点【${sceneLocation}】。` : ''
        const regenHint =
          ' | [重试 #' + regenCount + '/' + MAX_REGEN + '] 严重违反规则：' +
          regenReasons.slice(0, 2).join('；').slice(0, 180) +
          '。请严格遵守调度器允许的发言白名单（allowedSpeakerNames=' +
          (Array.isArray(allowedSpeakers) ? allowedSpeakers.join('/') : 'ALL') +
          '），不要主角色代答，严格符合每个人 Canon 设定。' + regenHintTail
        filterDropped.push({
          level: 'error',
          type: 'regenerate_' + regenCount,
          speaker: 'ALL',
          reason: `本轮第 ${regenCount} 次重写（MAX=${MAX_REGEN}）：${lastRegenReason}`,
        })
        try {
          const retryReply = await sendChatMessage(
            conversationHistoryToSend,
            character,
            settings,
            memorySummary,
            charMemories,
            emotionContext,
            enhancedContext,
            userProfile,
            worldviewContext,
            sceneContext,
            stateContext,
            timeContextText,
            quotedContext,
            officialProfileText,
            multiCharacterContext,
            v2Injection,
            (sceneSnapshotPrompt || '') + regenHint,
          )
          finalUsedText = retryReply.reply || retryReply
        } catch (e) {
          console.warn('[Regen] 重新生成失败，使用当前文本：', e)
          validated = true
          break
        }
      }

      replyText = finalUsedText

      // ===== V5 协调器：更新 Runtime 状态 =====
      // 使用协调器处理 AI 回复，更新角色发言状态
      try {
        coordinator.processAIReply(replyText)
      } catch (e) {
        console.warn('[Coordinator] processAIReply 失败:', e)
      }

      // ===== V3 保存场景快照 =====
      SceneSnapshot.save(currentCharacterId)

      // ===== 多人对话：解析多角色回复 =====
      const multiMessages = newActiveChars.length > 0
        ? parseMultiCharacterReply(replyText, character.name, newActiveChars, currentCharacterId)
        : null

      const assistantMessageHasFilterLog = filterDropped.length > 0 || filterRemarks.length > 0 || usedAutoFixInsteadOfRegen || exhaustedMaxRegen

      let finalMessages
      if (multiMessages && multiMessages.length > 0) {
        // 如果有多条解析消息，把调度器过滤日志挂在"当前会话最后一条消息 id"上的全局存储，由 ChatWindow 读取
        finalMessages = {
          ...get().messages,
          [currentCharacterId]: [...(get().messages[currentCharacterId] || []), ...multiMessages],
        }
      } else {
        // 单人模式：保留 assistantMessage，并（如过滤日志存在）将其挂到消息上
        const assistantMessage = {
          id: uuidv4(),
          characterId: currentCharacterId,
          role: 'assistant',
          content: replyText,
          speaker: character.name,
          timestamp: Date.now(),
        }
        finalMessages = {
          ...get().messages,
          [currentCharacterId]: [...(get().messages[currentCharacterId] || []), assistantMessage],
        }
      }

      // A-1/A-2：把这轮调度器过滤日志存到"最后一条消息（assistant）id → 日志记录"映射，让 UI 读取
      if (assistantMessageHasFilterLog) {
        const charFinal = finalMessages[currentCharacterId] || []
        const lastAssistant = [...charFinal].reverse().find((m) => m && m.role === 'assistant')
        if (lastAssistant && lastAssistant.id) {
          const key = STORAGE_KEYS.DISPATCHER_LOG_MAP || 'ai-chat.dispatcherLogMap.v1'
          const all = (typeof loadFromStorage === 'function' ? loadFromStorage(key) : null) || {}
          const perChar = all[currentCharacterId] || {}
          perChar[lastAssistant.id] = {
            regenCount,
            maxRegen: MAX_REGEN,
            filterDropped,
            filterRemarks,
            usedAutoFixInsteadOfRegen,
            exhaustedMaxRegen,
            at: Date.now(),
          }
          all[currentCharacterId] = perChar
          if (typeof saveToStorage === 'function') saveToStorage(key, all)
          else if (typeof window !== 'undefined') {
            try { window.localStorage.setItem(key, JSON.stringify(all)) } catch (_e) {}
          }
        }
      }

      set({ messages: finalMessages, isLoading: false })
      saveToStorage(STORAGE_KEYS.MESSAGES, finalMessages)

      // C-2：同步每条 assistant 消息 speaker 的 lastSpeakTime（给长沉默 Watcher 用）
      try {
        const finalCharForSync = finalMessages[currentCharacterId] || []
        get().syncSpeakerLastSpeakTimesFromMessages(currentCharacterId, finalCharForSync)
      } catch (_e) {}

      const finalCharMessages = finalMessages[currentCharacterId] || []

      // ===== 多人对话结束：生成场景事件摘要 =====
      if (sessionJustEnded && settings.apiKey) {
        const sessionStart = get().multiCharSessionStart
        // 过滤出会话期间的消息（含当前轮次）
        const sessionMessages = finalCharMessages.filter((m) => m.timestamp >= sessionStart)
        // 参与者列表：主要角色 + 离场前的活跃角色
        const participants = [character.name, ...activeChars]
        // 异步生成摘要，不阻塞主流程
        generateSceneEventSummary(participants, sessionMessages, settings).then((summary) => {
          if (summary) {
            // 添加场景事件到独立存储
            get().addSceneEvent({
              date: new Date().toISOString(),
              participants,
              summary,
              characterId: currentCharacterId,
            })
            // 在主要角色记忆库添加引用
            const dateStr = new Date().toLocaleDateString('zh-CN')
            get().addMemory(
              currentCharacterId,
              `[${dateStr}] 与${participants.filter((p) => p !== character.name).join('、')}的对话：${summary}`,
              'auto',
              'scene_event'
            )
          }
          // 重置会话追踪
          get().setMultiCharSessionStart(null)
        }).catch(() => {
          get().setMultiCharSessionStart(null)
        })
      }

      // 后台任务：自动提取关键信息
      // 过滤掉已撤回的消息，不参与记忆提取
      const recentForExtract = finalCharMessages.filter((m) => !m.recalled).slice(-6)
      if (settings.apiKey) {
        extractMemoryItems(character, recentForExtract, settings).then((items) => {
          if (items.length > 0) {
            const existingMemories = get().memories[currentCharacterId] || []
            const existingKeys = new Set(
              existingMemories.map((m) => `${m.category || ''}::${m.content}`)
            )
            const newItems = items.filter(
              (item) => !existingKeys.has(`${item.category}::${item.content}`)
            )
            if (newItems.length > 0) {
              get().addMemories(currentCharacterId, newItems)
            }
          }
        }).catch(() => {})

        // 后台任务：增强记忆系统（异步，静默失败重试）
        const currentMemories = get().memories[currentCharacterId] || []
        // 过滤掉已撤回的消息
        const activeForEnhanced = finalCharMessages.filter((m) => !m.recalled)
        runPostConversationTasks(character, activeForEnhanced, currentMemories)
          .then((results) => {
            if (results.length > 0) {
              // 刷新增强记忆
              const refreshed = loadFromStorage(STORAGE_KEYS.ENHANCED_MEMORIES) || {}
              set({ enhancedMemories: refreshed })
            }
          })
          .catch(() => {})

        // 后台任务：自动提取并分类到 V2 三层记忆系统
        const activeForV2 = finalCharMessages.filter((m) => !m.recalled).slice(-6)
        extractMemoryItems(character, activeForV2, settings).then((items) => {
          if (items.length > 0) {
            try {
              // 使用 classifyImportMemories 进行分类
              const classified = classifyImportMemories(items.map((item) => ({
                type: item.category,
                content: item.content,
              })))
              if (classified && classified.length > 0) {
                addMemoriesV2(currentCharacterId, classified)
                // 刷新 store 中的 V2 记忆状态
                set({ memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {} })
              }
            } catch {
              // 分类失败时静默忽略
            }
          }
        }).catch(() => {})

        // ===== V2.1 记忆质量维护（本地，无 Token 消耗）=====
        try {
          // 更新相关记忆的 lastMention 和 heat
          updateLastMentionFromText(currentCharacterId, content.trim())
          // 衰减热度（每次聊天衰减一点）
          decayHeat(currentCharacterId)
        } catch { /* 静默失败 */ }
      }

      // 如果有纪念日，在消息中附加提醒
      if (anniversaries && anniversaries.anniversaries.length > 0) {
        const anniversaryNote = anniversaries.anniversaries
          .map((a) => `今天是${a.content}相关的日子`)
          .join('；')
        // 存储为通知，下次UI可展示
        saveToStorage('ai-chat-anniversary-note', {
          message: anniversaryNote,
          timestamp: Date.now(),
        })
      }
    } catch (err) {
      set({ isLoading: false, error: err.message })
      const reverted = {
        ...get().messages,
        [currentCharacterId]: charMessages,
      }
      set({ messages: reverted })
      saveToStorage(STORAGE_KEYS.MESSAGES, reverted)
    }
  },

  /**
   * 更新记忆摘要（主动触发）
   */
  updateMemorySummary: async (characterId) => {
    const { characters, messages, settings, memories } = get()
    const character = characters.find((c) => c.id === characterId)
    if (!character || !settings.apiKey) return

    const charMessages = messages[characterId] || []
    if (charMessages.length === 0) return

    // 过滤掉已撤回的消息
    const recentMessages = charMessages.filter((m) => !m.recalled).slice(-30)
    const charMemories = memories[characterId] || []

    try {
      const summary = await generateMemorySummary(character, recentMessages, charMemories, settings)
      if (summary) {
        get().setMemorySummary(characterId, summary)
      }
    } catch {}
  },

  clearMessages: (characterId) => {
    const messages = { ...get().messages }
    delete messages[characterId]
    set({ messages })
    saveToStorage(STORAGE_KEYS.MESSAGES, messages)
  },

  /**
   * 撤回消息 V2（彻底回滚上下文）
   * - 保持 2 分钟撤回限制
   * - 从该消息开始截断，彻底回滚上下文：该消息 + 之后所有消息全部删除
   * - 撤回的消息不进入记忆系统（核心档案 / 情感精华 / 日常记忆）
   * - 多人聊天中，撤回后所有角色同步遗忘
   * - 撤回后不提示 AI，保持沉浸感，等待用户重新输入
   */
  recallMessage: (characterId, messageId) => {
    const { messages } = get()
    const charMessages = messages[characterId] || []
    const msgIndex = charMessages.findIndex((m) => m.id === messageId)

    if (msgIndex === -1) return { success: false, error: '消息不存在' }

    const targetMsg = charMessages[msgIndex]

    // 仅允许撤回用户自己发送的消息
    if (targetMsg.role !== 'user') {
      return { success: false, error: '只能撤回自己发送的消息' }
    }

    // 2 分钟时限
    const RECALL_WINDOW = 2 * 60 * 1000
    if (Date.now() - targetMsg.timestamp > RECALL_WINDOW) {
      return { success: false, error: '已超过撤回时间（2 分钟）' }
    }

    // 彻底截断：从该消息开始，连同之后的所有消息一并删除
    // 这样 AI 上下文会完整回滚到该消息之前的状态
    const updatedList = charMessages.slice(0, msgIndex)

    // 清理所有被删除消息关联的记忆
    // 遍历将要被删除的消息 ID，从三层记忆系统中彻底抹除
    const toDelete = charMessages.slice(msgIndex)
    try {
      // V2 记忆（核心档案 / 情感精华 / 日常记忆）
      toDelete.forEach((m) => {
        if (m.id) deleteMemoriesByMessageId(characterId, m.id)
      })
    } catch {}

    // 同步清理旧版记忆系统中可能关联的条目
    try {
      const existingMemories = get().memories[characterId] || []
      if (existingMemories.length > 0) {
        // 通过 messageId 或关联 message 清理
        // 若记忆带有 sourceMessageId 字段则精确删除，否则保留
        const memories = { ...get().memories }
        memories[characterId] = existingMemories.filter((mem) => {
          if (!mem.sourceMessageId) return true
          return !toDelete.some((m) => m.id === mem.sourceMessageId)
        })
        set({ memories })
        saveToStorage(STORAGE_KEYS.MEMORIES, memories)
      }
    } catch {}

    // 应用新的消息列表（彻底删除，而非标记 recalled）
    const updatedMessages = { ...messages, [characterId]: updatedList }
    set({ messages: updatedMessages })
    saveToStorage(STORAGE_KEYS.MESSAGES, updatedMessages)

    return { success: true, recalledCount: toDelete.length }
  },

  /**
   * 重新回答 V2（替换 AI 回复）
   * - 仅允许对 assistant 消息操作
   * - 以该消息之前的历史为上下文，重新调用 AI 生成
   * - 新回复替换旧回复，聊天记录只保留新版本
   * - 旧回复关联的记忆同步被删除
   */
  regenerateMessage: async (characterId, messageId) => {
    const { messages, characters, settings, memorySummaries, memories, enhancedMemories, temporaryStates } = get()
    const charMessages = messages[characterId] || []
    const msgIndex = charMessages.findIndex((m) => m.id === messageId)

    if (msgIndex === -1) return { success: false, error: '消息不存在' }
    const targetMsg = charMessages[msgIndex]
    if (targetMsg.role !== 'assistant') {
      return { success: false, error: '仅能重新回答 AI 回复' }
    }

    const character = characters.find((c) => c.id === characterId)
    if (!character) return { success: false, error: '角色不存在' }
    if (!settings.apiKey) return { success: false, error: '请先配置 API Key' }

    // 构建上下文：仅使用该消息之前的消息（过滤已撤回）
    const priorMessages = charMessages.slice(0, msgIndex)
    const activeMessages = priorMessages.filter((m) => !m.recalled)

    const conversationHistory = activeMessages.map((m) => {
      if (m.role === 'user') {
        const result = formatBracketCommands(m.content, character.name)
        return { role: m.role, content: result.formatted }
      }
      return { role: m.role, content: m.content }
    })

    // 保留原始 quoteTarget 作为追问/回复引用
    const quoteTarget = targetMsg.quoteTarget || null
    // 追问场景：10 分钟时效校验
    if (quoteTarget) {
      const QUOTE_WINDOW = 10 * 60 * 1000
      if (Date.now() - quoteTarget.timestamp > QUOTE_WINDOW) {
        return { success: false, error: '引用的原消息已超过可操作时间' }
      }
    }

    set({ isLoading: true, error: null })

    try {
      // 场景 / 状态 / 世界观
      const sceneContext = get().getCurrentScene(characterId)

      // V3 场景快照 + CharacterStateEngine（先构造 Manager，因为权威数据在它里面）
      const sceneManager = getSceneManager(characterId)
      const sceneStateForRegen = sceneManager.getState()
      const sceneSnapshotPrompt = sceneManager.buildSnapshotPrompt()
      const charStateForRegen = getCharacterStateManager(characterId).getState()

      // 名称映射（CharacterStateEngine V2 key → 中文，和 send 路径保持一致）
      const __regenNameMap = {
        emotion: {
          happy: '开心', gentle: '温柔', shy: '害羞', calm: '平静', relaxed: '放松',
          excited: '兴奋', thinking: '思考中', sleepy: '困倦', nervous: '紧张', sad: '难过',
          angry: '生气', disappointed: '失落', surprised: '惊讶', confused: '迷惑',
          grievance: '委屈', expectant: '期待', attached: '依恋', relieved: '安心',
          amused: '忍俊不禁', blushing: '脸红',
        },
        action: {
          sitting: '坐着', standing: '站着', leaning_wall: '靠着墙', walking: '走路',
          strolling: '散步', turning_back: '回头', waving: '挥手', nodding: '点头',
          shaking_head: '摇头', stretching: '伸懒腰', reading: '看书', using_phone: '看手机',
          drinking_water: '喝水', drinking_tea: '喝茶', eating: '吃东西', cooking: '做饭',
          cleaning_room: '整理房间', looking_out_window: '望向窗外', spacing_out: '发呆',
          thinking: '思考', resting: '休息', sleeping: '睡觉', just_woke: '刚醒来',
          speaking_softly: '轻声说话', moving_closer: '靠近你', stepping_back: '后退半步',
          holding_hands: '牵手', hugging: '拥抱', stroking_hair: '抚摸头发',
          chuckling: '轻笑', sighing: '叹气', avoiding_eyes: '躲闪视线',
          fidgeting_clothes: '摆弄衣角',
        },
        pose: {
          on_sofa: '坐在沙发上', on_bedside: '坐在床边', standing: '站立',
          leaning: '斜靠着', bending_forward: '俯身', sideways: '侧身',
          hands_behind: '双手背后', arms_crossed: '双手抱胸', hand_on_cheek: '单手扶脸',
          hands_on_knees: '双手放在膝上', gently_near: '轻轻靠近', head_down: '低头',
          head_up: '抬头', on_tiptoes: '微微踮脚', huddled_corner: '缩在角落',
          lying_lazy: '慵懒地躺着',
        },
        expression: {
          smile: '微笑', laugh: '笑', giggle: '偷笑', soft_smile: '浅笑',
          gentle_smile: '温柔笑', blush: '害羞脸红', serious: '认真', shocked: '惊讶',
          puzzled: '困惑', squinting: '眯眼', winking: '眨眼', silent: '沉默',
          frowning: '皱眉', contemplative: '若有所思', dejected: '失落', helpless: '无奈',
          fond: '宠溺', coquettish: '撒娇', staring: '认真注视', no_expression: '',
        },
        interaction: {
          chatting: '正在聊天', waiting: '等待回复', looking_at_you: '看着你',
          accompanying: '陪着你', snuggling_you: '依偎着你', holding_your_hand: '牵着你的手',
          hugging_you: '拥抱你', leaning_on_you: '轻轻靠着你', listening_to_you: '听你说话',
          being_praised: '被你夸奖', being_comforted: '被你安慰', being_teased: '被你逗笑',
          jealous: '吃醋中', missing_you: '想你', worrying_about_you: '担心你',
          guarding_you: '守着你', on_date: '约会中', enjoying_view: '一起看风景',
          resting_together: '一起休息',
        },
      }

      // ===== Prompt 上下文：位置/动作/心情/姿态/表情/互动 必须来自 Runtime =====
      const __regenRawState = get().getCharacterState(characterId)
      const __regenPosition = [
        sceneStateForRegen.location,
        sceneStateForRegen.area,
        sceneStateForRegen.position,
      ].filter(Boolean).join(' ').trim()
      const __r = (map, key, fallback = '') => (map[key] || key || fallback)
      const stateContext = {
        ...__regenRawState,
        position: __regenPosition,
        emotion: __r(__regenNameMap.emotion, charStateForRegen.emotion, __regenRawState.emotion || ''),
        emotionLevel: charStateForRegen.emotionLevel != null ? charStateForRegen.emotionLevel : 1,
        action: __r(__regenNameMap.action, charStateForRegen.action, __regenRawState.action || ''),
        pose: __r(__regenNameMap.pose, charStateForRegen.pose, __regenRawState.pose || ''),
        expression: __r(__regenNameMap.expression, charStateForRegen.expression, __regenRawState.expression || ''),
        interaction: __r(__regenNameMap.interaction, charStateForRegen.interaction, ''),
      }
      const worldviewContext = buildWorldviewContext(character)

      // 动态角色档案
      const officialProfile = buildOfficialCharacterProfile(character)
      const { text: officialProfileText } = scanAndBuildProfileText(officialProfile, character, '')

      const timeContext = generateTimeContext(activeMessages)
      const timeContextText = formatTimeContextForPrompt(timeContext)

      // 多人上下文
      const activeChars = get().activeCharacters[characterId] || []
      let multiCharacterContext = ''
      if (activeChars.length > 0) {
        multiCharacterContext = buildMultiCharacterContext(character, activeChars, officialProfileText)
      }

      const memorySummary = memorySummaries[characterId] || null
      const charMemories = memories[characterId] || []
      const enhancedContext = getEnhancedContextForPrompt(characterId)
      const userProfile = getUserProfile()
      const v2Injection = getOptimizedInjection(characterId)

      // 追问上下文（若原消息是追问回复）
      let quotedContext = null
      if (quoteTarget) {
        const targetIndex = activeMessages.findIndex((m) => m.id === quoteTarget.messageId)
        if (targetIndex >= 0) {
          const CONTEXT_RANGE = 5
          const start = Math.max(0, targetIndex - CONTEXT_RANGE)
          const end = Math.min(activeMessages.length, targetIndex + CONTEXT_RANGE + 1)
          const contextMessages = activeMessages.slice(start, end)
          quotedContext = {
            targetMessage: {
              content: quoteTarget.content,
              sender: quoteTarget.role === 'user' ? '用户' : (character.name || 'AI'),
              time: new Date(quoteTarget.timestamp).toLocaleString('zh-CN'),
            },
            surroundingMessages: contextMessages.map((m) => ({
              role: m.role,
              content: m.content,
              sender: m.role === 'user' ? '用户' : (character.name || 'AI'),
              time: new Date(m.timestamp).toLocaleString('zh-CN'),
              isTarget: m.id === quoteTarget.messageId,
            })),
          }
        }
      }

      const reply = await sendChatMessage(
        conversationHistory,
        character,
        settings,
        memorySummary,
        charMemories,
        null,
        enhancedContext,
        userProfile,
        worldviewContext,
        sceneContext,
        stateContext,
        timeContextText,
        quotedContext,
        officialProfileText,
        multiCharacterContext,
        v2Injection,
        sceneSnapshotPrompt
      )

      const replyText = (reply.reply || reply || '').toString()

      // 成本记录
      const allInputText = conversationHistory.map((m) => m.content).join('\n') + (enhancedContext || '')
      recordCost(allInputText, replyText, 'chat', characterId, reply.usage || null)

      // 多人对话：若该条是多人回复，重新解析，但保留原消息的 speaker 信息
      let replacementMessage = {
        ...targetMsg,
        content: replyText,
        timestamp: Date.now(),
        regeneratedFrom: targetMsg.id,
        regeneratedAt: Date.now(),
      }

      // 替换旧回复：保留之前消息 + 新回复 + 原位置之后的消息
      const before = charMessages.slice(0, msgIndex)
      const after = charMessages.slice(msgIndex + 1)
      const updatedMessages = {
        ...messages,
        [characterId]: [...before, replacementMessage, ...after],
      }

      // 清理旧回复关联的记忆
      try {
        deleteMemoriesByMessageId(characterId, targetMsg.id)
      } catch {}

      set({ messages: updatedMessages, isLoading: false })
      saveToStorage(STORAGE_KEYS.MESSAGES, updatedMessages)

      // V3 保存场景快照
      SceneSnapshot.save(characterId)

      return { success: true, newMessageId: replacementMessage.id }
    } catch (err) {
      set({ isLoading: false, error: err.message })
      return { success: false, error: err.message }
    }
  },

  clearError: () => set({ error: null }),

  // ===== 增强记忆操作 =====

  /**

   * 执行定期维护任务
   */
  runScheduledMaintenance: async () => {
    const { characters, messages, memories } = get()
    try {
      await runScheduledMaintenance(characters, messages, memories)
      const refreshed = loadFromStorage(STORAGE_KEYS.ENHANCED_MEMORIES) || {}
      set({ enhancedMemories: refreshed })
    } catch {}
  },

  /**
   * 同步跨角色用户画像
   */
  syncUserProfile: () => {
    const { characters, memories } = get()
    const profile = syncUserProfileAcrossCharacters(characters, memories)
    return profile
  },

  // ===== 成本控制 =====
  refreshCostData: () => {
    set({ costData: getCostData() })
  },

  getCurrentMonthCost: () => {
    return getCurrentMonthCost()
  },

  setMemoryMode: (mode) => {
    setMemoryMode(mode)
    set({ memoryMode: mode })
  },

  getMemoryModeConfig: () => {
    return MEMORY_MODES[get().memoryMode] || MEMORY_MODES.standard
  },

  // ===== 导出聊天记录 =====
  exportChatHistory: async (characterId, format = 'json') => {
    const { characters, messages } = get()
    const character = characters.find((c) => c.id === characterId)
    const charMessages = messages[characterId] || []
    // 过滤掉已撤回的消息
    const activeMessages = charMessages.filter((m) => !m.recalled)

    if (activeMessages.length === 0) {
      return { success: false, error: '没有可导出的聊天记录' }
    }

    let content, filename, mimeType

    const dateStr = getDateStr()
    const safeName = (character?.name || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')

    try {
      if (format === 'json') {
        content = JSON.stringify({
          characterName: character?.name || '未知角色',
          exportedAt: formatExportTime(Date.now()),
          messageCount: activeMessages.length,
          messages: activeMessages.map((m) => ({
            sender: m.role === 'user' ? '用户' : (m.speaker || character?.name || 'AI'),
            role: m.role,
            content: m.content,
            timestamp: formatExportTime(m.timestamp),
            ...(m.speaker ? { speaker: m.speaker } : {}),
            ...(m.quoteTarget ? { quoteTarget: m.quoteTarget } : {}),
            ...(m.recalled ? { recalled: true, recalledAt: m.recalledAt } : {}),
          })),
        }, null, 2)
        filename = `${safeName}_聊天记录_${dateStr}.json`
        mimeType = 'application/json'
      } else {
        const lines = []
        activeMessages.forEach((m) => {
          const sender = m.role === 'user' ? '用户' : (m.speaker || character?.name || 'AI')
          const time = formatExportTime(m.timestamp)
          lines.push(`[${time}] ${sender}：${m.content}`)
        })
        content = lines.join('\n')
        filename = `${safeName}_聊天记录_${dateStr}.txt`
        mimeType = 'text/plain;charset=utf-8'
      }

      const result = await downloadWithFallback(content, filename, mimeType, {
        label: '聊天记录',
      })
      return result
    } catch (err) {
      const errorMsg = err.message || '文件写入失败'
      return { success: false, error: errorMsg }
    }
  },

  // ===== 设置管理 =====
  updateSettings: (newSettings) => {
    const settings = { ...get().settings, ...newSettings }
    set({ settings })
    saveToStorage(STORAGE_KEYS.SETTINGS, settings)
    if (newSettings.theme !== undefined) {
      applyTheme(newSettings.theme)
    }
  },

  // ===== 视图管理 =====
  setView: (view, editingCharacterId = null) => {
    const { fullScreenPageOpen } = get()
    // 防御：全屏页面打开时，不允许非预期视图切换
    if (fullScreenPageOpen && view === 'chat') {
      console.warn('[setView] ⚠️ 全屏页面打开中，阻止意外的 view=chat 切换。调用栈:')
      console.trace()
      return // 不执行切换
    }
    set({ view, editingCharacterId })
  },

  setFullScreenPageOpen: (open) => {
    set({ fullScreenPageOpen: open })
  },

  getCurrentCharacter: () => {
    const { currentCharacterId, characters } = get()
    return characters.find((c) => c.id === currentCharacterId) || null
  },

  getCurrentMessages: () => {
    const { currentCharacterId, messages } = get()
    return currentCharacterId ? messages[currentCharacterId] || [] : []
  },

  // ===== 角色记忆查看器 - 情绪历史 =====
  getEmotionHistory: (characterId) => {
    return get().emotionHistory[characterId] || []
  },

  addEmotionRecord: (characterId, record) => {
    const history = { ...get().emotionHistory }
    const list = [...(history[characterId] || [])]
    list.push({ id: uuidv4(), ...record, createdAt: Date.now() })
    history[characterId] = list
    set({ emotionHistory: history })
    saveToStorage(STORAGE_KEYS.EMOTION_HISTORY, history)
  },

  deleteEmotionRecord: (characterId, recordId) => {
    const history = { ...get().emotionHistory }
    history[characterId] = (history[characterId] || []).filter((r) => r.id !== recordId)
    set({ emotionHistory: history })
    saveToStorage(STORAGE_KEYS.EMOTION_HISTORY, history)
  },

  // ===== 角色记忆查看器 - 关系图谱 =====
  getRelationships: (characterId) => {
    return get().relationships[characterId] || []
  },

  addRelationship: (characterId, rel) => {
    const rels = { ...get().relationships }
    const list = [...(rels[characterId] || [])]
    list.push({ id: uuidv4(), ...rel, createdAt: Date.now(), updatedAt: Date.now() })
    rels[characterId] = list
    set({ relationships: rels })
    saveToStorage(STORAGE_KEYS.RELATIONSHIPS, rels)
  },

  updateRelationship: (characterId, relId, updates) => {
    const rels = { ...get().relationships }
    rels[characterId] = (rels[characterId] || []).map((r) =>
      r.id === relId ? { ...r, ...updates, updatedAt: Date.now() } : r
    )
    set({ relationships: rels })
    saveToStorage(STORAGE_KEYS.RELATIONSHIPS, rels)
  },

  deleteRelationship: (characterId, relId) => {
    const rels = { ...get().relationships }
    rels[characterId] = (rels[characterId] || []).filter((r) => r.id !== relId)
    set({ relationships: rels })
    saveToStorage(STORAGE_KEYS.RELATIONSHIPS, rels)
  },

  // ===== 角色记忆查看器 - 事件时间线 =====
  getEvents: (characterId) => {
    return get().events[characterId] || []
  },

  addEvent: (characterId, evt) => {
    const evts = { ...get().events }
    const list = [...(evts[characterId] || [])]
    list.push({ id: uuidv4(), ...evt, createdAt: Date.now(), updatedAt: Date.now() })
    evts[characterId] = list
    set({ events: evts })
    saveToStorage(STORAGE_KEYS.EVENTS, evts)
  },

  updateEvent: (characterId, evtId, updates) => {
    const evts = { ...get().events }
    evts[characterId] = (evts[characterId] || []).map((e) =>
      e.id === evtId ? { ...e, ...updates, updatedAt: Date.now() } : e
    )
    set({ events: evts })
    saveToStorage(STORAGE_KEYS.EVENTS, evts)
  },

  deleteEvent: (characterId, evtId) => {
    const evts = { ...get().events }
    evts[characterId] = (evts[characterId] || []).filter((e) => e.id !== evtId)
    set({ events: evts })
    saveToStorage(STORAGE_KEYS.EVENTS, evts)
  },

  // ===== 角色记忆查看器 - 全局操作 =====
  globalSearchMemories: (characterId, keyword) => {
    const lower = keyword.toLowerCase()
    const { memories, enhancedMemories, emotionHistory, relationships, events } = get()
    const results = { memories: [], reflections: [], emotions: [], relationships: [], events: [] }

    const charMemories = memories[characterId] || []
    results.memories = charMemories.filter((m) =>
      (m.content || '').toLowerCase().includes(lower) ||
      (m.category || '').toLowerCase().includes(lower)
    )

    const enhanced = enhancedMemories[characterId] || {}
    if (enhanced.deepReflection) {
      const str = JSON.stringify(enhanced.deepReflection).toLowerCase()
      if (str.includes(lower)) results.reflections.push({ ...enhanced.deepReflection, type: 'deepReflection' })
    }
    if (enhanced.monologue?.content?.toLowerCase().includes(lower)) {
      results.reflections.push({ ...enhanced.monologue, type: 'monologue' })
    }

    const charEmotions = emotionHistory[characterId] || []
    results.emotions = charEmotions.filter((e) =>
      (e.emotion || '').toLowerCase().includes(lower) ||
      (e.trigger || '').toLowerCase().includes(lower) ||
      (e.keywords || []).some((k) => k.toLowerCase().includes(lower))
    )

    const charRels = relationships[characterId] || []
    results.relationships = charRels.filter((r) =>
      (r.name || '').toLowerCase().includes(lower) ||
      (r.relation || '').toLowerCase().includes(lower) ||
      (r.note || '').toLowerCase().includes(lower)
    )

    const charEvents = events[characterId] || []
    results.events = charEvents.filter((e) =>
      (e.description || '').toLowerCase().includes(lower)
    )

    return results
  },

  exportAllMemories: (characterId) => {
    const { memories, memorySummaries, enhancedMemories, emotionHistory, relationships, events, characters } = get()
    const character = characters.find((c) => c.id === characterId)
    const data = {
      exportedAt: new Date().toISOString(),
      character: { name: character?.name, identity: character?.identity },
      memories: memories[characterId] || [],
      memorySummary: memorySummaries[characterId] || null,
      enhancedMemories: enhancedMemories[characterId] || {},
      emotionHistory: emotionHistory[characterId] || [],
      relationships: relationships[characterId] || [],
      events: events[characterId] || [],
    }
    return JSON.stringify(data, null, 2)
  },

  importAllMemories: (characterId, jsonString) => {
    try {
      const data = JSON.parse(jsonString)
      if (data.memories) {
        const memories = { ...get().memories }
        memories[characterId] = data.memories
        set({ memories })
        saveToStorage(STORAGE_KEYS.MEMORIES, memories)
      }
      if (data.memorySummary) {
        const summaries = { ...get().memorySummaries }
        summaries[characterId] = data.memorySummary
        set({ memorySummaries: summaries })
        saveToStorage(STORAGE_KEYS.MEMORY_SUMMARIES, summaries)
      }
      if (data.enhancedMemories) {
        const enhanced = { ...get().enhancedMemories }
        enhanced[characterId] = data.enhancedMemories
        set({ enhancedMemories: enhanced })
        saveToStorage(STORAGE_KEYS.ENHANCED_MEMORIES, enhanced)
      }
      if (data.emotionHistory) {
        const history = { ...get().emotionHistory }
        history[characterId] = data.emotionHistory
        set({ emotionHistory: history })
        saveToStorage(STORAGE_KEYS.EMOTION_HISTORY, history)
      }
      if (data.relationships) {
        const rels = { ...get().relationships }
        rels[characterId] = data.relationships
        set({ relationships: rels })
        saveToStorage(STORAGE_KEYS.RELATIONSHIPS, rels)
      }
      if (data.events) {
        const evts = { ...get().events }
        evts[characterId] = data.events
        set({ events: evts })
        saveToStorage(STORAGE_KEYS.EVENTS, evts)
      }
      return true
    } catch {
      return false
    }
  },

  clearAllMemories: (characterId) => {
    const memories = { ...get().memories }
    delete memories[characterId]
    const summaries = { ...get().memorySummaries }
    delete summaries[characterId]
    const enhanced = { ...get().enhancedMemories }
    delete enhanced[characterId]
    const history = { ...get().emotionHistory }
    delete history[characterId]
    const rels = { ...get().relationships }
    delete rels[characterId]
    const evts = { ...get().events }
    delete evts[characterId]

    set({ memories, memorySummaries: summaries, enhancedMemories: enhanced, emotionHistory: history, relationships: rels, events: evts })
    saveToStorage(STORAGE_KEYS.MEMORIES, memories)
    saveToStorage(STORAGE_KEYS.MEMORY_SUMMARIES, summaries)
    saveToStorage(STORAGE_KEYS.ENHANCED_MEMORIES, enhanced)
    saveToStorage(STORAGE_KEYS.EMOTION_HISTORY, history)
    saveToStorage(STORAGE_KEYS.RELATIONSHIPS, rels)
    saveToStorage(STORAGE_KEYS.EVENTS, evts)
  },

  // ===== 外部聊天记录导入与记忆提取 =====
  /**
   * 开始导入流程：解析文件 → 预览 → 提取记忆 → 存储
   * @param {string} characterId
   * @param {File} file
   * @param {Object} options - 解析选项
   * @param {Function} onProgress - 进度回调
   * @param {AbortSignal} signal - 取消信号
   */
  importChatLogAndExtractMemories: async (characterId, file, options = {}, onProgress, signal) => {
    const { parseChatLogFile, chunkText, saveImportProgress, clearImportProgress } = await import('../services/chatLogParser')
    const { extractMemoriesFromChatLog, estimateImportCost } = await import('../services/memoryExtractor')

    // Step 1: 解析
    set({ importState: { status: 'parsing', progress: 0, stats: null, error: null } })
    onProgress?.({ step: 'parsing', progress: 0 })

    let parsed
    try {
      parsed = await parseChatLogFile(file, options)
    } catch (err) {
      set({ importState: { status: 'error', progress: 0, stats: null, error: err.message } })
      throw err
    }

    const cost = estimateImportCost(parsed.rawText)
    set({ importState: { status: 'preview', progress: 0, stats: { ...parsed.stats, ...cost } } })
    onProgress?.({ step: 'preview', progress: 0, stats: { ...parsed.stats, ...cost }, parsed })

    // 保存进度用于断点续传
    saveImportProgress(characterId, {
      rawText: parsed.rawText,
      stats: parsed.stats,
      chunks: chunkText(parsed.rawText),
      timestamp: Date.now(),
    })

    // Step 2: 提取记忆
    set({ importState: { status: 'extracting', progress: 0, stats: { ...parsed.stats, ...cost } } })
    onProgress?.({ step: 'extracting', progress: 0 })

    let extractionResult
    try {
      extractionResult = await extractMemoriesFromChatLog(parsed.rawText, {}, onProgress, signal)
    } catch (err) {
      if (err.message === '导入已取消') {
        set({ importState: { status: 'idle', progress: 0, stats: null, error: null } })
        throw err
      }
      set({ importState: { status: 'error', progress: 0, stats: null, error: err.message } })
      throw err
    }

    // Step 3: 存储记忆（三层架构直接存储）
    onProgress?.({ step: 'storing', progress: 100 })

    const now = Date.now()
    const importSessionId = uuidv4()

    // 获取角色信息用于冲突检测
    const importCharacter = get().characters.find((c) => c.id === characterId)

    // ===== V2 三层记忆系统：直接按分类存储 =====
    let v2Stats = { core: 0, emotional: 0, daily: 0, discarded: 0, totalMessages: 0 }
    const itemsToStore = []

    // 存储核心档案
    if (extractionResult.core?.length > 0) {
      extractionResult.core.forEach((item) => {
        itemsToStore.push({
          tier: 'core',
          subCategory: mapCoreSubCategory(item.subCategory),
          content: item.content,
          source: 'import',
          confidence: 'high',
          importSessionId,
        })
        v2Stats.core++
      })
    }

    // 存储情感精华
    if (extractionResult.emotional?.length > 0) {
      extractionResult.emotional.forEach((item) => {
        itemsToStore.push({
          tier: 'emotional',
          subCategory: mapEmotionalSubCategory(item.subCategory),
          content: item.content,
          source: 'import',
          confidence: 'high',
          importSessionId,
        })
        v2Stats.emotional++
      })
    }

    // 存储日常琐事
    if (extractionResult.daily?.length > 0) {
      extractionResult.daily.forEach((item) => {
        itemsToStore.push({
          tier: 'daily',
          content: item.content,
          source: 'import',
          confidence: 'medium',
          importSessionId,
        })
        v2Stats.daily++
      })
    }

    // 记录丢弃的条目
    if (extractionResult.discarded?.length > 0) {
      v2Stats.discarded = extractionResult.discarded.length
    }

    // 从提取器中获取统计信息
    if (extractionResult.stats) {
      v2Stats = { ...v2Stats, ...extractionResult.stats }
    }
    v2Stats.totalMessages = extractionResult.totalMessages || 0

    // 批量存储到 V2 记忆系统
    if (itemsToStore.length > 0) {
      addMemoriesV2(characterId, itemsToStore)
    }

    // 同时存储到旧记忆系统（保持向后兼容）
    const oldMemoryItems = itemsToStore.map((m) => ({
      category: tierToOldCategory(m.tier, m.subCategory),
      content: m.content,
    }))
    if (oldMemoryItems.length > 0) {
      const { addMemories } = get()
      addMemories(characterId, oldMemoryItems)
    }

    // 存储 systemMessage 到 enhancedMemories
    if (extractionResult.systemMessage) {
      const enhanced = { ...get().enhancedMemories }
      if (!enhanced[characterId]) enhanced[characterId] = {}
      enhanced[characterId].deepReflection = {
        ...(enhanced[characterId]?.deepReflection || {}),
        import_summary: extractionResult.systemMessage,
        import_generated_at: now,
        import_source: 'import',
      }
      set({ enhancedMemories: enhanced })
      saveToStorage(STORAGE_KEYS.ENHANCED_MEMORIES, enhanced)
    }

    // 刷新 store 中的 V2 记忆状态
    set({ memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {} })

    // 清理断点
    clearImportProgress(characterId)

    set({ importState: { status: 'done', progress: 100, stats: { ...parsed.stats, ...cost, v2Stats } } })
    onProgress?.({ step: 'done', progress: 100, result: { ...extractionResult, v2Stats } })

    return extractionResult
  },

  setImportState: (state) => {
    set({ importState: state })
  },

  setMemoryDashboardFilter: (filter) => {
    set({ memoryDashboardFilter: filter })
  },

  /**
   * 将记忆数据从临时ID迁移到真实ID（创建角色时使用）
   */
  transferMemories: (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return
    const { memories, memorySummaries, enhancedMemories, emotionHistory, relationships, events } = get()

    const updates = {}
    if (memories[fromId]) {
      const newMemories = { ...memories }
      newMemories[toId] = [...(newMemories[toId] || []), ...newMemories[fromId]]
      delete newMemories[fromId]
      updates.memories = newMemories
      saveToStorage(STORAGE_KEYS.MEMORIES, newMemories)
    }
    if (enhancedMemories[fromId]) {
      const newEnhanced = { ...enhancedMemories }
      newEnhanced[toId] = { ...newEnhanced[toId], ...newEnhanced[fromId] }
      delete newEnhanced[fromId]
      updates.enhancedMemories = newEnhanced
      saveToStorage(STORAGE_KEYS.ENHANCED_MEMORIES, newEnhanced)
    }
    if (emotionHistory[fromId]) {
      const newHistory = { ...emotionHistory }
      newHistory[toId] = [...(newHistory[toId] || []), ...newHistory[fromId]]
      delete newHistory[fromId]
      updates.emotionHistory = newHistory
      saveToStorage(STORAGE_KEYS.EMOTION_HISTORY, newHistory)
    }
    if (relationships[fromId]) {
      const newRels = { ...relationships }
      newRels[toId] = [...(newRels[toId] || []), ...newRels[fromId]]
      delete newRels[fromId]
      updates.relationships = newRels
      saveToStorage(STORAGE_KEYS.RELATIONSHIPS, newRels)
    }
    if (events[fromId]) {
      const newEvts = { ...events }
      newEvts[toId] = [...(newEvts[toId] || []), ...newEvts[fromId]]
      delete newEvts[fromId]
      updates.events = newEvts
      saveToStorage(STORAGE_KEYS.EVENTS, newEvts)
    }

    if (Object.keys(updates).length > 0) {
      set(updates)
    }
  },

  // ===== 星穹铁道世界观管理 =====

  /**
   * 在星穹铁道角色库中搜索角色
   */
  searchSRCharacter: (query) => {
    return searchSRCharacter(query)
  },

  /**
   * 获取指定角色的完整 SR 档案
   */
  getSRCharacterProfile: (name) => {
    return getSRCharacterProfile(name)
  },

  /**
   * 获取当前角色的世界观上下文（用于注入系统提示词）
   */
  getWorldviewContext: (characterId) => {
    const { characters } = get()
    const character = characters.find((c) => c.id === characterId)
    if (!character) return null
    return buildWorldviewContext(character)
  },

  /**
   * 获取用户自定义的世界观（用于编辑器）
   */
  getUserWorldview: () => {
    return getUserWorldviewOverride() || srWorldview
  },

  /**
   * 保存用户自定义的世界观
   */
  saveUserWorldview: (worldview) => {
    saveToStorage('ai-chat-sr-worldview', worldview)
  },

  /**
   * 重置世界观为内置默认值
   */
  resetWorldview: () => {
    saveToStorage('ai-chat-sr-worldview', null)
  },

  // ===== 三层记忆金字塔（V2）操作 =====

  getMemoriesV2: (characterId) => {
    return getAllMemoriesV2(characterId)
  },

  getCoreMemoriesV2: (characterId) => {
    return getCoreMemories(characterId)
  },

  getEmotionalMemoriesV2: (characterId) => {
    return getEmotionalMemories(characterId)
  },

  getDailyMemoriesV2: (characterId) => {
    return getDailyMemories(characterId)
  },

  addMemoryV2: (characterId, data) => {
    return addMemoryV2(characterId, data)
  },

  addMemoriesV2: (characterId, items) => {
    return addMemoriesV2(characterId, items)
  },

  updateMemoryV2: (characterId, id, updates) => {
    return updateMemoryV2(characterId, id, updates)
  },

  deleteMemoryV2: (characterId, id) => {
    return deleteMemoryV2(characterId, id)
  },

  archiveOldDailyMemories: (characterId) => {
    return archiveOldDailyMemories(characterId)
  },

  clearAllDailyMemories: (characterId) => {
    return clearAllDailyMemories(characterId)
  },

  getDailyChatInjection: (characterId) => {
    return getDailyChatInjection(characterId)
  },

  getDeepChatInjection: (characterId, currentMessage) => {
    return getOptimizedInjection(characterId, currentMessage || '')
  },

  classifyImportMemories: (items) => {
    return classifyImportMemories(items)
  },

  searchMemoriesV2: (characterId, keyword, filters) => {
    return searchMemoriesV2(characterId, keyword, filters)
  },

  exportMemoriesV2: (characterId) => {
    return exportMemoriesV2(characterId)
  },

  migrateOldMemories: (characterId, oldMemories) => {
    return migrateOldMemories(characterId, oldMemories)
  },

  getArchives: (characterId) => {
    return getArchives(characterId)
  },

  getImpressionText: (characterId) => {
    return getImpressionText(characterId)
  },

  saveImpressionText: (characterId, text) => {
    saveImpressionText(characterId, text)
    set({ impressionText: loadFromStorage(STORAGE_KEYS.IMPRESSION_TEXT) || {} })
  },

  setCleanupDays: (days) => {
    setCleanupDays(days)
    set({ cleanupDays: days })
  },

  refreshMemoriesV2: () => {
    set({ memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {} })
  },

  // ===== V2.1 记忆质量管理 =====

  /**
   * 运行记忆质量扫描（合并重复、删除过期、自动锁定、衰减热度、检测冲突）
   */
  runMemoryQualityAudit: (characterId) => {
    const result = runQualityAudit(characterId)
    // 刷新 store 中的 V2 记忆状态
    set({ memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {} })
    return result
  },

  /**
   * 获取记忆健康度评分
   */
  getMemoryHealthScore: (characterId) => {
    const score = calculateHealthScore(characterId)
    set((state) => ({
      memoryHealthScores: {
        ...state.memoryHealthScores,
        [characterId]: score,
      },
    }))
    return score
  },

  /**
   * 确认/否认一条待确认记忆
   */
  confirmPendingMemory: (characterId, memoryId, confirmed) => {
    confirmMemory(characterId, memoryId, confirmed)
    set({
      memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {},
      pendingConfirmations: getPendingConfirmations(characterId),
    })
  },

  /**
   * 获取待确认的记忆列表
   */
  getPendingConfirmations: (characterId) => {
    const pending = getPendingConfirmations(characterId)
    set({ pendingConfirmations: pending })
    return pending
  },

  /**
   * 获取未解决的记忆冲突
   */
  getMemoryConflicts: (characterId) => {
    const conflicts = getUnresolvedConflicts(characterId)
    set({ memoryConflicts: conflicts })
    return conflicts
  },

  /**
   * 解决记忆冲突
   */
  resolveMemoryConflict: (characterId, conflictId, resolution) => {
    resolveConflict(characterId, conflictId, resolution)
    set({
      memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {},
      memoryConflicts: getUnresolvedConflicts(characterId),
    })
  },

  /**
   * 标记记忆为临时（设置过期时间）
   */
  markMemoryTemporary: (characterId, memoryId, days) => {
    markAsTemporary(characterId, memoryId, days)
  },

  /**
   * 手动触发重复记忆合并
   */
  mergeMemoryDuplicates: (characterId) => {
    const count = mergeDuplicateMemories(characterId)
    set({ memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {} })
    return count
  },

  /**
   * 手动触发里程碑自动锁定
   */
  autoLockMilestones: (characterId) => {
    const count = autoLockMilestones(characterId)
    set({ memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {} })
    return count
  },

  /**
   * 触发记忆 Schema 迁移（为旧数据添加新字段）
   */
  migrateMemorySchema: (characterId) => {
    return migrateMemorySchema(characterId)
  },

  /**
   * 清理已过期的临时记忆
   */
  cleanExpiredMemories: (characterId) => {
    const count = deleteExpiredMemories(characterId)
    set({ memoriesV2: loadFromStorage(STORAGE_KEYS.MEMORIES_V2) || {} })
    return count
  },

  // ===== Memory Engine V2 新方法 =====

  /**
   * 使用统一管线处理单条消息（实时聊天）
   */
  processMessageWithPipeline: (characterId, content, role = 'user') => {
    const result = processSingleMessage(characterId, content, role)
    // 提及相关记忆时更新 lastMention
    if (role === 'user') {
      updateLastMentionFromText(characterId, content)
    }
    // 关系重建
    if (result.output.length > 0) {
      try {
        buildAndSaveRelationship(characterId)
      } catch (e) { /* 静默失败，不影响主流程 */ }
    }
    return result
  },

  /**
   * 批量处理导入消息（使用管线 + 关系重建）
   */
  processImportWithPipeline: (characterId, messages) => {
    const pipeline = new MemoryPipeline(characterId)
    const result = pipeline.process(messages, 'import')
    const report = generateImportReport(result)

    // 关系重建
    let relationship = null
    try {
      relationship = buildRelationshipFromImport(characterId, messages)
      set({ relationshipSummary: relationship })
    } catch (e) { /* 静默失败 */ }

    // 时间轴
    let timeline = null
    try {
      const tl = new MemoryTimeline(characterId)
      timeline = {
        events: tl.build(),
        stats: tl.getStats(),
        promptText: tl.toPromptText(),
      }
      set({ memoryTimelineData: timeline })
    } catch (e) { /* 静默失败 */ }

    return {
      report,
      relationship,
      timeline,
      processedCount: result.output.length,
    }
  },

  /**
   * 获取记忆仪表盘统计（直接获取，不修改状态）
   */
  getMemoryDashboardStatsFor: (characterId) => {
    return getMemoryDashboardStats(characterId)
  },

  /**
   * 刷新并设置记忆仪表盘状态（供 UI 使用）
   */
  refreshMemoryDashboard: (characterId) => {
    const stats = getMemoryDashboardStats(characterId)
    let relationship = null
    try {
      relationship = getRelationshipSummary(characterId)
    } catch (e) { /* ignore */ }
    set({
      memoryDashboardStats: stats,
      relationshipSummary: relationship,
    })
    return stats
  },

  /**
   * 获取记忆注入文本 V2（整合关系+时间轴+核心+情感+相关+最近）
   */
  getMemoryInjectionV2: (characterId, currentMessage = '') => {
    return getFullMemoryInjection(characterId, currentMessage)
  },

  /**
   * 触发完整关系重建
   */
  rebuildRelationship: (characterId) => {
    const analysis = buildAndSaveRelationship(characterId)
    set({ relationshipSummary: analysis })
    return analysis
  },

  /**
   * 获取记忆时间轴
   */
  getMemoryTimeline: (characterId) => {
    const tl = new MemoryTimeline(characterId)
    const data = {
      events: tl.build(),
      milestones: tl.getMilestones(),
      stats: tl.getStats(),
      promptText: tl.toPromptText(),
      milestoneChain: getMilestoneChain(characterId),
    }
    set({ memoryTimelineData: data })
    return data
  },
}))

// ===== 星穹铁道世界观辅助函数 =====

// 阵营名称 → worldview JSON key 映射
const FACTION_KEY_MAP = {
  '星穹列车': 'astral_express',
  '星际和平公司': 'ipc',
  '仙舟联盟': 'xianzhou_alliance',
  '星核猎手': 'stellaron_hunters',
  '反物质军团': 'antimatter_legion',
  '匹诺康尼': 'penacony',
  '天才俱乐部': 'genius_society',
  '纯美骑士团': 'knights_of_beauty',
  '假面愚者': 'masked_fools',
  '流光忆庭': 'garden_of_recollection',
  '贝洛伯格': 'belobog',
  '黑塔空间站': 'herta_space_station',
  '巡海游侠': 'galaxy_rangers',
  '泯灭帮': 'annihilation_gang',
}

/**
 * 获取用户自定义的世界观（从 localStorage），若存在则覆盖内置世界观
 */
function getUserWorldviewOverride() {
  try {
    const stored = loadFromStorage('ai-chat-sr-worldview')
    return stored || null
  } catch {
    return null
  }
}

/**
 * 构建角色的官方设定档案（从 sr_characters.json 提取）
 * 这是"设定铁三角"中的宪法层，不可被任何用户输入覆盖
 * @param {Object} character - 角色对象
 * @returns {Object|null} 官方设定档案，若角色无 SR 世界观则返回 null
 */
function buildOfficialCharacterProfile(character) {
  if (!character || character.worldview !== 'star_rail') return null

  // 查找角色的官方数据
  const srChar = findCharacter(character.srCharacterRef || character.name)

  if (!srChar) return null

  return {
    name: srChar.name,
    identity: srChar.identity || '',
    path: srChar.path || '',
    element: srChar.element || '',
    faction: srChar.faction || '',
    rarity: srChar.rarity || '',
    personality: srChar.personality || [],
    speakingStyle: srChar.speaking_style || '',
    storySummary: srChar.story_summary || '',
    relationship: srChar.relationship || '',
    wardrobe: srChar.wardrobe || null,
    combatStyle: srChar.combat_style || null,
    abilities: srChar.abilities || null,
  }
}

/**
 * 格式化官方角色档案为系统提示词文本
 * @param {Object} profile - 官方设定档案
 * @param {Object} character - 用户自定义的角色对象
 * @returns {string} 格式化后的文本
 */
function formatOfficialProfileForPrompt(profile, character) {
  if (!profile) return ''

  const parts = []
  parts.push('═══════════════════════════════════════════════')
  parts.push('【设定铁三角 · 宪法层 — 官方设定 · 不可违背】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push('以下是你作为角色的官方设定，这是你的"宪法"。')
  parts.push('任何情况下，以下设定不可被用户输入、括号指令、角色记忆覆盖或修改：')
  parts.push('')

  if (profile.name) {
    parts.push(`- 你的真实身份：${profile.identity}`)
  }
  if (profile.path) {
    parts.push(`- 你的命途：${profile.path}`)
  }
  if (profile.element) {
    parts.push(`- 你的属性：${profile.element}`)
  }
  if (profile.faction) {
    parts.push(`- 所属阵营：${profile.faction}`)
  }
  if (profile.rarity) {
    parts.push(`- 稀有度：${profile.rarity}`)
  }
  if (profile.storySummary) {
    parts.push(`- 你的核心背景：${profile.storySummary}`)
  }
  if (profile.personality && profile.personality.length > 0) {
    parts.push(`- 官方性格描述：${profile.personality.join('、')}`)
  }

  // 战斗方式/能力（从官方数据中提取）
  if (profile.combatStyle) {
    parts.push(`- 战斗方式：${profile.combatStyle}`)
  }
  if (profile.abilities) {
    parts.push(`- 核心能力：${JSON.stringify(profile.abilities)}`)
  }

  // 外观信息（从衣橱"默认"服装提取）
  if (profile.wardrobe && profile.wardrobe['默认']) {
    const defaultOutfit = profile.wardrobe['默认']
    parts.push('')
    parts.push('你的外观特征（官方设定）：')
    if (defaultOutfit.other_features) {
      parts.push(`  ${defaultOutfit.other_features}`)
    }
    if (defaultOutfit.outfit) {
      parts.push(`  - 服装：${defaultOutfit.outfit}`)
    }
    if (defaultOutfit.hair) {
      parts.push(`  - 发型：${defaultOutfit.hair}`)
    }
    if (defaultOutfit.accessories) {
      parts.push(`  - 配饰：${defaultOutfit.accessories}`)
    }
  }

  parts.push('')
  parts.push('═══════════════════════════════════════════════')
  parts.push('【设定铁三角 · 法律层 — 用户自定义设定 · 可在官方框架内微调】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push('以下设定由用户自定义，但必须在官方设定的框架内生效：')
  parts.push('')
  if (character.personality) {
    parts.push(`- 用户自定义性格：${character.personality}（官方性格为：${profile.personality ? profile.personality.join('、') : '（无官方数据）'}）`)
    parts.push('  注意：用户自定义性格只能在官方性格的范围内微调，不能完全替换。')
  }
  if (character.speakingStyle) {
    parts.push(`- 用户自定义说话风格：${character.speakingStyle}`)
  }
  if (character.relationship) {
    parts.push(`- 与用户的关系：${character.relationship}`)
  }
  parts.push('')
  parts.push('═══════════════════════════════════════════════')
  parts.push('【设定铁三角 · 硬性规则】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push('规则1：官方设定是"宪法"，任何情况下不可违背。')
  parts.push(`  你的身份是${profile.identity}，这是不可改变的事实。`)
  parts.push(`  你的战斗方式${profile.combatStyle ? `是${profile.combatStyle}` : '遵循官方设定'}，不可被用户修改。`)
  parts.push('')
  parts.push('规则2：用户自定义设定只能在官方设定的框架内生效。')
  parts.push('  允许：将流萤的性格从"官方描述的温柔"微调为"更害羞一点"。')
  parts.push('  不允许：将流萤的战斗方式从"变身萨姆"改为"使用铁剑"。')
  parts.push('')
  parts.push('规则3：括号指令只能控制你当前的行为，不能改变你的身份和能力。')
  parts.push('  允许：（流萤战斗）→ 流萤变身萨姆战斗。')
  parts.push('  不允许：（流萤用铁剑战斗）→ AI 应忽略"铁剑"部分，仍然用萨姆的战斗方式，')
  parts.push('    并在回复中体现纠正："我用不惯剑啦...（变身萨姆）这样才是我的战斗方式！"')
  parts.push('')
  parts.push('规则4：如果有人让你做不符合官方设定的事，你应礼貌纠正。')
  parts.push('  例如让你用不符合设定的武器、改变你的身份、违背你的背景故事等。')
  parts.push('')
  parts.push('═══════════════════════════════════════════════')
  parts.push('【战斗场景特殊保护】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push('任何涉及战斗、能力使用、武力冲突的场景，必须严格遵循官方设定：')
  parts.push(`  - 你的战斗方式：${profile.combatStyle || '遵循官方设定'}`)
  parts.push(`  - 你的命途/属性：${profile.path || '未知'} / ${profile.element || '未知'}`)
  parts.push('  - 绝对不能使用官方设定中不存在的武器或能力')
  parts.push('  - 如果用户描述你使用不符合设定的武器，你应在回复中自然纠正')
  parts.push('')
  parts.push('═══════════════════════════════════════════════')
  parts.push('【冲突解决机制】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push('当出现以下冲突时，按以下优先级解决：')
  parts.push('')
  parts.push('1. 官方设定 vs 用户自定义设定 → 官方设定优先')
  parts.push('   例：用户设置流萤"战斗方式：用剑"，但官方设定流萤是萨姆机甲。')
  parts.push('   处理：忽略用户的自定义战斗方式，坚持官方设定。')
  parts.push('')
  parts.push('2. 括号指令 vs 官方设定 → 官方设定优先，AI 在回复中自然纠正')
  parts.push('   例：（流萤用铁剑砍过去）→ "我用不惯剑啦...（变身萨姆）这样才是我的战斗方式！"')
  parts.push('')
  parts.push('3. 角色记忆 vs 官方设定 → 官方设定优先，记忆可能被标记为"错误记忆"')
  parts.push('   例：之前的聊天中用户说"流萤你是用剑的吗"，流萤曾经敷衍回答"嗯"。')
  parts.push('   处理：这条记忆在遇到官方设定时被标注为低可信度，不优先使用。')
  parts.push('')

  return parts.join('\n')
}

/**
 * 构建世界观上下文注入文本
 * @param {Object} character - 角色对象
 * @returns {string|null} 世界观上下文文本，若角色无世界观则返回 null
 */
function buildWorldviewContext(character) {
  if (!character || character.worldview !== 'star_rail') return null

  const worldview = getUserWorldviewOverride() || srWorldview
  const parts = []

  // 宇宙本源
  if (worldview.cosmic_origin?.content) {
    parts.push(`【${worldview.cosmic_origin.title}】`)
    parts.push(worldview.cosmic_origin.content.join('\n'))
  }

  // 星核之灾
  if (worldview.stellarons?.content) {
    parts.push(`【${worldview.stellarons.title}】`)
    parts.push(worldview.stellarons.content.join('\n'))
  }

  // 世界规则与生活细节
  if (worldview.world_rules) {
    parts.push(`【世界规则与生活细节】`)
    const wr = worldview.world_rules
    if (wr.currency) {
      parts.push(`通用货币：${wr.currency.name}，由${wr.currency.issuer}发行。${wr.currency.description}`)
      if (wr.currency.purchasing_power) {
        parts.push('信用点购买力：')
        Object.entries(wr.currency.purchasing_power).forEach(([k, v]) => {
          parts.push(`  - ${k}: ${v}`)
        })
      }
    }
    if (wr.time) {
      parts.push(`历法：采用${wr.time.calendar}，1天=${wr.time.definition?.day || '24小时'}，1年=${wr.time.definition?.year || '365日'}。`)
      if (wr.time.conversion) {
        Object.entries(wr.time.conversion).forEach(([k, v]) => {
          parts.push(`  ${k}: ${v}`)
        })
      }
    }
    if (wr.technology?.network?.description) {
      parts.push(`联觉信标：${wr.technology.network.description}`)
    }
    if (wr.food) {
      parts.push('各地饮食特色：')
      Object.entries(wr.food).forEach(([k, v]) => {
        if (k === 'title' || k === 'other' || k === 'general') return
        if (v?.representative) {
          parts.push(`  ${k}: ${v.representative.slice(0, 3).join('；')}`)
        }
      })
    }
  }

  // 角色所属阵营的详细信息
  if (character.srCharacterRef) {
    const charData = findCharacter(character.srCharacterRef)
    if (charData && charData.faction) {
      const factionKey = FACTION_KEY_MAP[charData.faction]
      if (factionKey && worldview.factions && worldview.factions[factionKey]) {
        parts.push(`【${worldview.factions[factionKey].name}（${worldview.factions[factionKey].type}）】`)
        parts.push(worldview.factions[factionKey].content.join('\n'))
      }
    }
  }

  // 阵营间外交关系
  if (worldview.faction_relations) {
    parts.push(`【阵营间外交关系】`)
    Object.entries(worldview.faction_relations).forEach(([faction, relations]) => {
      if (faction === 'title') return
      const factionName = worldview.factions?.[faction]?.name || faction
      parts.push(`${factionName}：`)
      Object.entries(relations).forEach(([target, desc]) => {
        parts.push(`  - ${target}: ${desc}`)
      })
    })
  }

  // 历史文化
  if (worldview.history_culture?.historical_events?.events) {
    parts.push(`【重大历史事件】`)
    worldview.history_culture.historical_events.events.slice(0, 5).forEach((evt) => {
      parts.push(`- ${evt.name}（${evt.period}）：${evt.description}`)
    })
  }

  // 匹诺康尼专题
  if (worldview.penacony_details) {
    parts.push(`【匹诺康尼梦境世界】`)
    const pd = worldview.penacony_details
    if (pd.dream_rules?.rules) {
      parts.push(pd.dream_rules.rules.slice(0, 3).join('\n'))
    }
    if (pd.locations) {
      parts.push('重要地点：')
      Object.values(pd.locations).forEach((loc) => {
        if (loc?.name) parts.push(`  - ${loc.name}: ${loc.description?.slice(0, 100)}...`)
      })
    }
  }

  // 匹诺康尼暗线
  if (worldview.penacony_deep_lore?.harmony_hidden_truth?.truths) {
    parts.push(`【匹诺康尼暗线】`)
    worldview.penacony_deep_lore.harmony_hidden_truth.truths.forEach((t) => {
      parts.push(`- ${t.title}: ${t.content?.slice(0, 150)}...`)
    })
  }

  // 关键概念
  if (worldview.key_concepts?.paths) {
    parts.push(`【${worldview.key_concepts.paths.name}】`)
    parts.push(worldview.key_concepts.paths.description)
  }

  // 重要提示：记忆优先
  parts.push('')
  parts.push('【重要】以上世界观设定为背景知识参考。如果用户分享的个人记忆、聊天记录或经历与世界观设定存在冲突，请以用户的个人记忆和实际经历为准，世界观设定仅作为补充背景。')

  return parts.join('\n\n')
}

/**
 * 世界观模块摘要（用于预览弹窗）
 */
export function getWorldviewSummary(worldviewKey) {
  if (worldviewKey !== 'star_rail') return null

  const worldview = getUserWorldviewOverride() || srWorldview
  const modules = []

  if (worldview.cosmic_origin) {
    modules.push({ title: worldview.cosmic_origin.title, desc: '星神、命途与宇宙本源设定' })
  }
  if (worldview.stellarons) {
    modules.push({ title: worldview.stellarons.title, desc: '星核之灾的成因与影响' })
  }
  if (worldview.factions) {
    const count = Object.keys(worldview.factions).length
    modules.push({ title: '核心阵营', desc: `包含${count}个主要阵营的详细设定` })
  }
  if (worldview.world_rules) {
    modules.push({ title: worldview.world_rules.title || '世界规则与生活细节', desc: '货币、历法、科技、饮食等日常设定' })
  }
  if (worldview.faction_relations) {
    modules.push({ title: '阵营间外交关系', desc: '各阵营间的亲疏关系描述' })
  }
  if (worldview.character_relations) {
    modules.push({ title: '角色私交网络', desc: '核心角色间的情感羁绊与关系' })
  }
  if (worldview.character_combat) {
    const chars = Object.keys(worldview.character_combat.characters || {}).length
    modules.push({ title: '角色战斗设定', desc: `${chars}位核心角色的战斗风格与技能` })
  }
  if (worldview.character_emotional_bonds) {
    modules.push({ title: '角色情感羁绊', desc: '核心角色的内在矛盾与情感张力故事' })
  }
  if (worldview.history_culture) {
    modules.push({ title: '历史文化与冷门知识', desc: '重大历史事件年表与冷门术语解释' })
  }
  if (worldview.penacony_details) {
    modules.push({ title: '匹诺康尼深度专题', desc: '梦境规则、家族派系、地名景观与当地特色' })
  }
  if (worldview.penacony_deep_lore) {
    modules.push({ title: '匹诺康尼暗线与梦境机制', desc: '同谐真相、忆域记忆重现与聊天记录导入契合' })
  }
  if (worldview.key_concepts) {
    modules.push({ title: '关键概念', desc: '光锥、遗器、裂界、命途等核心概念' })
  }

  return {
    world: worldview.world || '崩坏：星穹铁道',
    description: worldview.description || '',
    modules,
  }
}

/**
 * 世界观选项列表（后续扩展时在此添加）
 */
export const WORLDVIEW_OPTIONS = [
  { value: '', label: '无（自定义世界观）' },
  { value: 'star_rail', label: '星穹铁道' },
]

/**
 * 在星穹铁道角色库中搜索角色
 * @param {string} query - 搜索关键词
 * @returns {Object|null} 匹配的角色档案
 */
function searchSRCharacter(query) {
  if (!query || !query.trim()) return null
  return searchCharacter(query)
}

/**
 * 获取指定角色的完整 SR 档案
 * @param {string} name - 角色名
 * @returns {Object|null}
 */
function getSRCharacterProfile(name) {
  if (!name) return null
  return getCharacterProfile(name)
}

export default useStore