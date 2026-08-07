/**
 * strictMatchLocalEvent + analyzeUserEvent 单元测试
 *
 * 覆盖需求一（多人聊天触发规则）中明确列出的 6 个句式、常见变体、
 * 不认识角色（只校验 rawTargetName 产生，档案层在 useStore 里判定）、
 * 以及不应该命中的阴性句（普通闲聊、战斗、换装等送 AI 处理）。
 */
import { describe, it, expect } from 'vitest'
import { strictMatchLocalMultiEvent, analyzeUserEvent } from '../core/dispatcher/EventTypes'

// 快捷断言工具：strictMatchLocalMultiEvent 命中 enter
function assertEnter(input: string, expectName: string, expectPattern?: string) {
  const r = strictMatchLocalMultiEvent(input)
  expect(r, `应命中召唤：${input}`).not.toBeNull()
  expect(r!.type, `${input} 应为 CharacterEnter`).toBe('CharacterEnter')
  expect(r!.rawTargetName, `${input} 目标名`).toBe(expectName)
  if (expectPattern) expect(r!.matchedPattern, `${input} pattern`).toBe(expectPattern)
}
// 快捷断言工具：strictMatchLocalMultiEvent 命中 leave
function assertLeave(input: string, expectName: string, expectPattern?: string) {
  const r = strictMatchLocalMultiEvent(input)
  expect(r, `应命中离场：${input}`).not.toBeNull()
  expect(r!.type, `${input} 应为 CharacterLeave`).toBe('CharacterLeave')
  expect(r!.rawTargetName, `${input} 目标名`).toBe(expectName)
  if (expectPattern) expect(r!.matchedPattern, `${input} pattern`).toBe(expectPattern)
}
// 快捷断言：strict 未命中（会继续进入普通 analyzeUserEvent，可能命中宽松匹配但不走严格本地路由）
function assertNotStrict(input: string) {
  expect(strictMatchLocalMultiEvent(input), `不应命中严格本地事件：${input}`).toBeNull()
}

