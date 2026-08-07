/**
 * CharacterStateUpdater — 从用户消息推导 CharacterStateEngine V2 的五维命令。
 *
 * 设计原则：
 * 1) 所有推导结果都必须落在白名单（EMOTION/ACTION/POSE/EXPRESSION/INTERACTION TABLE）
 *    里，绝不能把对话文本原样透传写入 CharacterStateManager，避免污染顶部 UI。
 * 2) 所有候选文本都先用 cleanCandidate() 去掉语气词/对话尾巴/标点。
 * 3) 识别不到白名单词时返回空数组，不触发任何更新。
 *
 * 用户消息的典型更新：
 *   - "你真可爱～"        → applyEvent('praise')     : happy(2) + 被你夸奖 + 害羞脸红
 *   - "我喜欢你"          → applyEvent('confession') : 脸红(3) + 低头 + 害羞脸红
 *   - "别难过了"          → applyEvent('comfort')    : 安心(2) + 被你安慰 + 温柔笑
 *   - "抱抱"              → applyEvent('intimacy')   : 依恋(2) + 拥抱 + 依偎着你 + 宠溺
 *   - "我们去散步吧"      → action=strolling + pose=gently_near
 *   - "为什么…？"         → emotion=thinking + interaction=listening_to_you
 */

import {
  getCharacterStateManager,
  CharacterStateCommand,
  matchEmotionKeyword,
  boostLevel,
  CharacterLifeEvent,
  EmotionLevel,
} from './CharacterStateManager'

// ============================================================
// 文本净化（循环去括号 + 去尾部语气词 + 去标点）
// ============================================================

const TAIL_STRIP = [
  '吧', '呀', '啦', '呢', '吗', '嘛', '哦', '啊', '呗', '嗯', '哎',
  '哟', '哇', '哈', '哈哈', '呢', '咩',
  '！', '。', '？', '，', '～', '~', '、', '…', '...',
  '!', '?', '.', ',', ';', '；', '：', ':', '"', "'", '”', '“',
]

function cleanCandidate(raw: string): string {
  let s = (raw || '').trim()
  if (!s) return ''
  s = s.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim()
  for (let i = 0; i < 3; i++) {
    const before = s
    for (const tail of TAIL_STRIP) {
      if (s.endsWith(tail)) s = s.slice(0, -tail.length).trim()
    }
    if (s === before) break
  }
  return s.trim()
}

// ============================================================
// 动作触发词 → V2 动作 key
// ============================================================

