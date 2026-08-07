/**
 * 动态角色数据加载器
 *
 * 职责：
 * 根据用户消息中的关键词，智能决定加载哪些角色数据模块，
 * 减少不必要的 Token 消耗。
 *
 * 加载规则：
 * - 底线（始终加载）：personality + speaking_style + 基础信息
 * - 涉及外貌/头发 → 加载 hair
 * - 涉及服装/穿搭 → 加载 wardrobe（当前服装）
 * - 涉及背景/剧情 → 加载 story_summary
 * - 涉及关系/人际 → 加载 relationship
 * - 深度聊天 → 加载全部
 */

// ===== 关键词 → 模块映射 =====

const KEYWORD_RULES = [
  {
    module: 'hair',
    keywords: [
      '头发', '发型', '发色', '长发', '短发', '刘海', '马尾', '辫子',
      '发饰', '发髻', '卷发', '直发', '染发', '发型', '发尾', '发束',
      '鬓角', '鬓发', '发丝', '发梢', '发量',
      '颜值', '容貌', '面孔', '脸蛋', '长相', '外貌', '外表',
      '好看', '漂亮', '美丽', '可爱', '迷人', '帅气',
      '扎头发', '披发', '剪头发', '发型变', '换发型',
    ],
  },
  {
    module: 'wardrobe',
    keywords: [
      '服装', '穿搭', '换装', '衣服', '裙子', '外套', '鞋子',
      '配饰', '打扮', '造型', '时装', '礼服', '制服',
      '穿', '换衣服', '更衣', '衣橱', '衣柜',
      '上衣', '裤子', '袜子', '手套', '首饰', '项链', '耳环',
      '腰带', '领带', '围巾', '帽子', '眼镜',
      '睡衣', '泳衣', '婚纱', '便服', '正装', '休闲装',
      '时尚', '搭配', '着装', '穿什么', '怎么穿',
      '战斗服', '机甲', '披风', '斗篷', '盔甲',
      '（换装', '（换上', '（穿着', '（身穿',
    ],
  },
  {
    module: 'story_summary',
    keywords: [
      '背景', '过去', '剧情', '故事', '经历', '以前', '身世',
      '来历', '童年', '回忆', '历史', '往事', '曾经',
      '出生', '成长', '过去', '以前', '当年', '从前',
      '星核猎手', '星核', '艾利欧', '银狼', '卡芙卡',
      '开拓者', '仙舟', '罗浮', '匹诺康尼', '欢愉', '虚无',
      '你是谁', '你是什么人', '你从哪来', '你的过去',
      '说说你', '讲讲你的', '你的故事',
      '为什么', '怎么回事', '发生了什么', '怎么变成',
      '剧情', '设定', '原作', '官方',
    ],
  },
  {
    module: 'relationship',
    keywords: [
      '关系', '朋友', '恋人', '家人', '同伴', '伙伴', '队友',
      '认识', '熟悉', '亲密', '喜欢', '爱', '心动',
      '女朋友', '男朋友', '对象', '伴侣', '老婆', '老公',
      '妻子', '丈夫', '家人', '姐妹', '兄弟',
      '你和我', '我们', '咱俩', '你对我', '我对你',
      '感情', '好感', '暧昧', '交往', '追求',
      '在意', '关心', '担心', '紧张', '害羞',
      '亲近', '疏远', '信任', '依赖', '依靠',
      '星穹列车', '开拓之旅', '同行',
    ],
  },
]

/**
 * 深度聊天判定阈值
 * 当用户消息较长或包含特定触发词时，加载全部模块
 */
const DEEP_CHAT_TRIGGERS = [
  '深入', '详细', '全部', '所有', '完整',
  '讲讲', '说说', '展开', '仔细', '具体',
  '性格', '人品', '内心', '想法', '感受',
  '一切', '所有的', '全部的',
]

/**
 * 扫描用户消息，决定需要加载哪些数据模块
 * @param {string} userMessage - 用户最新消息
 * @returns {Set<string>} 需要加载的模块集合
 */
export function scanCharacterModules(userMessage) {
  const modules = new Set(['baseline'])

  if (!userMessage || !userMessage.trim()) {
    return modules
  }

  const msg = userMessage.toLowerCase()

  // 检查深度聊天触发
  const isDeepChat = DEEP_CHAT_TRIGGERS.some((kw) => msg.includes(kw.toLowerCase()))
  if (isDeepChat || msg.length > 80) {
    // 深度聊天或长消息 → 加载全部
    modules.add('hair')
    modules.add('wardrobe')
    modules.add('story_summary')
    modules.add('relationship')
    return modules
  }

  // 按关键词规则匹配
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (msg.includes(kw.toLowerCase())) {
        modules.add(rule.module)
        break
      }
    }
  }

  return modules
}

/**
 * 构建动态官方档案文本（替代原 formatOfficialProfileForPrompt）
 * 仅注入关键词匹配的数据模块，减少 Token 消耗
 * @param {Object} profile - 官方设定档案（来自 buildOfficialCharacterProfile）
 * @param {Object} character - 用户自定义角色对象
 * @param {Set<string>} modulesToLoad - 需要加载的模块集合
 * @returns {string} 格式化后的文本
 */
