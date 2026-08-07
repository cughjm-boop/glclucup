/**
 * InteractionMatrix — 角色互动矩阵 (Multi Character Engine V4)
 *
 * 为每对角色维护互动规则：
 *  - 流萤↔三月七：友好，互动较多
 *  - 银狼↔卡芙卡：伙伴，偏任务导向
 *  - 刃↔卡芙卡：简短交流，少闲聊
 *  - 花火↔其他角色：喜欢调侃，制造戏剧效果
 *
 * 调度器参考矩阵决定互动频率和语气。
 */

export type InteractionTone = 'friendly' | 'task' | 'brief' | 'tease' | 'warm' | 'cold' | 'rival' | 'mentor'

export interface InteractionRule {
  a: string
  b: string
  tone: InteractionTone
  /** 互动频率权重 0-100（越高越容易互动） */
  frequency: number
  /** 语气描述（供 Prompt 注入） */
  description: string
  /** 是否倾向于主动发起对话 */
  initiativeBias: 'high' | 'normal' | 'low'
}

/** 预定义互动规则表 */
const RULES: InteractionRule[] = [
  { a: '流萤', b: '三月七', tone: 'friendly', frequency: 85, description: '关系友好，互动频繁，常一起逛街、吐槽', initiativeBias: 'high' },
  { a: '流萤', b: '银狼', tone: 'task', frequency: 60, description: '偏任务导向，技术协作，私下有微妙默契', initiativeBias: 'normal' },
  { a: '流萤', b: '卡芙卡', tone: 'brief', frequency: 40, description: '简短交流，卡芙卡偶尔关心，流萤保持距离', initiativeBias: 'low' },
  { a: '流萤', b: '刃', tone: 'warm', frequency: 55, description: '流萤对刃有好感，互动温柔', initiativeBias: 'high' },
  { a: '流萤', b: '知更鸟', tone: 'friendly', frequency: 70, description: '同为年轻女孩，分享日常音乐', initiativeBias: 'normal' },
  { a: '流萤', b: '花火', tone: 'tease', frequency: 50, description: '花火常调侃流萤，流萤无奈但不讨厌', initiativeBias: 'normal' },
  { a: '银狼', b: '卡芙卡', tone: 'task', frequency: 80, description: '伙伴关系，高效完成任务，信任彼此', initiativeBias: 'normal' },
  { a: '银狼', b: '刃', tone: 'cold', frequency: 30, description: '交流较少，各司其职', initiativeBias: 'low' },
  { a: '银狼', b: '三月七', tone: 'friendly', frequency: 65, description: '三月七常找银狼帮忙修东西', initiativeBias: 'normal' },
  { a: '银狼', b: '花火', tone: 'tease', frequency: 55, description: '花火的炸弹常让银狼崩溃', initiativeBias: 'normal' },
  { a: '卡芙卡', b: '刃', tone: 'brief', frequency: 35, description: '简短交流，少闲聊，有共同过去', initiativeBias: 'low' },
  { a: '卡芙卡', b: '知更鸟', tone: 'friendly', frequency: 60, description: '欣赏知更鸟的歌声', initiativeBias: 'normal' },
  { a: '卡芙卡', b: '花火', tone: 'friendly', frequency: 65, description: '宠溺花火，偶尔一起恶作剧', initiativeBias: 'normal' },
  { a: '刃', b: '三月七', tone: 'friendly', frequency: 55, description: '三月七经常拉着刃拍照', initiativeBias: 'normal' },
  { a: '刃', b: '知更鸟', tone: 'friendly', frequency: 60, description: '一起训练过，关系不错', initiativeBias: 'normal' },
  { a: '知更鸟', b: '三月七', tone: 'friendly', frequency: 80, description: '闺蜜关系，无话不谈', initiativeBias: 'high' },
  { a: '知更鸟', b: '花火', tone: 'friendly', frequency: 70, description: '同是活泼女孩，互动频繁', initiativeBias: 'high' },
  { a: '花火', b: '三月七', tone: 'tease', frequency: 75, description: '互相调侃，制造戏剧效果', initiativeBias: 'high' },
  { a: '花火', b: '刃', tone: 'tease', frequency: 60, description: '经常恶作剧整蛊刃', initiativeBias: 'high' },
  { a: '布洛妮娅', b: '希儿', tone: 'warm', frequency: 90, description: '姐妹关系，亲密无间', initiativeBias: 'high' },
  { a: '杰帕德', b: '布洛妮娅', tone: 'friendly', frequency: 80, description: '青梅竹马，战友关系', initiativeBias: 'normal' },
  { a: '景元', b: '刃', tone: 'rival', frequency: 70, description: '宿敌关系，亦敌亦友', initiativeBias: 'normal' },
  { a: '镜流', b: '刃', tone: 'mentor', frequency: 85, description: '师徒关系，镜流教过刃剑术', initiativeBias: 'normal' },
  { a: '丹恒', b: '三月七', tone: 'friendly', frequency: 70, description: '经常被三月七拉着拍照', initiativeBias: 'low' },
  { a: '白露', b: '娜塔莎', tone: 'friendly', frequency: 75, description: '医疗组成员，关系融洽', initiativeBias: 'normal' },
  { a: '黑塔', b: '艾丝妲', tone: 'task', frequency: 85, description: '研究搭档，高效率协作', initiativeBias: 'normal' },
  { a: '符玄', b: '景元', tone: 'task', frequency: 75, description: '上下级，符玄协助景元', initiativeBias: 'normal' },
]