const ACTION_TRIGGERS: Array<{ pattern: RegExp; actionKey: string; confidence: number }> = [
  // 移动
  { pattern: /(?:我们|一起|去|要|想)(?:去|来)?\s*(散步|走走|逛一逛|溜达)(?:吧|一下)?/, actionKey: 'strolling', confidence: 0.92 },
  { pattern: /走路|步行|走过去/, actionKey: 'walking', confidence: 0.88 },
  { pattern: /回头|回过?头|转身看/, actionKey: 'turning_back', confidence: 0.9 },
  { pattern: /挥手|招手|打招呼|挥挥?手/, actionKey: 'waving', confidence: 0.9 },
  { pattern: /点头|嗯嗯|颔首|嗯了一声/, actionKey: 'nodding', confidence: 0.9 },
  { pattern: /摇头|不要|不行|摇头说/, actionKey: 'shaking_head', confidence: 0.9 },
  { pattern: /伸懒腰|打哈欠|舒展身体/, actionKey: 'stretching', confidence: 0.92 },
  { pattern: /(靠着墙|靠墙站)/, actionKey: 'leaning_wall', confidence: 0.9 },

  // 活动
  { pattern: /看书|读书|看本书|读本书|翻书|阅读/, actionKey: 'reading', confidence: 0.9 },
  { pattern: /看手机|刷手机|玩手机|看消息/, actionKey: 'using_phone', confidence: 0.92 },
  { pattern: /喝水|喝口水|喝点水/, actionKey: 'drinking_water', confidence: 0.9 },
  { pattern: /喝茶|品茶|泡杯茶/, actionKey: 'drinking_tea', confidence: 0.9 },
  { pattern: /吃饭|吃东西|用餐|来吃点|吃点东西|吃饭吧/, actionKey: 'eating', confidence: 0.9 },
  { pattern: /做饭|炒菜|下厨|做菜|煮点东西|烧菜/, actionKey: 'cooking', confidence: 0.92 },
  { pattern: /整理房间|收拾房间|打扫卫生|整理一下/, actionKey: 'cleaning_room', confidence: 0.9 },
  { pattern: /望向窗外|看窗外|看外面|望着窗外/, actionKey: 'looking_out_window', confidence: 0.92 },
  { pattern: /发呆|放空|走神|发愣/, actionKey: 'spacing_out', confidence: 0.9 },
  { pattern: /思考|想想|琢磨|考虑/, actionKey: 'thinking', confidence: 0.85 },
  { pattern: /歇会|歇一歇|休息一下|歇着|休息会/, actionKey: 'resting', confidence: 0.9 },
  { pattern: /(?:我们|我要|想|一起)?\s*(睡觉|睡吧|困了|睡了|入睡|去睡)/, actionKey: 'sleeping', confidence: 0.92 },
  { pattern: /刚醒|刚起床|才醒|刚起来|睡醒/, actionKey: 'just_woke', confidence: 0.95 },
  { pattern: /轻声|小声|低声|轻轻说/, actionKey: 'speaking_softly', confidence: 0.85 },

  // 互动动作
  { pattern: /靠近我|靠近你|挪过来|凑过来/, actionKey: 'moving_closer', confidence: 0.9 },
  { pattern: /后退|退后一步|闪开|躲开/, actionKey: 'stepping_back', confidence: 0.9 },
  { pattern: /(?:牵|拉着|握着|拉)(?:你的|我的|小)?(?:手|手手|小手)/, actionKey: 'holding_hands', confidence: 0.95 },
  { pattern: /(?:抱|拥抱|抱一下|抱抱|搂|搂住)/, actionKey: 'hugging', confidence: 0.95 },
  { pattern: /(?:摸|抚摸|捋|揉|拨弄)(?:头发|秀发|头)/, actionKey: 'stroking_hair', confidence: 0.92 },
  { pattern: /轻笑|抿嘴笑|噗嗤|扑哧|忍不住笑/, actionKey: 'chuckling', confidence: 0.92 },
  { pattern: /叹气|叹了口气|叹口气|唉/, actionKey: 'sighing', confidence: 0.9 },
  { pattern: /躲闪|不敢看|别开脸|移开视线/, actionKey: 'avoiding_eyes', confidence: 0.92 },
  { pattern: /摆弄衣角|扯衣角|绞衣角|捏着衣角/, actionKey: 'fidgeting_clothes', confidence: 0.95 },
]

// ============================================================
// 姿态触发词 → Pose key
// ============================================================

