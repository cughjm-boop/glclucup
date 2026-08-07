/**
 * CharacterStateManager — 角色实时状态管理器（Character State Engine V2）
 *
 * 角色状态五维度：
 *   1. Emotion（心情 + 强度）：开心、温柔、害羞、平静、放松、兴奋、思考中、困倦、
 *      紧张、难过、生气、失落、惊讶、迷惑、委屈、期待、依恋、安心、忍俊不禁、脸红
 *      每个心情可带 emotionLevel（0~3，0 轻微 / 1 普通 / 2 强烈 / 3 极致）
 *   2. Action（动作）：36 种（坐着、站着、靠着墙、走路、散步、回头、挥手、点头、
 *      摇头、伸懒腰、看书、看手机、喝水、喝茶、吃东西、做饭、整理房间、望向窗外、
 *      发呆、思考、休息、睡觉、刚醒来、轻声说话、靠近你、后退半步、牵手、拥抱、
 *      抚摸头发、轻笑、叹气、躲闪视线、摆弄衣角 等）
 *   3. Pose（姿态）：16 种（坐在沙发上、坐在床边、站立、斜靠着、俯身、侧身、
 *      双手背后、双手抱胸、单手扶脸、双手放在膝上、轻轻靠近、低头、抬头、
 *      微微踮脚、缩在角落、慵懒地躺着）
 *   4. Expression（表情）：20 种（微笑、笑、偷笑、浅笑、温柔笑、害羞脸红、
 *      认真、惊讶、困惑、眯眼、眨眼、沉默、皱眉、若有所思、失落、无奈、
 *      宠溺、撒娇、认真注视 等）
 *   5. Interaction（互动状态）：19 种（正在聊天、等待回复、看着你、陪着你、
 *      依偎着你、牵着你的手、拥抱你、轻轻靠着你、听你说话、被你夸奖、
 *      被你安慰、被你逗笑、吃醋中、想你、担心你、守着你、约会中、
 *      一起看风景、一起休息）
 *
 * 单一数据源：整个软件里所有需要角色状态（心情/动作/姿态/表情/互动）的地方都应该
 * 从 CharacterStateManager 读取（或通过 useCharacterStateRuntime hook 订阅）。
 * 禁止顶部 UI / Prompt / 多人聊天 / 记忆 各自维护独立状态。
 *
 * 状态触发：
 *   - 用户消息（CharacterStateUpdater 解析：夸奖/告白/安慰/亲密/日常互动）
 *   - 场景变化（SceneManager.subscribe 联动：沙发→坐在沙发上，沙滩→一起看风景）
 *   - 时间变化（时段切换：深夜→困倦/休息，早上→刚醒来/平静）
 *   - 系统事件 API：applyEvent('praise' | 'confession' | 'comfort' | 'neglect' | 'intimacy'
 *                         | 'at_home' | 'outing' | 'morning' | 'late_night')
 */

import { getSceneManager } from '../scene/SceneManager'

// ============================================================
// 一、Emotion（心情）白名单 + Emoji 映射（20 种）
// ============================================================

export type EmotionKey =
  | 'happy' | 'gentle' | 'shy' | 'calm' | 'relaxed' | 'excited'
  | 'thinking' | 'sleepy' | 'nervous' | 'sad' | 'angry' | 'disappointed'
  | 'surprised' | 'confused' | 'grievance' | 'expectant' | 'attached'
  | 'relieved' | 'amused' | 'blushing'

export const EMOTION_TABLE: Record<EmotionKey, { name: string; emoji: string }> = {
  happy:        { name: '开心',       emoji: '😊' },
  gentle:       { name: '温柔',       emoji: '🥺' },
  shy:          { name: '害羞',       emoji: '😳' },
  calm:         { name: '平静',       emoji: '😌' },
  relaxed:      { name: '放松',       emoji: '🛋️' },
  excited:      { name: '兴奋',       emoji: '🤩' },
  thinking:     { name: '思考中',     emoji: '🤔' },
  sleepy:       { name: '困倦',       emoji: '🥱' },
  nervous:      { name: '紧张',       emoji: '😰' },
  sad:          { name: '难过',       emoji: '😢' },
  angry:        { name: '生气',       emoji: '😠' },
  disappointed: { name: '失落',       emoji: '😞' },
  surprised:    { name: '惊讶',       emoji: '😲' },
  confused:     { name: '迷惑',       emoji: '😕' },
  grievance:    { name: '委屈',       emoji: '🥺' },
  expectant:    { name: '期待',       emoji: '✨' },
  attached:     { name: '依恋',       emoji: '🥰' },
  relieved:     { name: '安心',       emoji: '☺️' },
  amused:       { name: '忍俊不禁',   emoji: '😆' },
  blushing:     { name: '脸红',       emoji: '🌸' },
}

/** 心情强度 0~3：0轻微 1普通 2强烈 3极致 */
export type EmotionLevel = 0 | 1 | 2 | 3