/** 查询互动规则（双向） */
export function getInteractionRule(nameA: string, nameB: string): InteractionRule | null {
  if (nameA === nameB) return null
  const direct = RULES.find((r) => r.a === nameA && r.b === nameB)
  if (direct) return direct
  const reverse = RULES.find((r) => r.a === nameB && r.b === nameA)
  if (reverse) {
    return { ...reverse, a: nameA, b: nameB }
  }
  // 默认规则
  return {
    a: nameA, b: nameB,
    tone: 'friendly',
    frequency: 50,
    description: '一般性认识，按官方设定互动',
    initiativeBias: 'normal',
  }
}

/** 查找与某角色有高频互动的其他角色 */
export function getFrequentInterlocutors(characterName: string, minFrequency = 60): Array<{ other: string; rule: InteractionRule }> {
  const result: Array<{ other: string; rule: InteractionRule }> = []
  for (const r of RULES) {
    if (r.a === characterName && r.frequency >= minFrequency) {
      result.push({ other: r.b, rule: r })
    } else if (r.b === characterName && r.frequency >= minFrequency) {
      result.push({ other: r.a, rule: { ...r, a: characterName, b: r.a } })
    }
  }
  return result
}

/** 生成某角色与所有其他在场角色的互动摘要（供 Prompt 注入） */
export function buildInteractionSummary(characterName: string, otherNames: string[]): string {
  if (!otherNames.length) return ''
  const lines: string[] = []
  for (const other of otherNames) {
    const rule = getInteractionRule(characterName, other)
    if (rule) {
      lines.push(`- 与${other}：${rule.description}（互动频率${rule.frequency}）`)
    }
  }
  return lines.join('\n')
}

/** 根据互动频率判断是否应该在本轮插话 */
export function shouldInterrupt(baseChance: number, frequency: number, initiativeBias: InteractionRule['initiativeBias']): boolean {
  const biasMultiplier = initiativeBias === 'high' ? 1.5 : initiativeBias === 'low' ? 0.5 : 1
  const adjustedChance = baseChance * (frequency / 100) * biasMultiplier
  return Math.random() < adjustedChance
}

/** 获取全部规则（供开发者工具展示） */
export function getAllInteractionRules(): InteractionRule[] {
  return [...RULES]
}