const POSE_TRIGGERS: Array<{ pattern: RegExp; poseKey: string; confidence: number }> = [
  { pattern: /坐在沙发上|靠在沙发|坐在沙发/, poseKey: 'on_sofa', confidence: 0.9 },
  { pattern: /坐在床边|坐床上|坐到床边/, poseKey: 'on_bedside', confidence: 0.9 },
  { pattern: /(站|站立|站着|站起身)/, poseKey: 'standing', confidence: 0.82 },
  { pattern: /斜靠着|斜靠在|靠着椅背|靠着/, poseKey: 'leaning', confidence: 0.88 },
  { pattern: /俯身|弯下腰|凑上前|探身/, poseKey: 'bending_forward', confidence: 0.9 },
  { pattern: /侧身|侧过身|侧坐|歪着身/, poseKey: 'sideways', confidence: 0.9 },
  { pattern: /双手背后|背着手|手放在背后/, poseKey: 'hands_behind', confidence: 0.95 },
  { pattern: /双手抱胸|抱臂|环胸|胳膊交叉/, poseKey: 'arms_crossed', confidence: 0.95 },
  { pattern: /单手扶脸|托着腮|手托脸|撑着下巴/, poseKey: 'hand_on_cheek', confidence: 0.95 },
  { pattern: /双手放在膝上|放在膝盖上|放在腿上/, poseKey: 'hands_on_knees', confidence: 0.95 },
  { pattern: /轻轻靠近|凑近|靠过来/, poseKey: 'gently_near', confidence: 0.9 },
  { pattern: /(低头|低下头|垂着头|垂着眼)/, poseKey: 'head_down', confidence: 0.92 },
  { pattern: /(抬头|抬起头|仰头)/, poseKey: 'head_up', confidence: 0.92 },
  { pattern: /踮脚|踮起脚|踮起脚尖/, poseKey: 'on_tiptoes', confidence: 0.95 },
  { pattern: /缩在角落|蜷在角落|躲在角落/, poseKey: 'huddled_corner', confidence: 0.95 },
  { pattern: /慵懒地躺|懒懒躺|瘫在(?:床上|沙发)?/, poseKey: 'lying_lazy', confidence: 0.9 },
]

// ============================================================
// 表情触发词 → Expression key
// ============================================================

const EXPRESSION_TRIGGERS: Array<{ pattern: RegExp; exprKey: string; confidence: number }> = [
  { pattern: /(^|[\s，。！？])(微笑|微微一笑|勾了勾唇)(?=[\s，。！？]|$)/, exprKey: 'smile', confidence: 0.88 },
  { pattern: /(哈哈|笑死|大笑|笑出声|笑了$|笑你)/, exprKey: 'laugh', confidence: 0.85 },
  { pattern: /偷笑|窃笑|偷偷笑/, exprKey: 'giggle', confidence: 0.9 },
  { pattern: /浅笑|淡淡的笑/ , exprKey: 'soft_smile', confidence: 0.9 },
  { pattern: /温柔笑|温柔地笑|温柔的笑/, exprKey: 'gentle_smile', confidence: 0.92 },
  { pattern: /(脸|耳根|脸颊).{0,6}(红|发烫|泛红)|脸红|红着脸/, exprKey: 'blush', confidence: 0.92 },
  { pattern: /认真(地|的|起来)?(看|听|说|回答|想|表情)?/, exprKey: 'serious', confidence: 0.8 },
  { pattern: /惊讶|吃惊|睁大了?眼|瞪大了眼/, exprKey: 'shocked', confidence: 0.9 },
  { pattern: /困惑|疑惑|不解|迷茫/, exprKey: 'puzzled', confidence: 0.9 },
  { pattern: /眯眼|眯起眼|眯着/, exprKey: 'squinting', confidence: 0.9 },
  { pattern: /眨眼|眨眨眼|wink|使个眼色/, exprKey: 'winking', confidence: 0.9 },
  { pattern: /沉默|不说话|没出声/ , exprKey: 'silent', confidence: 0.85 },
  { pattern: /皱眉|皱起眉|蹙着眉/, exprKey: 'frowning', confidence: 0.92 },
  { pattern: /若有所思|出神|陷入沉思/, exprKey: 'contemplative', confidence: 0.92 },
  { pattern: /(失落|丧气|沮丧|无精打采)的?(表|神|样)?/, exprKey: 'dejected', confidence: 0.88 },
  { pattern: /无奈|苦笑|摊手/, exprKey: 'helpless', confidence: 0.88 },
  { pattern: /宠溺的(笑|眼神)|宠着/, exprKey: 'fond', confidence: 0.92 },
  { pattern: /撒娇|撒个娇|娇嗔/, exprKey: 'coquettish', confidence: 0.95 },
  { pattern: /(认真|专注|凝视|凝望|注视)(地|着)?(看着你|看着我|望向你|盯着)/, exprKey: 'staring', confidence: 0.88 },
]