const EMOTION_NAME_TO_KEY: Record<string, EmotionKey> = {}
for (const [key, val] of Object.entries(EMOTION_TABLE)) {
  EMOTION_NAME_TO_KEY[val.name] = key as EmotionKey
}

const EMOTION_SYNONYMS: Record<string, EmotionKey> = {
  // happy
  '开心': 'happy', '高兴': 'happy', '快乐': 'happy', '愉快': 'happy',
  '欢乐': 'happy', '幸福': 'happy', '好开心': 'happy', '愉悦': 'happy',
  // gentle
  '温柔': 'gentle', '柔和': 'gentle', '温柔地': 'gentle', '柔': 'gentle',
  // shy
  '害羞': 'shy', '不好意思': 'shy', '羞涩': 'shy', '羞怯': 'shy',
  // calm
  '平静': 'calm', '安静': 'calm', '淡定': 'calm', '冷静': 'calm', '安宁': 'calm',
  // relaxed
  '放松': 'relaxed', '悠闲': 'relaxed', '惬意': 'relaxed', '舒服': 'relaxed',
  '闲适': 'relaxed',
  // excited
  '兴奋': 'excited', '激动': 'excited', '超开心': 'excited', '狂喜': 'excited',
  '干劲满满': 'excited',
  // thinking
  '思考中': 'thinking', '思考': 'thinking', '想': 'thinking', '琢磨': 'thinking',
  '沉思': 'thinking', '思忖': 'thinking',
  // sleepy
  '困倦': 'sleepy', '困': 'sleepy', '好困': 'sleepy', '打哈欠': 'sleepy',
  '想睡觉': 'sleepy', '犯困': 'sleepy', '瞌睡': 'sleepy',
  // nervous
  '紧张': 'nervous', '焦虑': 'nervous', '不安': 'nervous', '心慌': 'nervous',
  '惴惴不安': 'nervous',
  // sad
  '难过': 'sad', '伤心': 'sad', '忧伤': 'sad', '悲伤': 'sad', '哀伤': 'sad',
  // angry
  '生气': 'angry', '恼火': 'angry', '愤怒': 'angry', '气': 'angry', '发怒': 'angry',
  // disappointed
  '失落': 'disappointed', '沮丧': 'disappointed', '失意': 'disappointed',
  '泄气': 'disappointed',
  // surprised
  '惊讶': 'surprised', '吃惊': 'surprised', '震惊': 'surprised', '吓': 'surprised',
  '咦': 'surprised',
  // confused
  '迷惑': 'confused', '疑惑': 'confused', '不解': 'confused', '懵': 'confused',
  '困惑': 'confused', '茫然': 'confused',
  // grievance
  '委屈': 'grievance', '受委屈': 'grievance', '冤枉': 'grievance',
  // expectant
  '期待': 'expectant', '期盼': 'expectant', '盼望': 'expectant', '等不及': 'expectant',
  // attached
  '依恋': 'attached', '眷恋': 'attached', '舍不得': 'attached', '粘人': 'attached',
  '依赖': 'attached',
  // relieved
  '安心': 'relieved', '放心': 'relieved', '宽心': 'relieved', '踏实': 'relieved',
  // amused
  '忍俊不禁': 'amused', '忍不住笑': 'amused', '噗嗤': 'amused', '想笑': 'amused',
  '好笑': 'amused',
  // blushing
  '脸红': 'blushing', '脸发烫': 'blushing', '耳根红': 'blushing', '红着脸': 'blushing',
}

// ============================================================
// 二、Action（动作）白名单（36 种）
// ============================================================

export type ActionKey =
  // 静止
  | 'sitting' | 'standing' | 'leaning_wall'
  // 移动
  | 'walking' | 'strolling' | 'turning_back' | 'waving'
  | 'nodding' | 'shaking_head' | 'stretching'
  // 活动
  | 'reading' | 'using_phone' | 'drinking_water' | 'drinking_tea'
  | 'eating' | 'cooking' | 'cleaning_room' | 'looking_out_window'
  | 'spacing_out' | 'thinking' | 'resting' | 'sleeping' | 'just_woke'
  // 互动
  | 'speaking_softly' | 'moving_closer' | 'stepping_back'
  | 'holding_hands' | 'hugging' | 'stroking_hair'
  | 'chuckling' | 'sighing' | 'avoiding_eyes' | 'fidgeting_clothes'