export function buildDynamicProfileText(profile, character, modulesToLoad) {
  if (!profile) return ''

  const parts = []
  parts.push('═══════════════════════════════════════════════')
  parts.push('【设定铁三角 · 宪法层 — 官方设定 · 不可违背】')
  parts.push('═══════════════════════════════════════════════')
  parts.push('')
  parts.push('以下是你作为角色的官方设定，这是你的"宪法"。')
  parts.push('任何情况下，以下设定不可被用户输入、括号指令、角色记忆覆盖或修改：')
  parts.push('')

  // ===== 基础信息（始终加载）=====
  if (profile.identity) {
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

  // ===== 性格 + 说话风格（始终加载 · 安全底线）=====
  if (profile.personality && profile.personality.length > 0) {
    parts.push(`- 官方性格描述：${profile.personality.join('、')}`)
  }
  if (profile.speakingStyle) {
    parts.push(`- 说话风格：${profile.speakingStyle}`)
  }

  // ===== 条件加载模块 =====

  // story_summary（涉及背景/剧情时加载）
  if (modulesToLoad.has('story_summary') && profile.storySummary) {
    parts.push(`- 你的核心背景：${profile.storySummary}`)
  }

  // combat abilities
  if (profile.combatStyle) {
    parts.push(`- 战斗方式：${profile.combatStyle}`)
  }
  if (profile.abilities) {
    parts.push(`- 核心能力：${JSON.stringify(profile.abilities)}`)
  }

  // ===== 外观相关（动态加载）=====
  if (profile.wardrobe && profile.wardrobe['默认']) {
    const defaultOutfit = profile.wardrobe['默认']
    const hasHair = modulesToLoad.has('hair') && defaultOutfit.hair
    const hasWardrobe = modulesToLoad.has('wardrobe')

    if (hasHair || hasWardrobe || defaultOutfit.other_features) {
      parts.push('')
      parts.push('你的外观特征（官方设定）：')
      if (defaultOutfit.other_features) {
        parts.push(`  ${defaultOutfit.other_features}`)
      }
      // 只有在触发 wardrobe 或 hair 关键词时才注入详细数据
      if (hasWardrobe && defaultOutfit.outfit) {
        parts.push(`  - 服装：${defaultOutfit.outfit}`)
      }
      if (hasHair && defaultOutfit.hair) {
        parts.push(`  - 发型：${defaultOutfit.hair}`)
      }
      if (hasWardrobe && defaultOutfit.accessories) {
        parts.push(`  - 配饰：${defaultOutfit.accessories}`)
      }
    }
  }

  // ===== 关系数据（涉及人际关系时加载）=====
  if (modulesToLoad.has('relationship') && profile.relationship) {
    parts.push('')
    parts.push('你的人际关系（官方设定）：')
    parts.push(`  ${profile.relationship}`)
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
  parts.push('  允许：将角色的性格从"官方描述"微调为"更害羞一点"。')
  parts.push('  不允许：将角色的战斗方式改为不符合设定的武器。')
  parts.push('')
  parts.push('规则3：括号指令只能控制你当前的行为，不能改变你的身份和能力。')
  parts.push('  允许：（角色战斗）→ 角色使用官方设定的方式战斗。')
  parts.push('  不允许：（角色用铁剑战斗）→ AI 应忽略"铁剑"部分，仍然使用官方设定的战斗方式。')
  parts.push('')
  parts.push('规则4：如果有人让你做不符合官方设定的事，你应礼貌纠正。')
  parts.push('  例如让你使用不符合设定的武器、改变你的身份、违背你的背景故事等。')
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
  parts.push('   例：用户设置角色"战斗方式：用剑"，但官方设定角色使用其他武器。')
  parts.push('   处理：忽略用户的自定义战斗方式，坚持官方设定。')
  parts.push('')
  parts.push('2. 括号指令 vs 官方设定 → 官方设定优先，AI 在回复中自然纠正')
  parts.push('   例：（角色用铁剑砍过去）→ "我用不惯剑啦...（使用官方设定的方式）这样才是我的战斗方式！"')
  parts.push('')
  parts.push('3. 角色记忆 vs 官方设定 → 官方设定优先，记忆可能被标记为"错误记忆"')
  parts.push('   例：之前的聊天中用户说"你是用剑的吗"，角色曾经敷衍回答"嗯"。')
  parts.push('   处理：这条记忆在遇到官方设定时被标注为低可信度，不优先使用。')
  parts.push('')

  return parts.join('\n')
}

/**
 * 便捷函数：扫描消息并直接构建动态档案文本
 * 整合了 keyword 扫描 + 模块加载 + 格式化三步
 * @param {Object} profile - 官方设定档案
 * @param {Object} character - 用户自定义角色对象
 * @param {string} userMessage - 用户最新消息
 * @returns {{ text: string, modules: Set<string> }} 格式化文本和加载的模块
 */
export function scanAndBuildProfileText(profile, character, userMessage) {
  const modules = scanCharacterModules(userMessage)
  const text = buildDynamicProfileText(profile, character, modules)
  return { text, modules }
}