// ============================================================
// 互动触发词 → Interaction key
// ============================================================

const INTERACTION_TRIGGERS: Array<{ pattern: RegExp; key: string; confidence: number }> = [
  { pattern: /你好|嗨|hello|在吗|在不在|哈喽|早/, key: 'chatting', confidence: 0.8 },
  { pattern: /为什么|怎么|怎么回事|怎么办|什么意思|到底|如何|咋样|怎样/, key: 'listening_to_you', confidence: 0.9 },
  { pattern: /抱抱|抱一下|求抱|搂住|抱着/, key: 'hugging_you', confidence: 0.95 },
  { pattern: /(?:牵|拉|握|拉着)(?:你的|我的|小)?(?:手|手手|小手)|手拉手/, key: 'holding_your_hand', confidence: 0.95 },
  { pattern: /安慰|别难过|不哭|别怕|我在|摸摸头|拍肩/, key: 'being_comforted', confidence: 0.9 },
  { pattern: /听我(说|讲|一下)?|你先听|听我说完/, key: 'listening_to_you', confidence: 0.92 },
  { pattern: /陪着我|陪我|陪着|你陪我/, key: 'accompanying', confidence: 0.9 },
  { pattern: /依偎|靠在你|靠过来|依偎着你|靠着你/, key: 'snuggling_you', confidence: 0.92 },
  { pattern: /轻轻靠着|靠在肩上|靠在你身上/, key: 'leaning_on_you', confidence: 0.9 },
  { pattern: /看着我|看着你|盯着你|凝视我|望着我|注视/, key: 'looking_at_you', confidence: 0.85 },
  { pattern: /(?:真|太|好|超|非常|特别).(?:可爱|厉害|漂亮|美|乖|棒|聪明|懂事|甜)|(?:夸|夸夸|夸奖).{0,3}你/, key: 'being_praised', confidence: 0.92 },
  { pattern: /逗我|逗你|被逗笑|笑死我了|笑到/, key: 'being_teased', confidence: 0.9 },
  { pattern: /吃醋|酸了|嫉妒|你和别的|你们俩/, key: 'jealous', confidence: 0.9 },
  { pattern: /(?:我)?(?:想你|好想你|想死你了|思念你)/, key: 'missing_you', confidence: 0.92 },
  { pattern: /(担心|牵挂|关心).{0,4}(你|我|身体|情况)|怕你/, key: 'worrying_about_you', confidence: 0.88 },
  { pattern: /守着你|等你回来|我等你|等你回家/, key: 'guarding_you', confidence: 0.9 },
  { pattern: /约会|约我|我们去约会|一起吃饭|看电影|去玩吧/, key: 'on_date', confidence: 0.9 },
  { pattern: /(看风景|一起看海|看日落|看日出|看星星|看晚霞|看夜景)/, key: 'enjoying_view', confidence: 0.92 },
  { pattern: /一起休息|一起躺|一起睡(个)?午觉/, key: 'resting_together', confidence: 0.92 },
  { pattern: /你说|你觉得|你认为|你的想法|换你|该你了/, key: 'chatting', confidence: 0.75 },
]

// ============================================================
// 生活事件识别：把用户意图更高阶地归类到 CharacterLifeEvent，
// 由 CharacterStateManager.applyEvent 统一输出五维组合。
// 事件优先级 > 单项 trigger，因为它会给出"生活感"的完整组合。
// ============================================================