export const ACTION_TABLE: Record<ActionKey, { name: string }> = {
  sitting:          { name: '坐着' },
  standing:         { name: '站着' },
  leaning_wall:     { name: '靠着墙' },
  walking:          { name: '走路' },
  strolling:        { name: '散步' },
  turning_back:     { name: '回头' },
  waving:           { name: '挥手' },
  nodding:          { name: '点头' },
  shaking_head:     { name: '摇头' },
  stretching:       { name: '伸懒腰' },
  reading:          { name: '看书' },
  using_phone:      { name: '看手机' },
  drinking_water:   { name: '喝水' },
  drinking_tea:     { name: '喝茶' },
  eating:           { name: '吃东西' },
  cooking:          { name: '做饭' },
  cleaning_room:    { name: '整理房间' },
  looking_out_window:{ name: '望向窗外' },
  spacing_out:      { name: '发呆' },
  thinking:         { name: '思考' },
  resting:          { name: '休息' },
  sleeping:         { name: '睡觉' },
  just_woke:        { name: '刚醒来' },
  speaking_softly:  { name: '轻声说话' },
  moving_closer:    { name: '靠近你' },
  stepping_back:    { name: '后退半步' },
  holding_hands:    { name: '牵手' },
  hugging:          { name: '拥抱' },
  stroking_hair:    { name: '抚摸头发' },
  chuckling:        { name: '轻笑' },
  sighing:          { name: '叹气' },
  avoiding_eyes:    { name: '躲闪视线' },
  fidgeting_clothes:{ name: '摆弄衣角' },
}

const ACTION_NAME_TO_KEY: Record<string, ActionKey> = {}
for (const [key, val] of Object.entries(ACTION_TABLE)) {
  ACTION_NAME_TO_KEY[val.name] = key as ActionKey
}

// ============================================================
// 三、Pose（姿态）白名单（16 种）
// ============================================================

export type PoseKey =
  | 'on_sofa' | 'on_bedside' | 'standing'
  | 'leaning' | 'bending_forward' | 'sideways'
  | 'hands_behind' | 'arms_crossed' | 'hand_on_cheek'
  | 'hands_on_knees' | 'gently_near' | 'head_down'
  | 'head_up' | 'on_tiptoes' | 'huddled_corner' | 'lying_lazy'

export const POSE_TABLE: Record<PoseKey, { name: string }> = {
  on_sofa:         { name: '坐在沙发上' },
  on_bedside:      { name: '坐在床边' },
  standing:        { name: '站立' },
  leaning:         { name: '斜靠着' },
  bending_forward: { name: '俯身' },
  sideways:        { name: '侧身' },
  hands_behind:    { name: '双手背后' },
  arms_crossed:    { name: '双手抱胸' },
  hand_on_cheek:   { name: '单手扶脸' },
  hands_on_knees:  { name: '双手放在膝上' },
  gently_near:     { name: '轻轻靠近' },
  head_down:       { name: '低头' },
  head_up:         { name: '抬头' },
  on_tiptoes:      { name: '微微踮脚' },
  huddled_corner:  { name: '缩在角落' },
  lying_lazy:      { name: '慵懒地躺着' },
}

const POSE_NAME_TO_KEY: Record<string, PoseKey> = {}
for (const [key, val] of Object.entries(POSE_TABLE)) {
  POSE_NAME_TO_KEY[val.name] = key as PoseKey
}

// ============================================================
// 四、Expression（表情）白名单（20 种）
// ============================================================

export type ExpressionKey =
  | 'smile' | 'laugh' | 'giggle' | 'soft_smile' | 'gentle_smile'
  | 'blush' | 'serious' | 'shocked' | 'puzzled' | 'squinting'
  | 'winking' | 'silent' | 'frowning' | 'contemplative'
  | 'dejected' | 'helpless' | 'fond' | 'coquettish' | 'staring'
  | 'no_expression'

export const EXPRESSION_TABLE: Record<ExpressionKey, { name: string }> = {
  smile:        { name: '微笑' },
  laugh:        { name: '笑' },
  giggle:       { name: '偷笑' },
  soft_smile:   { name: '浅笑' },
  gentle_smile: { name: '温柔笑' },
  blush:        { name: '害羞脸红' },
  serious:      { name: '认真' },
  shocked:      { name: '惊讶' },
  puzzled:      { name: '困惑' },
  squinting:    { name: '眯眼' },
  winking:      { name: '眨眼' },
  silent:       { name: '沉默' },
  frowning:     { name: '皱眉' },
  contemplative:{ name: '若有所思' },
  dejected:     { name: '失落' },
  helpless:     { name: '无奈' },
  fond:         { name: '宠溺' },
  coquettish:   { name: '撒娇' },
  staring:      { name: '认真注视' },
  no_expression:{ name: '' },
}

const EXPRESSION_NAME_TO_KEY: Record<string, ExpressionKey> = {}
for (const [key, val] of Object.entries(EXPRESSION_TABLE)) {
  if (!val.name) continue
  EXPRESSION_NAME_TO_KEY[val.name] = key as ExpressionKey
}

// ============================================================
// 五、Interaction（互动状态）白名单（19 种）
// ============================================================

export type InteractionKey =
  | 'chatting' | 'waiting' | 'looking_at_you' | 'accompanying'
  | 'snuggling_you' | 'holding_your_hand' | 'hugging_you'
  | 'leaning_on_you' | 'listening_to_you' | 'being_praised'
  | 'being_comforted' | 'being_teased' | 'jealous' | 'missing_you'
  | 'worrying_about_you' | 'guarding_you' | 'on_date'
  | 'enjoying_view' | 'resting_together'

