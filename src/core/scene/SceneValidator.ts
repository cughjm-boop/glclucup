/**
 * SceneValidator — 场景校验器（Chat Scene Engine V3）
 *
 * AI 回复后自动校验，确保回复内容与当前场景一致。
 * 检测：地点冲突、角色不存在、天气冲突、时间冲突、物体不存在。
 * 小错误自动修正，严重错误重新生成。
 */

import type { SceneState, ValidationResult, ValidationError, ValidationWarning } from './SceneManager'

// ===== 地点关键词库 =====

/** 地点关键词 → 标准地点名映射 */
const LOCATION_KEYWORDS: Record<string, string> = {
  '家': '家里',
  '家里': '家里',
  '家中': '家里',
  '我家': '家里',
  '客厅': '客厅',
  '卧室': '卧室',
  '厨房': '厨房',
  '浴室': '浴室',
  '卫生间': '浴室',
  '洗手间': '浴室',
  '阳台': '阳台',
  '书房': '书房',
  '沙滩': '沙滩',
  '海边': '海边',
  '海滩': '海滩',
  '森林': '森林',
  '公园': '公园',
  '街上': '逛街',
  '逛街': '逛街',
  '外面': '外面',
  '门口': '门口',
  '咖啡店': '咖啡店',
  '咖啡馆': '咖啡店',
  '餐厅': '餐厅',
  '饭店': '餐厅',
  '商场': '商场',
  '超市': '超市',
  '图书馆': '图书馆',
  '电影院': '电影院',
  '健身房': '健身房',
  '办公室': '办公室',
  '公司': '办公室',
  '酒吧': '酒吧',
  '医院': '医院',
  '学校': '学校',
  '教室': '教室',
  '泳池': '游泳池',
  '游泳池': '游泳池',
  '温泉': '温泉',
  '列车': '星穹列车',
  '星穹列车': '星穹列车',
  '匹诺康尼': '匹诺康尼',
  '黑塔空间站': '黑塔空间站',
  '仙舟': '仙舟罗浮',
  '罗浮': '仙舟罗浮',
  '贝洛伯格': '贝洛伯格',
  '雅利洛': '雅利洛',
  '流萤家': '流萤家',
  '三月七的房间': '三月七的房间',
}

/** 区域级关键词（area / 房间子部分）—— 它们不触发 location 冲突 */
const AREA_LEVEL_KEYWORDS = new Set([
  '沙发', '窗边', '门口', '阳台', '桌子', '吧台', '茶几', '床头',
])

/** 天气关键词 */
const WEATHER_KEYWORDS = ['晴', '多云', '阴', '雨', '暴雨', '雪', '暴雪', '风', '大风', '雾', '霾', '雷电', '台风']

/** 时间关键词 */
const TIME_PERIOD_KEYWORDS = ['早上', '上午', '中午', '下午', '傍晚', '晚上', '深夜', '凌晨', '黄昏', '黎明']

/** 时间冲突检测关键词 */
const DAYTIME_KEYWORDS = ['太阳', '阳光', '日光', '天亮', '大太阳', '太阳好大', '太阳真大', '阳光明媚']
const NIGHTTIME_KEYWORDS = ['月亮', '月光', '星星', '天黑', '夜色', '深夜', '半夜']

// ===== 场景校验器 =====

export class SceneValidator {
  /**
   * 校验 AI 回复文本是否与当前场景一致
   * @param replyText - AI 回复文本
   * @param scene - 当前场景状态
   * @param activeCharacters - 当前在场的角色名列表
   * @returns 校验结果
   */
  validate(
    replyText: string,
    scene: Readonly<SceneState>,
    activeCharacters: string[] = []
  ): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // 1. 地点冲突检测
    this.checkLocationConflict(replyText, scene, errors)

    // 2. 角色存在检测
    this.checkCharacterPresence(replyText, scene, activeCharacters, errors)

    // 3. 天气冲突检测
    this.checkWeatherConflict(replyText, scene, errors)

    // 4. 时间冲突检测
    this.checkTimeConflict(replyText, scene, errors)

    // 5. 物体存在检测
    this.checkObjectExistence(replyText, scene, errors)

    // 6. 场景锁定检测
    if (scene.locked) {
      this.checkSceneLocked(replyText, scene, errors)
    }

    const valid = errors.length === 0
    const autoFixable = errors.every((e) =>
      ['location_conflict', 'weather_conflict', 'time_conflict'].includes(e.type)
    )

    let fixedText: string | undefined
    if (!valid && autoFixable) {
      fixedText = this.autoFix(replyText, errors)
    }