const LIFE_EVENT_TRIGGERS: Array<{ pattern: RegExp; event: CharacterLifeEvent; confidence: number }> = [
  { // 夸奖（真+形容词 或 直接夸你）
    pattern: /(?:真|太|好|超|非常|特别|最|最最).(?:可爱|厉害|漂亮|美|乖|棒|聪明|懂事|甜|温柔|好看|有趣|贤惠)|(?:夸|夸夸|夸奖|赞扬|表扬).{0,3}(?:你|她)/,
    event: 'praise', confidence: 0.92 },
  { // 告白
    pattern: /我(?:喜欢|爱|中意|心悦|暗恋|心仪)(?:你|上你)?|(?:做|当)我(?:的|个)?(?:女朋友|老婆|对象|娘子)|嫁给我|你愿意(?:和我|跟我)(?:在一|交|做男)?/,
    event: 'confession', confidence: 0.95 },
  { // 安慰
    pattern: /别(?:难过|伤心|哭|怕|担心|焦虑|慌)|我在(?:这|身边)?|(?:抱抱|摸摸头|拍拍|拍肩|安慰).{0,3}(?:你|她|没事)|没事的|会好的|会过去的/,
    event: 'comfort', confidence: 0.92 },
  { // 亲密互动（含直接肢体词）
    pattern: /(?:抱|搂|亲|吻|牵|靠|依偎|贴|蹭|钻你怀里|拥|抱在怀里|壁咚|摸头|揉头|rua){1,2}|陪我(?:躺|睡|坐)|抱着我|搂住我/,
    event: 'intimacy', confidence: 0.9 },
  { // 在家邀请 / 家里
    pattern: /(?:在|回|到|来|去)(?:我|你|我们)?(?:的|个)?家里|在家[做里看吃]|回家(?:吧|啦|去)?/,
    event: 'at_home', confidence: 0.82 },
  { // 出游
    pattern: /(?:去|来|我们|一起)(?:郊游|旅行|出去玩|出游|踏青|爬山|露营|野餐|逛公园|去海边|去沙滩|看风景|散步去|外面玩)/,
    event: 'outing', confidence: 0.85 },
]

export class CharacterStateUpdater {
  private characterId: string

  constructor(characterId: string) {
    this.characterId = characterId
  }

  /**
   * 从用户消息解析 CharacterStateCommand（仅返回白名单命中的结果）
   */
  parseUserMessage(content: string): CharacterStateCommand[] {
    const cleaned = cleanCandidate(content)
    if (!cleaned) return []
    const commands: CharacterStateCommand[] = []

    // 0) 最高优先级：识别生活事件 → 交给 applyEvent 输出五维组合（不在这里展开）
    // 返回时在 applyUserMessage 里统一处理
    let matchedEvent: CharacterLifeEvent | null = null
    let matchedEventConfidence = 0
    for (const ev of LIFE_EVENT_TRIGGERS) {
      if (ev.pattern.test(cleaned)) {
        if (ev.confidence > matchedEventConfidence) {
          matchedEvent = ev.event
          matchedEventConfidence = ev.confidence
        }
      }
    }
    if (matchedEvent) {
      // 用一个 "event" 的伪命令占位，由 applyUserMessage 触发 applyEvent。
      // 我们也顺带把这个作为 source 供 applyCommands 排序参考。
      commands.push({
        type: 'emotion', value: '__EVENT__' + matchedEvent,
        source: 'event', confidence: matchedEventConfidence,
      })
      // 为了避免单项 trigger 覆盖事件里更协调的五维组合，只返回事件信号
      return commands
    }

    // 1) Emotion：matchEmotionKeyword 强度识别
    const emoHit = matchEmotionKeyword(cleaned)
    if (emoHit) {
      // 当用户说"我难过/委屈/哭" → AI = worried 或 gentle；否则跟用户一致（或 AI 被感染）
      let finalKey = emoHit.key as unknown as string
      const isNegativeUser = /难过|伤心|悲伤|失落|哭|委屈|沮丧|焦虑|不安|痛苦|累|疲惫/.test(cleaned)
      if (isNegativeUser) {
        finalKey = /安慰|没事|别怕|别哭|我在|拍肩|摸摸/.test(cleaned) ? 'relieved' : 'worried'
        // 对 worry 再映射到 V2：worried 不在新表里，就用 closest 的 gentle/worrying_about_you
        if (finalKey === 'worried') finalKey = 'gentle'
      }
      commands.push({ type: 'emotion', value: finalKey, source: 'user', confidence: 0.85 })
      if (emoHit.levelBoost > 0) {
        const baseLevel: EmotionLevel = 1
        commands.push({
          type: 'emotionLevel',
          value: boostLevel(baseLevel, emoHit.levelBoost),
          source: 'user',
          confidence: 0.8,
        })
      }
    }

    // 2) Action：匹配一项
    for (const t of ACTION_TRIGGERS) {
      if (t.pattern.test(cleaned)) {
        commands.push({ type: 'action', value: t.actionKey, source: 'user', confidence: t.confidence })
        break
      }
    }

    // 3) Pose：匹配一项
    for (const p of POSE_TRIGGERS) {
      if (p.pattern.test(cleaned)) {
        commands.push({ type: 'pose', value: p.poseKey, source: 'user', confidence: p.confidence })
        break
      }
    }

    // 4) Expression：匹配一项
    for (const ex of EXPRESSION_TRIGGERS) {
      if (ex.pattern.test(cleaned)) {
        commands.push({ type: 'expression', value: ex.exprKey, source: 'user', confidence: ex.confidence })
        break
      }
    }

    // 5) Interaction：匹配一项
    for (const it of INTERACTION_TRIGGERS) {
      if (it.pattern.test(cleaned)) {
        commands.push({ type: 'interaction', value: it.key, source: 'user', confidence: it.confidence })
        break
      }
    }

    // 6) 兜底：疑问句 → 听你说话 / 闲聊 → 正在聊天
    if (commands.length === 0) {
      if (/[?？]/.test(content)) {
        commands.push({ type: 'interaction', value: 'listening_to_you', source: 'user', confidence: 0.7 })
      } else {
        commands.push({ type: 'interaction', value: 'chatting', source: 'user', confidence: 0.6 })
      }
    }

    return commands
  }