export const INTERACTION_TABLE: Record<InteractionKey, { name: string }> = {
  chatting:           { name: '正在聊天' },
  waiting:            { name: '等待回复' },
  looking_at_you:     { name: '看着你' },
  accompanying:       { name: '陪着你' },
  snuggling_you:      { name: '依偎着你' },
  holding_your_hand:  { name: '牵着你的手' },
  hugging_you:        { name: '拥抱你' },
  leaning_on_you:     { name: '轻轻靠着你' },
  listening_to_you:   { name: '听你说话' },
  being_praised:      { name: '被你夸奖' },
  being_comforted:    { name: '被你安慰' },
  being_teased:       { name: '被你逗笑' },
  jealous:            { name: '吃醋中' },
  missing_you:        { name: '想你' },
  worrying_about_you: { name: '担心你' },
  guarding_you:       { name: '守着你' },
  on_date:            { name: '约会中' },
  enjoying_view:      { name: '一起看风景' },
  resting_together:   { name: '一起休息' },
}

const INTERACTION_NAME_TO_KEY: Record<string, InteractionKey> = {}
for (const [key, val] of Object.entries(INTERACTION_TABLE)) {
  INTERACTION_NAME_TO_KEY[val.name] = key as InteractionKey
}

// ============================================================
// 六、命令与运行时类型
// ============================================================

export type CharacterStateCommandType =
  | 'emotion' | 'emotionLevel' | 'action' | 'pose'
  | 'expression' | 'interaction' | 'reset'

export interface CharacterStateCommand {
  type: CharacterStateCommandType
  value: string | number // emotion key / action key / ... 或中文 或 number(0-3) for level
  source?: 'user' | 'scene' | 'time' | 'system' | 'ai' | 'event'
  confidence?: number // 0~1，高置信度优先
}

/** 五维完整状态 */
export interface CharacterState {
  characterId: string
  emotion: EmotionKey
  emotionLevel: EmotionLevel
  action: ActionKey
  pose: PoseKey
  expression: ExpressionKey
  interaction: InteractionKey
  /** 上次更新时间戳，用于记忆和冷落检测 */
  lastUpdate: number
  /** 状态版本号，订阅者可以用它判断是否发生变化 */
  version: number
}

export type CharacterStateChangeListener = (state: CharacterState) => void

/** 生活事件（供 applyEvent 使用） */
export type CharacterLifeEvent =
  | 'praise'         // 用户夸她 → 开心 / 害羞 / 温柔
  | 'confession'     // 用户告白 → 害羞 / 依恋 / 脸红
  | 'comfort'        // 用户安慰她 → 安心 / 放松 / 微笑
  | 'neglect'        // 用户冷落她很久 → 失落 / 等待回复
  | 'intimacy'       // 亲密互动 → 依恋 / 拥抱 / 牵手
  | 'at_home'        // 在家场景 → 放松 / 坐着 / 看着你
  | 'outing'         // 在外出游 → 兴奋 / 散步 / 一起看风景
  | 'morning'        // 早晨 → 刚醒来 / 平静
  | 'late_night'     // 深夜 → 困倦 / 休息

// ============================================================
// 七、派生规则：场景 → 动作/姿态/表情/互动
// ============================================================

interface SceneStateLike {
  location?: string
  area?: string
  position?: string
  timePeriod?: string
  weather?: string
}

/** 场景 + 位置 → 姿态 */
export function derivePoseFromScene(scene: SceneStateLike, prev: PoseKey): PoseKey {
  const area = (scene.area || '').trim()
  const pos = (scene.position || '').trim()
  const posText = `${area} ${pos}`

  if (/沙发/.test(posText)) return 'on_sofa'
  if (/床|床边/.test(posText)) return 'on_bedside'
  if (/靠墙|墙/.test(posText)) return 'leaning'
  if (/角落/.test(posText)) return 'huddled_corner'
  if (/地上|地毯/.test(posText) && (/躺|卧/.test(posText))) return 'lying_lazy'
  if (/阳台|窗边|窗户/.test(posText)) return 'sideways'
  if (/书桌|桌前/.test(posText)) return 'hands_on_knees'
  if (/站立|站着/.test(posText)) return 'standing'
  return prev
}

/** 场景 → 动作 */
export function deriveActionFromScene(scene: SceneStateLike, prev: ActionKey): ActionKey {
  const loc = (scene.location || '').trim()
  const area = (scene.area || '').trim()
  const pos = (scene.position || '').trim()
  const posText = `${loc} ${area} ${pos}`

  if (/沙滩|海边|海滩/.test(loc))  return 'strolling'
  if (/卧室|床/.test(area) || /床上|躺着/.test(posText)) return 'resting'
  if (/客厅|沙发/.test(area) || /沙发/.test(posText)) return 'sitting'
  if (/书房|书桌|图书馆|教室/.test(area) || /书桌|桌前/.test(posText)) {
    return prev === 'reading' ? prev : 'thinking'
  }
  if (/厨房|餐厅/.test(area)) return 'cooking'
  if (/浴室|卫生间|洗手间|温泉/.test(area)) return 'resting'
  if (/逛街|街上|商场|超市|咖啡店/.test(loc)) return 'walking'
  if (/公园|森林|外面|郊外/.test(loc) || /散步/.test(posText)) return 'strolling'
  if (/办公室|公司|工位/.test(area)) return 'thinking'
  if (/游泳池|水里/.test(area)) return 'resting'
  if (/阳台|窗户/.test(area)) return 'looking_out_window'
  return prev
}

