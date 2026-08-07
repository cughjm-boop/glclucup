/**
 * SceneUpdater — 场景更新器（Chat Scene Engine V3）
 *
 * 解析用户消息和 AI 回复中的场景变更意图。
 * 只有以下情况允许修改场景：
 *   - 用户明确指令（如"我们去厨房"）
 *   - 系统按钮触发（如切换场景功能）
 *   - 剧情事件触发（如列车跃迁结束）
 * 除此之外，AI 不得修改场景。
 *
 * 动作与移动分离：
 *   - "我站起来" → 只更新 action，不改位置
 *   - "我走到窗边" → 更新 position
 *   - "我走进厨房" → 更新 area
 *   - "我们来到匹诺康尼" → 更新 location
 */

import type { SceneManager, SceneUpdateCommand } from './SceneManager'
import { getSceneManager } from './SceneManager'

// ===== 用户指令解析模式 =====

/** 常见具体地点（白名单）—— 用户只写"去家里/去沙滩"等单字/双字地名时直接识别为 location
 *  用于解决 `回家吧/去餐厅吃饭吧/去卧室` 这类场景
 */
const KNOWN_LOCATIONS: Record<string, string> = {
  '家': '家',
  '家里': '家里',
  '家中': '家中',
  '卧室': '卧室',
  '客厅': '客厅',
  '厨房': '厨房',
  '浴室': '浴室',
  '洗手间': '洗手间',
  '卫生间': '卫生间',
  '餐厅': '餐厅',
  '饭店': '饭店',
  '咖啡馆': '咖啡馆',
  '咖啡店': '咖啡店',
  '公司': '公司',
  '办公室': '办公室',
  '沙滩': '沙滩',
  '海边': '海边',
  '海滩': '海滩',
  '公园': '公园',
  '学校': '学校',
  '森林': '森林',
  '街上': '街上',
  '逛街': '逛街',
  '外面': '外面',
  '门口': '门口',
  '阳台': '阳台',
  '书房': '书房',
  '健身房': '健身房',
  '商场': '商场',
  '电影院': '电影院',
  '泳池': '泳池',
  '游泳池': '游泳池',
  '温泉': '温泉',
  '超市': '超市',
}

// 动词前缀：我/我们 + 动词 + 地名
const LOCATION_VERBS_PREFIX = '(?:我们|我|大家)(?:现在|已经)?'

/** 地点变更模式（含白名单短地名） */
const LOCATION_PATTERNS = [
  new RegExp(`${LOCATION_VERBS_PREFIX}(?:回到|回|来到|到了|抵达|到达|进入|走进)(.{1,8})`),
  /(?:场景切换|传送|瞬移|跃迁)(?:到|至)?(.{1,8})/,
  new RegExp(`${LOCATION_VERBS_PREFIX}(?:去|出发去|一起来到)(.{1,8})(?:吧|看看|逛逛|一趟|吃饭|洗澡|睡觉|散步|玩)?$`),
  // 回家/出门 这种短语
  new RegExp(`${LOCATION_VERBS_PREFIX}(回家|出门|出去|回卧室|回客厅|去厨房|去浴室|去餐厅|去沙滩|去海边|去公园)`),
]

/** 区域变更模式 —— 位置级变更（房间内的子地点） */
const AREA_PATTERNS = [
  /(?:走进|进入|到)(.{1,4})(?:去|看看|吧|啦)/,
  /(?:我|我们)(?:去|到|进)(.{1,4})/,
  /(?:我|我们)(?:现在|已经)?(?:在|到)(.{1,4})(?:了|里|呢)/,
]

/** 位置变更模式 —— 房间内的具体家具/位置：沙发/窗边/床上 */
const POSITION_PATTERNS = [
  /(?:我|我们)(?:走到|坐到|站到|靠到|靠在|躺在|趴到)(.{1,4})/,
  /(?:我|我们)(?:在|到)(.{1,4})(?:坐下|站着|躺着|靠着|趴着)/,
  /(?:走到|坐到|躺到|站到)(.{1,4})(?:上|边|旁|上呢|上了)/,
]

/** 动作变更模式（不影响位置） */
const ACTION_PATTERNS = [
  /(?:我|我们)(站起来|站起身|起身|坐下|躺下|蹲下|转过身|抬起头|低下头|闭上眼睛|睁开眼睛|挥挥手|点点头|摇摇头|叹气|微笑|皱眉)/,
  /(?:我|我们)(伸了个懒腰|打了个哈欠|咳嗽了一下|深呼吸)/,
]

