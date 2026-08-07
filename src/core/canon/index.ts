/**
 * Official Canon Engine — 官方设定引擎入口
 *
 * 对外暴露的高层 API：
 *   - initialize(): 初始化并加载全部官方数据到只读缓存
 *   - buildCanonPrompt(speakerName, userMessage, options): 动态编译 Prompt
 *   - validateAndEnforce(reply, ctx): 校验 AI 回复，低于 95 分返回重生成信号
 */

import { compileCanonPrompt, detectModeFromMessage, type PromptMode, type CanonPromptContext } from './CanonPromptCompiler'
import { validateCanonReply, type CanonValidationReport, CANON_PASS_THRESHOLD } from './CanonValidator'
import { getCanonCharacter, getCanonWorld, clearCanonCache } from './CanonDatabase'
import { loadCanonResource, loadOtherCharacterBriefs, type LoadMode } from './DynamicCanonLoader'

export interface InitializeOptions {
  /** 预热的角色名列表（可选） */
  preloadCharacters?: string[]
}

/** 初始化 Canon Engine（只需调用一次） */
export function initializeCanonEngine(opts?: InitializeOptions): void {
  clearCanonCache()
  // 预热
  if (opts?.preloadCharacters) {
    for (const name of opts.preloadCharacters) {
      getCanonCharacter(name)
    }
  }
  // 加载世界观
  getCanonWorld('star_rail')
}

/** 对外：编译官方 Prompt */
export function buildCanonPrompt(
  speakerName: string,
  userMessage: string,
  options: Omit<CanonPromptContext, 'speakerName' | 'userMessage'> = {},
) {
  const mode: PromptMode = options.mode || detectModeFromMessage(userMessage)
  return compileCanonPrompt({
    speakerName,
    userMessage,
    mode,
    ...options,
  })
}

/** 对外：校验 AI 回复 */
export function validateAndEnforce(
  reply: string,
  ctx: {
    speakerName: string
    sceneInfo?: CanonPromptContext['sceneInfo']
    otherPresentNames?: string[]
    userMessage?: string
  },
): CanonValidationReport {
  const record = getCanonCharacter(ctx.speakerName)
  if (!record) {
    return {
      totalScore: 100,
      passed: true,
      shouldRegenerate: false,
      results: {},
      violations: [],
    }
  }
  return validateCanonReply({
    reply,
    record,
    sceneInfo: ctx.sceneInfo,
    otherPresentNames: ctx.otherPresentNames,
    userMessage: ctx.userMessage,
  })
}

/** 对外：按需加载资源（用于其他模块调用） */
export { loadCanonResource, loadOtherCharacterBriefs, CANON_PASS_THRESHOLD }

/** 导出所有子模块供外部调用 */
export * from './CanonDatabase'
export * from './CanonConstraintSplitter'
export * from './CanonPromptCompiler'
export * from './SnapshotGenerators'
export * from './CanonValidators'
export * from './CanonValidator'
export * from './DynamicCanonLoader'