/** 场景 → 互动 */
export function deriveInteractionFromScene(scene: SceneStateLike, prev: InteractionKey): InteractionKey {
  const loc = (scene.location || '').trim()
  if (/沙滩|海边|海滩|山顶|公园|郊外|夜景/.test(loc)) return 'enjoying_view'
  return prev
}

/** 时间 → 心情/动作/强度 */
export interface SceneTimeDerive {
  emotion?: EmotionKey
  emotionLevel?: EmotionLevel
  action?: ActionKey
  pose?: PoseKey
  expression?: ExpressionKey
  interaction?: InteractionKey
}

export function deriveFromTimePeriod(tp: string, weather = ''): SceneTimeDerive {
  const t = (tp || '').trim()
  const w = (weather || '').trim()

  const out: SceneTimeDerive = {}
  if (/深夜|凌晨/.test(t)) {
    out.emotion = 'sleepy'
    out.emotionLevel = 2
    out.action = 'resting'
    out.expression = 'silent'
  } else if (/晚上|黄昏|傍晚/.test(t)) {
    out.emotion = 'relaxed'
    out.emotionLevel = 1
    out.expression = 'soft_smile'
  } else if (/早上|清晨|早晨/.test(t)) {
    out.emotion = 'calm'
    out.emotionLevel = 1
    out.action = 'just_woke'
    out.expression = 'smile'
  } else if (/下午/.test(t)) {
    out.emotion = 'gentle'
    out.emotionLevel = 1
  }

  if (/雪/.test(w)) { out.emotion = 'happy'; out.emotionLevel = 2 }
  else if (/晴|阳光/.test(w)) { out.emotion = out.emotion || 'happy'; out.emotionLevel = 1 }
  else if (/雨|暴雨/.test(w)) { if (!out.emotion) { out.emotion = 'calm'; out.emotionLevel = 1 } }
  return out
}

/** Emotion → 默认表情（正向映射），用于五维联动 */
export function defaultExpressionFor(emo: EmotionKey): ExpressionKey {
  switch (emo) {
    case 'happy':        return 'smile'
    case 'gentle':       return 'gentle_smile'
    case 'shy':          return 'blush'
    case 'calm':         return 'soft_smile'
    case 'relaxed':      return 'soft_smile'
    case 'excited':      return 'laugh'
    case 'thinking':     return 'contemplative'
    case 'sleepy':       return 'silent'
    case 'nervous':      return 'frowning'
    case 'sad':          return 'dejected'
    case 'angry':        return 'frowning'
    case 'disappointed': return 'dejected'
    case 'surprised':    return 'shocked'
    case 'confused':     return 'puzzled'
    case 'grievance':    return 'dejected'
    case 'expectant':    return 'smile'
    case 'attached':     return 'fond'
    case 'relieved':     return 'gentle_smile'
    case 'amused':       return 'giggle'
    case 'blushing':     return 'blush'
    default:             return 'no_expression'
  }
}

/** Emotion → 推荐强度（用户说"超开心"这种语气词可提升 1 级） */
export function boostLevel(base: EmotionLevel, amount = 1): EmotionLevel {
  const n = Math.min(3, Math.max(0, (base || 0) + amount))
  return n as EmotionLevel
}

// ============================================================
// 八、CharacterStateManager 主类
// ============================================================

const DEFAULT_EMOTION: EmotionKey = 'calm'
const DEFAULT_LEVEL: EmotionLevel = 1
const DEFAULT_ACTION: ActionKey = 'sitting'
const DEFAULT_POSE: PoseKey = 'on_sofa'
const DEFAULT_EXPRESSION: ExpressionKey = 'smile'
const DEFAULT_INTERACTION: InteractionKey = 'chatting'

const instances: Map<string, CharacterStateManager> = new Map()

export class CharacterStateManager {
  private state: CharacterState
  private listeners: Set<CharacterStateChangeListener> = new Set()
  private sceneUnsubscribe?: () => void