/** 天气变更模式 */
const WEATHER_PATTERNS = [
  /(?:天气|现在)(?:变成|变为|改成|改为)(.{2,4})/,
  /(?:突然|忽然)(.{2,4})(?:了|起来)/,
]

/** 时段变更模式 */
const TIME_PERIOD_PATTERNS = [
  /(?:时间|现在)(?:变成|变为|改成|改为)(.{2,4})/,
  /(?:现在|已经)(?:是|到了)(.{2,4})/,
]

/** 净化位置/场景候选词：去除对话尾巴、标点符号、语气词，只保留地名核心部分 */
function cleanLocationCandidate(raw: string): string {
  if (!raw) return ''
  let cleaned = raw.trim()

  // 去除结尾标点符号（。！？、，……~《》""''）
  cleaned = cleaned.replace(/[。！？、，.,!?；;：:~\-…《》"'“”‘’）)】〗]+$/u, '')

  // 去除常见对话后缀（如"吃饭吧/洗澡？/泡澡吗/睡觉吧/我们去玩吧..."）
  const DIALOGUE_SUFFIXES = [
    '吃饭吧', '吃饭', '洗澡吧', '泡澡吧', '泡澡', '洗澡',
    '睡觉吧', '睡觉', '散步吧', '散步', '玩吧', '玩',
    '逛一逛', '逛逛', '吃吧', '喝吧', '聊聊', '聊聊天',
    '好吗', '好吗？', '吧', '吗', '呢', '嘛', '啦', '了',
    '一下', '看看', '一趟', '一会儿',
  ]
  for (const suffix of DIALOGUE_SUFFIXES) {
    if (cleaned.endsWith(suffix) && cleaned.length > suffix.length + 1) {
      cleaned = cleaned.slice(0, -suffix.length)
      break
    }
  }
  // 再次去尾符号
  cleaned = cleaned.replace(/[。！？、，.,!?；;：:~\-…《》"'“”‘’）)】\s]+$/u, '').trim()

  // 白名单精确子串匹配（如果被脏词包围，抽出真实地名）
  for (const key of Object.keys(KNOWN_LOCATIONS)) {
    if (cleaned.includes(key)) {
      return key
    }
  }

  return cleaned
}

/** 根据白名单提升短地名到已知 location，单字/双字的模糊地点直接标准化 */
function promoteByWhitelist(candidate: string): string | null {
  if (!candidate) return null
  if (KNOWN_LOCATIONS[candidate]) return KNOWN_LOCATIONS[candidate]
  // 同义归一：家 ↔ 家里 ↔ 家中
  if (['家', '家里', '家中', '我家'].includes(candidate)) return '家里'
  if (['沙滩', '海边', '海滩'].includes(candidate)) return candidate
  return null
}

// ===== 场景更新器 =====

export class SceneUpdater {
  private manager: SceneManager
  private characterId: string

  constructor(characterId: string) {
    this.characterId = characterId
    this.manager = getSceneManager(characterId)
  }

  /**
   * 从用户消息中解析场景变更指令
   * @param content - 用户消息内容
   * @returns 解析出的指令数组，空数组表示无场景变更
   */
  parseUserMessage(content: string): SceneUpdateCommand[] {
    if (!content || !content.trim()) return []

    const commands: SceneUpdateCommand[] = []
    const cleanContent = this.stripBracketCommands(content)

    // 1. 检查地点变更（优先白名单严格匹配）
    for (const pattern of LOCATION_PATTERNS) {
      const match = cleanContent.match(pattern)
      if (match && match[1]) {
        const raw = match[1].trim()
        // 净化字符串：去掉对话尾巴/标点符号。场景地名不允许这些。
        const cleaned = cleanLocationCandidate(raw)
        if (!cleaned) continue
        const promoted = promoteByWhitelist(cleaned)
        if (promoted) {
          commands.push({ type: 'location', value: promoted, source: 'user' })
          return commands
        }
        if (cleaned.length >= 1 && cleaned.length <= 10) {
          commands.push({ type: 'location', value: cleaned, source: 'user' })
          return commands
        }
      }
    }

    // 2. 检查区域变更
    for (const pattern of AREA_PATTERNS) {
      const match = cleanContent.match(pattern)
      if (match && match[1]) {
        const raw = match[1].trim()
        const cleaned = cleanLocationCandidate(raw)
        if (!cleaned || cleaned.length < 1 || cleaned.length > 8) continue

        // 若白名单是地点级，直接升级为 location（例如"餐厅"）
        if (KNOWN_LOCATIONS[cleaned]) {
          commands.push({ type: 'location', value: KNOWN_LOCATIONS[cleaned], source: 'user' })
          break
        }
        // 排除家具级纯位置词 (沙发/窗边/床...)
        if (!this.isPositionOnly(cleaned)) {
          commands.push({ type: 'area', value: cleaned, source: 'user' })
          break
        }
      }
    }

    // 3. 检查位置变更（房间内具体家具/位置：沙发/窗边/床上）
    for (const pattern of POSITION_PATTERNS) {
      const match = cleanContent.match(pattern)
      if (match && match[1]) {
        const raw = match[1].trim()
        const cleaned = cleanLocationCandidate(raw)
        if (!cleaned || cleaned.length < 1 || cleaned.length > 8) continue
        commands.push({ type: 'position', value: cleaned, source: 'user' })
        break
      }
    }

    // 4. 检查动作变更（不影响位置）
    for (const pattern of ACTION_PATTERNS) {
      const match = cleanContent.match(pattern)
      if (match && match[1]) {
        commands.push({
          type: 'action',
          characterId: this.characterId,
          value: match[1].trim(),
          source: 'user',
        })
        break
      }
    }

    // 5. 检查天气变更
    for (const pattern of WEATHER_PATTERNS) {
      const match = cleanContent.match(pattern)
      if (match && match[1]) {
        commands.push({
          type: 'weather',
          value: match[1].trim(),
          source: 'user',
        })
        break
      }
    }

    // 6. 检查时段变更
    for (const pattern of TIME_PERIOD_PATTERNS) {
      const match = cleanContent.match(pattern)
      if (match && match[1]) {
        commands.push({
          type: 'timePeriod',
          value: match[1].trim(),
          source: 'user',
        })
        break
      }
    }

    // 7. 检查物品添加
    const objectMentions = this.extractNewObjects(cleanContent)
    for (const obj of objectMentions) {
      commands.push({
        type: 'addObject',
        value: obj,
        source: 'user',
      })
    }

    return commands
  }

  /**
   * 应用所有指令到场景管理器
   */
  applyCommands(commands: SceneUpdateCommand[]): boolean {
    let changed = false
    for (const cmd of commands) {
      if (this.manager.applyCommand(cmd)) {
        changed = true
      }
    }
    return changed
  }

  /**
   * 系统触发场景变更（如剧情事件）
   */
  triggerSystemChange(command: SceneUpdateCommand): boolean {
    command.source = 'story_event'
    return this.manager.applyCommand(command)
  }

  /**
   * 锁定场景
   */
  lock(): void {
    this.manager.applyCommand({ type: 'lock', value: '', source: 'system' })
  }

  /**
   * 解锁场景
   */
  unlock(): void {
    this.manager.applyCommand({ type: 'unlock', value: '', source: 'system' })
  }

  /** 获取场景管理器 */
  getManager(): SceneManager {
    return this.manager
  }

  // ===== 私有方法 =====

  /** 去掉括号指令 */
  private stripBracketCommands(content: string): string {
    return content.replace(/（[^）]+）/g, '').trim()
  }

  /** 判断是否为位置级别（而非区域级别） */
  private isPositionOnly(value: string): boolean {
    const positionOnly = ['沙发', '椅子', '床边', '窗边', '窗台', '门口', '角落', '桌子', '吧台']
    return positionOnly.includes(value)
  }

  /** 从文本中提取新物体 */
  private extractNewObjects(content: string): string[] {
    const objects: string[] = []
    const existingObjects = new Set(
      this.manager.getState().interactableObjects.map((o) => o.name)
    )

    const objectMentionPatterns = [
      /(?:这里|这)有(?:一个|一台|一只|一把|一张|一件)?(.{2,4})/g,
      /(?:看到|看见|发现)(?:了)?(?:一个|一台|一只|一把|一张|一件)?(.{2,4})/g,
      /(?:拿出|掏出|取出)(?:了)?(?:一个|一台|一只|一把|一张|一件)?(.{2,4})/g,
    ]

    for (const pattern of objectMentionPatterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.exec(content)) !== null) {
        const obj = match[1]?.trim()
        if (obj && obj.length >= 2 && obj.length <= 6 && !existingObjects.has(obj)) {
          objects.push(obj)
          existingObjects.add(obj)
        }
      }
    }

    return objects
  }
}

/** 全局 SceneUpdater 存储（按角色 ID 隔离） */
const sceneUpdaters: Map<string, SceneUpdater> = new Map()

export function getSceneUpdater(characterId: string): SceneUpdater {
  if (!sceneUpdaters.has(characterId)) {
    sceneUpdaters.set(characterId, new SceneUpdater(characterId))
  }
  return sceneUpdaters.get(characterId)!
}

export function disposeSceneUpdater(characterId: string): void {
  sceneUpdaters.delete(characterId)
}