describe('EventTypes - 严格本地事件 strictMatchLocalMultiEvent（需求一：6 种触发句）', () => {
  // ──────────────── 召唤 3 条 ────────────────
  it('1.「三月七来了」→ CharacterEnter（X来了）', () => assertEnter('三月七来了', '三月七', 'X来了'))
  it('2.「三月七加入聊天」→ CharacterEnter（X加入聊天）', () => assertEnter('三月七加入聊天', '三月七', 'X加入聊天'))
  it('3.「叫三月七过来」→ CharacterEnter（叫X过来）', () => assertEnter('叫三月七过来', '三月七', '叫X过来'))

  // ──────────────── 离场 3 条 ────────────────
  it('4.「再见了三月七」→ CharacterLeave（再见了X）', () => assertLeave('再见了三月七', '三月七', '再见了X'))
  it('5.「三月七离开吧」→ CharacterLeave（X离开吧）', () => assertLeave('三月七离开吧', '三月七', 'X离开吧'))
  it('6.「让三月七退场」→ CharacterLeave（让X退场）', () => assertLeave('让三月七退场', '三月七', '让X退场'))

  // ──────────────── 变体（其他角色、标点、空格、语气词） ────────────────
  describe('召唤变体', () => {
    it('知更鸟来了 → Enter', () => assertEnter('知更鸟来了', '知更鸟'))
    it('卡芙卡加入对话 → Enter', () => assertEnter('卡芙卡加入对话', '卡芙卡'))
    it('喊丹恒过来 → Enter', () => assertEnter('喊丹恒过来', '丹恒'))
    it('把希儿叫过来 → Enter', () => assertEnter('把希儿叫过来', '希儿'))
    it('三月七也来了 → Enter', () => assertEnter('三月七也来了', '三月七'))
    it('三月七加入我们 → Enter', () => assertEnter('三月七加入我们', '三月七'))
    it('叫符玄来一下 → Enter', () => assertEnter('叫符玄来一下', '符玄'))
    it('三月七来了！→ 末尾标点忽略', () => assertEnter('三月七来了！', '三月七'))
    it('  三月七来了  → 前后空白修剪', () => assertEnter('  三月七来了  ', '三月七'))
    it('三月七来了~ → 末尾波浪忽略', () => assertEnter('三月七来了~', '三月七'))
  })

  describe('离场变体', () => {
    it('拜拜卡芙卡 → Leave', () => assertLeave('拜拜卡芙卡', '卡芙卡'))
    it('再见，三月七 → 分隔逗号支持', () => assertLeave('再见，三月七', '三月七'))
    it('三月七先回去吧 → Leave（X离开吧 分组里的「先回去」）', () => assertLeave('三月七先回去吧', '三月七'))
    it('叫三月七先走 → Leave', () => assertLeave('叫三月七先走', '三月七'))
    it('让知更鸟撤了 → Leave', () => assertLeave('让知更鸟撤了', '知更鸟'))
    it('让符玄回去吧 → Leave', () => assertLeave('让符玄回去吧', '符玄'))
    it('三月七走吧 → Leave', () => assertLeave('三月七走吧', '三月七'))
    it('再见了卡芙卡！→ 末尾标点忽略', () => assertLeave('再见了卡芙卡！', '卡芙卡'))
  })

  // ──────────────── 不认识角色 / 乱码：仍然能产出 rawTargetName（档案查找在 useStore 层报错） ────────────────
  describe('角色不存在/乱码', () => {
    it('小明来了 → 严格路由命中，产生 rawTargetName=小明，后续在 useStore 层才报「不认识」', () => {
      const r = strictMatchLocalMultiEvent('小明来了')
      expect(r).not.toBeNull()
      expect(r!.type).toBe('CharacterEnter')
      expect(r!.rawTargetName).toBe('小明')
    })
    it('再见了路人甲 → 严格路由命中，后续档案查找报错', () => {
      const r = strictMatchLocalMultiEvent('再见了路人甲')
      expect(r).not.toBeNull()
      expect(r!.type).toBe('CharacterLeave')
      expect(r!.rawTargetName).toBe('路人甲')
    })
    it('叫@#$%过来 → 仍命中（rawTargetName 可能是特殊字符，但 useStore 会找不到档案 → 本地错误）', () => {
      const r = strictMatchLocalMultiEvent('叫@#$%过来')
      expect(r).not.toBeNull()
      expect(r!.type).toBe('CharacterEnter')
    })
  })

  // ──────────────── 阴性：不应触发严格本地路由 ────────────────
  describe('阴性（不命中严格路由）', () => {
    it('空字符串 / 纯空白 → null', () => {
      expect(strictMatchLocalMultiEvent('')).toBeNull()
      expect(strictMatchLocalMultiEvent('   ')).toBeNull()
    })
    it('普通闲聊「今天天气真好」→ 不触发', () => assertNotStrict('今天天气真好'))
    it('问答「三月七昨天跟我们去海边好玩吗？」→ 不触发（这是 Mention 送 AI）', () => assertNotStrict('三月七昨天跟我们去海边好玩吗？'))
    it('换装「换一件裙子」→ 不触发', () => assertNotStrict('换一件裙子'))
    it('战斗「开打」→ 不触发', () => assertNotStrict('开打'))
    it('移动「去客厅」→ 不触发', () => assertNotStrict('去客厅'))
    it('句尾出现「来了」但不是整句结构「你终于来了」→ 不触发（避免误杀常见问候）', () => assertNotStrict('你终于来了'))
    it('句尾出现「过来」但没有召唤词「你过来一下」→ 不触发', () => assertNotStrict('你过来一下'))
    it('长文本含「三月七来了」但非独立句 → 不触发（要求严格整句）', () => assertNotStrict('刚刚听说三月七来了'))
  })
})

describe('EventTypes - analyzeUserEvent（严格路由优先于普通事件分析）', () => {
  it('严格路由优先：「三月七来了」→ CharacterEnter（而非宽松 Enter）', () => {
    const evt = analyzeUserEvent('三月七来了')
    expect(evt.type).toBe('CharacterEnter')
    expect(evt.targetName).toBe('三月七')
    expect(evt.summary).toContain('本地路由')
  })
  it('严格路由优先：「再见了三月七」→ CharacterLeave（而非宽松 Leave）', () => {
    const evt = analyzeUserEvent('再见了三月七')
    expect(evt.type).toBe('CharacterLeave')
    expect(evt.targetName).toBe('三月七')
    expect(evt.summary).toContain('本地路由')
  })
  it('未命中严格 → 走普通事件：「去客厅」→ Move', () => {
    const evt = analyzeUserEvent('去客厅')
    expect(evt.type).toBe('Move')
  })
  it('未命中严格 → 走普通事件：「穿礼服」→ Outfit', () => {
    expect(analyzeUserEvent('穿礼服').type).toBe('Outfit')
  })
  it('未命中严格 → 普通闲聊 GeneralChat', () => {
    expect(analyzeUserEvent('你好啊').type).toBe('GeneralChat')
  })
})