  private constructor(characterId: string) {
    this.state = {
      characterId,
      emotion: DEFAULT_EMOTION,
      emotionLevel: DEFAULT_LEVEL,
      action: DEFAULT_ACTION,
      pose: DEFAULT_POSE,
      expression: DEFAULT_EXPRESSION,
      interaction: DEFAULT_INTERACTION,
      lastUpdate: Date.now(),
      version: 0,
    }

    // 场景联动：场景/天气/时段变化 → 推导五维
    try {
      const sceneManager = getSceneManager(characterId)
      this.sceneUnsubscribe = sceneManager.subscribe((sceneState) => {
        const newPose = derivePoseFromScene(sceneState, this.state.pose)
        const newAction = deriveActionFromScene(sceneState, this.state.action)
        const newInter = deriveInteractionFromScene(sceneState, this.state.interaction)
        const timeDrv = deriveFromTimePeriod(sceneState.timePeriod || '', sceneState.weather || '')

        let changed =
          newPose !== this.state.pose ||
          newAction !== this.state.action ||
          newInter !== this.state.interaction

        const patch: Partial<CharacterState> = {}
        if (timeDrv.emotion && timeDrv.emotion !== this.state.emotion) {
          patch.emotion = timeDrv.emotion
          changed = true
        }
        if (timeDrv.emotionLevel != null && timeDrv.emotionLevel !== this.state.emotionLevel) {
          patch.emotionLevel = timeDrv.emotionLevel
          changed = true
        }
        if (timeDrv.expression && timeDrv.expression !== this.state.expression) {
          patch.expression = timeDrv.expression
          changed = true
        }
        if (timeDrv.action && timeDrv.action !== this.state.action) {
          patch.action = timeDrv.action
          changed = true
        }

        if (!changed && Object.keys(patch).length === 0) return

        this.state = {
          ...this.state,
          pose: newPose,
          action: newAction,
          interaction: newInter,
          ...patch,
          expression: patch.expression ||
            (patch.emotion ? defaultExpressionFor(patch.emotion) : this.state.expression),
          lastUpdate: Date.now(),
          version: this.state.version + 1,
        }
        this.notify()
      })
    } catch {
      // SceneManager 未初始化：忽略
    }
  }

  static getInstance(characterId: string): CharacterStateManager {
    let inst = instances.get(characterId)
    if (!inst) {
      inst = new CharacterStateManager(characterId)
      instances.set(characterId, inst)
    }
    return inst
  }

  subscribe(listener: CharacterStateChangeListener): () => void {
    this.listeners.add(listener)
    try { listener(this.state) } catch {}
    return () => this.listeners.delete(listener)
  }

  getState(): Readonly<CharacterState> { return this.state }

  // ===== 五维显示字段（UI / Prompt 使用） =====

  getEmotionName(): string { return EMOTION_TABLE[this.state.emotion].name }
  getEmotionEmoji(): string { return EMOTION_TABLE[this.state.emotion].emoji }
  getEmotionLevel(): EmotionLevel { return this.state.emotionLevel }
  getActionName(): string { return ACTION_TABLE[this.state.action].name }
  getPoseName(): string { return POSE_TABLE[this.state.pose].name }
  getExpressionName(): string { return EXPRESSION_TABLE[this.state.expression].name }
  getInteractionName(): string { return INTERACTION_TABLE[this.state.interaction].name }

  /**
   * 顶部显示：「😊 开心(2)｜坐在沙发上｜微笑｜正在聊天」
   *
   * 4 段式：emotion｜pose｜expression｜interaction
   * - emotion 带强度（level>=2 才显示 level，避免普通情况太啰嗦）
   * - expression 为空时省略那段
   * - pose 与 action 的名字不重复时才都显示（否则只留 pose 更自然）
   */
  getDisplayString(_scenePositionHint?: string): string {
    const s = this.state
    const emoTable = EMOTION_TABLE[s.emotion]
    const levelText = s.emotionLevel >= 2 ? `(${s.emotionLevel})` : ''
    const emo = `${emoTable.emoji} ${emoTable.name}${levelText}`

    const poseName = POSE_TABLE[s.pose].name
    const expressionName = EXPRESSION_TABLE[s.expression].name
    const interName = INTERACTION_TABLE[s.interaction].name

    // 如果 pose 已经包含动作语义（坐在沙发上 / 躺在床上 / 慵懒地躺着），
    // 直接用 pose 做第 2 段；否则尝试 "pose + 不重复的 action"
    const actionName = ACTION_TABLE[s.action].name
    let segment2 = poseName
    // 如果 pose 本身很抽象（站立/斜靠着/侧身/低头/抬头/双手背后/双手抱胸/单手扶脸/
    // 双手放在膝上/轻轻靠近/微微踮脚），后面追加动作（不重复词）
    const posesThatNeedAction: PoseKey[] = [
      'standing', 'leaning', 'bending_forward', 'sideways', 'hands_behind',
      'arms_crossed', 'hand_on_cheek', 'hands_on_knees', 'gently_near',
      'head_down', 'head_up', 'on_tiptoes',
    ]
    if (posesThatNeedAction.includes(s.pose) && actionName && !poseName.includes(actionName)) {
      segment2 = `${poseName} ${actionName}`
    }

    const parts = [emo, segment2]
    if (expressionName) parts.push(expressionName)
    parts.push(interName)
    return parts.join('｜')
  }

  // ===== 命令批量更新 =====