    return { valid, errors, warnings, autoFixable, fixedText }
  }

  /**
   * 地点冲突检测：AI 提到当前场景之外的地点
   */
  private checkLocationConflict(
    text: string,
    scene: Readonly<SceneState>,
    errors: ValidationError[]
  ): void {
    const currentLocation = scene.location

    for (const [keyword, locationName] of Object.entries(LOCATION_KEYWORDS)) {
      // 跳过与当前地点相同的关键词
      if (locationName === currentLocation) continue
      // 某些地点可能包含当前地点（如"流萤家"不会和"家"冲突）
      if (currentLocation && currentLocation.includes(keyword)) continue
      if (keyword.length < 2) continue
      // 跳过区域级别 / 家具 / 窗户 的词，它们不会造成地点冲突
      if (AREA_LEVEL_KEYWORDS.has(keyword)) continue
      // 若 locationName 是区域级关键词（比如门口/阳台本来就可能存在于家里），与家里不冲突
      if (scene.location && scene.location.includes('家') && ['客厅', '卧室', '厨房', '浴室', '阳台', '书房', '门口', '洗手间', '卫生间'].includes(locationName)) continue

      if (text.includes(keyword)) {
        // 检查是否只是引用而非实际场景切换
        // 允许 AI 说"我记得上次在XX..."，但不允许"我们到XX吧"
        const context = this.getContextAround(text, keyword, 15)
        if (this.isActualLocationChange(context)) {
          errors.push({
            type: 'location_conflict',
            message: `AI 回复提到了"${keyword}"，但当前场景是"${currentLocation}"`,
            detail: `上下文：${context}`,
          })
        }
      }
    }
  }

  /**
   * 角色存在检测：AI 提到不在场的角色
   */
  private checkCharacterPresence(
    text: string,
    scene: Readonly<SceneState>,
    activeCharacters: string[],
    errors: ValidationError[]
  ): void {
    // 提取文本中提到的角色名（通过"XX说"、"XX："等模式）
    const charNamePattern = /([^\s，。！？、：""''（）()]{2,4})(?:说|道|问|答|喊道|说道|开口|：|:)/g
    let match: RegExpExecArray | null
    const mentionedChars = new Set<string>()

    while ((match = charNamePattern.exec(text)) !== null) {
      mentionedChars.add(match[1])
    }

    // 场景中的角色 ID 列表
    const sceneCharIds = new Set(scene.characters.map((c) => c.characterId))

    for (const name of mentionedChars) {
      // 不在活跃角色列表中，也不在场景角色中
      const isActive = activeCharacters.includes(name)
      const isSceneChar = sceneCharIds.has(name)
      if (!isActive && !isSceneChar) {
        errors.push({
          type: 'character_not_present',
          message: `AI 回复中提到了"${name}"，但该角色不在当前场景中`,
          detail: `活跃角色：${activeCharacters.join(', ') || '无'}，场景角色：${scene.characters.map((c) => c.characterId).join(', ') || '无'}`,
        })
      }
    }
  }

  /**
   * 天气冲突检测：Scene 的天气与 AI 回复不符
   */
  private checkWeatherConflict(
    text: string,
    scene: Readonly<SceneState>,
    errors: ValidationError[]
  ): void {
    const currentWeather = scene.weather
    if (!currentWeather || currentWeather === '晴') {
      // 检测是否有暴雨、下雪等相反天气描述
      if (text.includes('暴雨') || text.includes('倾盆大雨') || text.includes('大雨倾盆')) {
        errors.push({
          type: 'weather_conflict',
          message: `AI 回复提到"暴雨"，但当前天气是"${currentWeather}"`,
          detail: '需要将天气描述修正为当前天气',
        })
      }
      if (text.includes('暴雪') || text.includes('大雪纷飞') || text.includes('雪花')) {
        errors.push({
          type: 'weather_conflict',
          message: `AI 回复提到"雪"，但当前天气是"${currentWeather}"`,
          detail: '需要将天气描述修正为当前天气',
        })
      }
    }

    if (currentWeather === '雨' || currentWeather === '暴雨') {
      if (text.includes('太阳真大') || text.includes('艳阳高照') || text.includes('晴空万里')) {
        errors.push({
          type: 'weather_conflict',
          message: `AI 回复提到晴天，但当前天气是"${currentWeather}"`,
          detail: '需要将天气描述修正为当前天气',
        })
      }
    }
  }

  /**
   * 时间冲突检测：当前时段与 AI 回复不符
   */
  private checkTimeConflict(
    text: string,
    scene: Readonly<SceneState>,
    errors: ValidationError[]
  ): void {
    const timePeriod = scene.timePeriod
    if (!timePeriod) return

    const isNightTime = ['晚上', '深夜', '凌晨', '半夜'].includes(timePeriod)
    const isDayTime = ['早上', '上午', '中午', '下午'].includes(timePeriod)

    if (isNightTime) {
      // 夜间不应出现白天描述
      for (const kw of DAYTIME_KEYWORDS) {
        if (text.includes(kw)) {
          errors.push({
            type: 'time_conflict',
            message: `AI 回复提到"${kw}"，但当前时段是"${timePeriod}"`,
            detail: '需要将时间描述修正为当前时段',
          })
          break
        }
      }
    }

    if (isDayTime) {
      for (const kw of NIGHTTIME_KEYWORDS) {
        if (text.includes(kw)) {
          errors.push({
            type: 'time_conflict',
            message: `AI 回复提到"${kw}"，但当前时段是"${timePeriod}"`,
            detail: '需要将时间描述修正为当前时段',
          })
          break
        }
      }
    }
  }

  /**
   * 物体存在检测：AI 提到场景中不存在的物体
   */
  private checkObjectExistence(
    text: string,
    scene: Readonly<SceneState>,
    errors: ValidationError[]
  ): void {
    const existingObjects = new Set(
      scene.interactableObjects.map((o) => o.name)
    )

    // 常见物体 + 动作模式
    const objectActionPatterns = [
      { pattern: /打开(冰箱)/, object: '冰箱' },
      { pattern: /从(冰箱)里/, object: '冰箱' },
      { pattern: /打开(电视)/, object: '电视' },
      { pattern: /打开(烤箱)/, object: '烤箱' },
      { pattern: /打开(微波炉)/, object: '微波炉' },
      { pattern: /从(书柜)里/, object: '书柜' },
      { pattern: /从(衣柜)里/, object: '衣柜' },
      { pattern: /坐在(秋千)上/, object: '秋千' },
      { pattern: /打开(咖啡机)/, object: '咖啡机' },
      { pattern: /打开(跑步机)/, object: '跑步机' },
    ]

    for (const { pattern, object } of objectActionPatterns) {
      if (pattern.test(text) && !existingObjects.has(object)) {
        errors.push({
          type: 'object_not_found',
          message: `AI 回复提到"${object}"，但当前场景中不存在该物体`,
          detail: `场景中存在的物体：${scene.interactableObjects.map((o) => o.name).join('、') || '无'}`,
        })
      }
    }
  }

  /**
   * 场景锁定检测：AI 不得修改已锁定的场景
   */
  private checkSceneLocked(
    text: string,
    scene: Readonly<SceneState>,
    errors: ValidationError[]
  ): void {
    // 检测 AI 是否试图修改场景
    const changePatterns = [
      /我们(?:现在|已经)?(?:来到|到了|走进|进入|到达)(.{2,8})/,
      /(?:突然|忽然|现在)(.{2,4})(?:变成了|变成了|改为|切换为)(.{2,4})/,
    ]

    for (const pattern of changePatterns) {
      if (pattern.test(text)) {
        errors.push({
          type: 'scene_locked',
          message: 'AI 试图修改已锁定的场景',
          detail: '场景已锁定，AI 不得修改场景',
        })
        break
      }
    }
  }

  /**
   * 自动修正（简单替换）
   */
  private autoFix(text: string, errors: ValidationError[]): string {
    let fixed = text

    for (const error of errors) {
      switch (error.type) {
        case 'weather_conflict':
          // 简单移除天气相关描述
          fixed = fixed.replace(/暴雨倾盆[，。！？]?/g, '')
          fixed = fixed.replace(/倾盆大雨[，。！？]?/g, '')
          fixed = fixed.replace(/暴雪[，。！？]?/g, '')
          break
        case 'time_conflict':
          fixed = fixed.replace(/太阳真大[，。！？]?/g, '')
          fixed = fixed.replace(/艳阳高照[，。！？]?/g, '')
          fixed = fixed.replace(/看着窗外的星星[，。！？]?/g, '')
          break
      }
    }

    return fixed.trim()
  }

  /**
   * 获取关键词周围的上下文
   */
  private getContextAround(text: string, keyword: string, range: number): string {
    const idx = text.indexOf(keyword)
    if (idx === -1) return ''
    const start = Math.max(0, idx - range)
    const end = Math.min(text.length, idx + keyword.length + range)
    return text.slice(start, end)
  }

  /**
   * 判断是否是实际的地点切换（而非回忆引用）
   */
  private isActualLocationChange(context: string): boolean {
    // 回忆引用模式，不算冲突
    const memoryPatterns = ['记得', '上次', '以前', '曾经', '那时候', '之前', '过去']
    if (memoryPatterns.some((p) => context.includes(p))) {
      return false
    }
    // 实际切换模式
    const changePatterns = ['我们到', '我们去', '来到', '走进', '进入', '到', '去']
    return changePatterns.some((p) => context.includes(p))
  }
}

/** 导出单例 */
export const sceneValidator = new SceneValidator()