  /**
   * 解析并应用（含生活事件），返回是否发生实际变动
   */
  applyUserMessage(content: string): boolean {
    const commands = this.parseUserMessage(content)
    if (commands.length === 0) return false
    const manager = getCharacterStateManager(this.characterId)

    // 生活事件优先：parseUserMessage 返回 __EVENT__xxx 占位时，走 applyEvent 路径
    const eventCmd = commands.find((c) => c.type === 'emotion' && typeof c.value === 'string' && c.value.startsWith('__EVENT__'))
    if (eventCmd) {
      const ev = (eventCmd.value as string).slice('__EVENT__'.length) as CharacterLifeEvent
      return manager.applyEvent(ev)
    }

    return manager.applyCommands(commands)
  }

  // ================== AI 发送链路的互动切换 API ==================

  notifyAiThinking(): void {
    const manager = getCharacterStateManager(this.characterId)
    manager.applyCommands([
      { type: 'emotion', value: 'thinking', source: 'ai', confidence: 0.9 },
      { type: 'expression', value: 'contemplative', source: 'ai', confidence: 0.85 },
      { type: 'interaction', value: 'looking_at_you', source: 'ai', confidence: 0.9 },
    ])
  }

  notifyAiReplied(): void {
    const manager = getCharacterStateManager(this.characterId)
    manager.applyCommands([
      { type: 'interaction', value: 'chatting', source: 'ai', confidence: 0.85 },
    ])
  }

  notifyWaitingUser(): void {
    const manager = getCharacterStateManager(this.characterId)
    manager.applyCommands([
      { type: 'interaction', value: 'waiting', source: 'system', confidence: 0.9 },
    ])
  }
}

/** 每角色缓存 */
const updaterInstances: Map<string, CharacterStateUpdater> = new Map()

export function getCharacterStateUpdater(characterId: string): CharacterStateUpdater {
  let inst = updaterInstances.get(characterId)
  if (!inst) {
    inst = new CharacterStateUpdater(characterId)
    updaterInstances.set(characterId, inst)
  }
  return inst
}