  applyCommands(commands: CharacterStateCommand[]): boolean {
    if (!commands || commands.length === 0) return false
    let changed = false

    const sorted = [...commands].sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5))
    for (const cmd of sorted) {
      if (cmd.value === undefined || cmd.value === null || cmd.value === '') continue
      switch (cmd.type) {
        case 'emotion': {
          const key = this.resolveEmotion(String(cmd.value))
          if (key && key !== this.state.emotion) {
            this.state.emotion = key
            // 表情跟随心情变化
            this.state.expression = defaultExpressionFor(key)
            changed = true
          }
          break
        }
        case 'emotionLevel': {
          const n = typeof cmd.value === 'number' ? cmd.value : parseInt(String(cmd.value), 10)
          if (!Number.isNaN(n) && n >= 0 && n <= 3 && n !== this.state.emotionLevel) {
            this.state.emotionLevel = n as EmotionLevel
            changed = true
          }
          break
        }
        case 'action': {
          const key = this.resolveAction(String(cmd.value))
          if (key && key !== this.state.action) {
            this.state.action = key
            changed = true
          }
          break
        }
        case 'pose': {
          const key = this.resolvePose(String(cmd.value))
          if (key && key !== this.state.pose) {
            this.state.pose = key
            changed = true
          }
          break
        }
        case 'expression': {
          const key = this.resolveExpression(String(cmd.value))
          if (key && key !== this.state.expression) {
            this.state.expression = key
            changed = true
          }
          break
        }
        case 'interaction': {
          const key = this.resolveInteraction(String(cmd.value))
          if (key && key !== this.state.interaction) {
            this.state.interaction = key
            changed = true
          }
          break
        }
        case 'reset':
          changed = this.reset() || changed
          break
      }
    }

    if (changed) {
      this.state.lastUpdate = Date.now()
      this.state.version += 1
      this.notify()
    }
    return changed
  }

  // ===== 生活事件 API：一次推一组五维组合 =====

  applyEvent(event: CharacterLifeEvent): boolean {
    const cmds: CharacterStateCommand[] = []
    switch (event) {
      case 'praise':
        cmds.push({ type: 'emotion', value: 'happy', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'emotionLevel', value: 2, confidence: 0.9, source: 'event' })
        cmds.push({ type: 'expression', value: 'blush', confidence: 0.8, source: 'event' })
        cmds.push({ type: 'interaction', value: 'being_praised', confidence: 0.9, source: 'event' })
        break
      case 'confession':
        cmds.push({ type: 'emotion', value: 'blushing', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'emotionLevel', value: 3, confidence: 0.9, source: 'event' })
        cmds.push({ type: 'pose', value: 'head_down', confidence: 0.8, source: 'event' })
        cmds.push({ type: 'expression', value: 'blush', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'interaction', value: 'accompanying', confidence: 0.7, source: 'event' })
        break
      case 'comfort':
        cmds.push({ type: 'emotion', value: 'relieved', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'emotionLevel', value: 2, confidence: 0.8, source: 'event' })
        cmds.push({ type: 'expression', value: 'gentle_smile', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'interaction', value: 'being_comforted', confidence: 0.9, source: 'event' })
        break
      case 'neglect':
        cmds.push({ type: 'emotion', value: 'disappointed', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'expression', value: 'dejected', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'interaction', value: 'waiting', confidence: 0.9, source: 'event' })
        break
      case 'intimacy':
        cmds.push({ type: 'emotion', value: 'attached', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'emotionLevel', value: 2, confidence: 0.8, source: 'event' })
        cmds.push({ type: 'action', value: 'hugging', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'interaction', value: 'snuggling_you', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'expression', value: 'fond', confidence: 0.8, source: 'event' })
        break
      case 'at_home':
        cmds.push({ type: 'emotion', value: 'relaxed', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'emotionLevel', value: 1, confidence: 0.8, source: 'event' })
        cmds.push({ type: 'action', value: 'sitting', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'pose', value: 'on_sofa', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'interaction', value: 'accompanying', confidence: 0.8, source: 'event' })
        break
      case 'outing':
        cmds.push({ type: 'emotion', value: 'excited', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'emotionLevel', value: 2, confidence: 0.8, source: 'event' })
        cmds.push({ type: 'action', value: 'strolling', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'interaction', value: 'enjoying_view', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'expression', value: 'smile', confidence: 0.8, source: 'event' })
        break
      case 'morning':
        cmds.push({ type: 'emotion', value: 'calm', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'action', value: 'just_woke', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'expression', value: 'soft_smile', confidence: 0.8, source: 'event' })
        break
      case 'late_night':
        cmds.push({ type: 'emotion', value: 'sleepy', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'emotionLevel', value: 2, confidence: 0.8, source: 'event' })
        cmds.push({ type: 'action', value: 'resting', confidence: 0.9, source: 'event' })
        cmds.push({ type: 'expression', value: 'silent', confidence: 0.8, source: 'event' })
        cmds.push({ type: 'interaction', value: 'accompanying', confidence: 0.7, source: 'event' })
        break
    }
    return this.applyCommands(cmds)
  }

  reset(): boolean {
    const changed =
      this.state.emotion !== DEFAULT_EMOTION ||
      this.state.emotionLevel !== DEFAULT_LEVEL ||
      this.state.action !== DEFAULT_ACTION ||
      this.state.pose !== DEFAULT_POSE ||
      this.state.expression !== DEFAULT_EXPRESSION ||
      this.state.interaction !== DEFAULT_INTERACTION
    this.state.emotion = DEFAULT_EMOTION
    this.state.emotionLevel = DEFAULT_LEVEL
    this.state.action = DEFAULT_ACTION
    this.state.pose = DEFAULT_POSE
    this.state.expression = DEFAULT_EXPRESSION
    this.state.interaction = DEFAULT_INTERACTION
    return changed
  }

  private notify() {
    for (const fn of this.listeners) {
      try { fn(this.state) } catch {}
    }
  }

  // ===== 文本 → 白名单 key 解析（严格：未登记词一律 null） =====

  private resolveEmotion(value: string): EmotionKey | null {
    const v = value.trim()
    if (!v) return null
    if ((v as unknown as keyof typeof EMOTION_TABLE) in EMOTION_TABLE) return v as EmotionKey
    if (EMOTION_NAME_TO_KEY[v]) return EMOTION_NAME_TO_KEY[v]
    if (EMOTION_SYNONYMS[v]) return EMOTION_SYNONYMS[v]
    for (const [syn, key] of Object.entries(EMOTION_SYNONYMS)) {
      if (v.includes(syn)) return key
    }
    return null
  }

  private resolveAction(value: string): ActionKey | null {
    const v = value.trim()
    if (!v) return null
    if ((v as unknown as keyof typeof ACTION_TABLE) in ACTION_TABLE) return v as ActionKey
    if (ACTION_NAME_TO_KEY[v]) return ACTION_NAME_TO_KEY[v]
    for (const [name, key] of Object.entries(ACTION_NAME_TO_KEY)) {
      if (v.includes(name)) return key
    }
    return null
  }

  private resolvePose(value: string): PoseKey | null {
    const v = value.trim()
    if (!v) return null
    if ((v as unknown as keyof typeof POSE_TABLE) in POSE_TABLE) return v as PoseKey
    if (POSE_NAME_TO_KEY[v]) return POSE_NAME_TO_KEY[v]
    for (const [name, key] of Object.entries(POSE_NAME_TO_KEY)) {
      if (v.includes(name)) return key
    }
    return null
  }

  private resolveExpression(value: string): ExpressionKey | null {
    const v = value.trim()
    if (!v) return null
    if ((v as unknown as keyof typeof EXPRESSION_TABLE) in EXPRESSION_TABLE) return v as ExpressionKey
    if (EXPRESSION_NAME_TO_KEY[v]) return EXPRESSION_NAME_TO_KEY[v]
    for (const [name, key] of Object.entries(EXPRESSION_NAME_TO_KEY)) {
      if (name && v.includes(name)) return key
    }
    return null
  }

  private resolveInteraction(value: string): InteractionKey | null {
    const v = value.trim()
    if (!v) return null
    if ((v as unknown as keyof typeof INTERACTION_TABLE) in INTERACTION_TABLE) return v as InteractionKey
    if (INTERACTION_NAME_TO_KEY[v]) return INTERACTION_NAME_TO_KEY[v]
    for (const [name, key] of Object.entries(INTERACTION_NAME_TO_KEY)) {
      if (v.includes(name)) return key
    }
    return null
  }

  dispose() {
    this.listeners.clear()
    if (this.sceneUnsubscribe) {
      this.sceneUnsubscribe()
      this.sceneUnsubscribe = undefined
    }
    instances.delete(this.state.characterId)
  }
}

export function getCharacterStateManager(characterId: string): CharacterStateManager {
  return CharacterStateManager.getInstance(characterId)
}

/**
 * 候选情绪识别：只返回白名单 EmotionKey，避免对话文本污染。
 * 可选择强度：基于文本中的 "超/太/好/特别/非常/极度" 等词，返回是否需要 level +1/+2
 */
export interface EmotionHit {
  key: EmotionKey
  /** +0 ~ +2，根据「超/太/好/特别/非常/最/极度」等词叠加 */
  levelBoost: 0 | 1 | 2
}

export function matchEmotionKeyword(text: string): EmotionHit | null {
  const t = text || ''
  let hit: EmotionKey | null = null
  for (const [syn, key] of Object.entries(EMOTION_SYNONYMS)) {
    if (t.includes(syn)) { hit = key; break }
  }
  if (!hit) {
    for (const [name, key] of Object.entries(EMOTION_NAME_TO_KEY)) {
      if (t.includes(name)) { hit = key; break }
    }
  }
  if (!hit) return null

  let boost: 0 | 1 | 2 = 0
  if (/极度|极致|爆表|超级超级/.test(t)) boost = 2
  else if (/超[^市过出]|太[太阳了太]?|好[么]?|特别|非常|十分|甚是|最为|极其/.test(t)) boost = 1
  return { key: hit, levelBoost: boost }
}
