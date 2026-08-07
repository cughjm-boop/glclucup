/**
 * Multi Character Engine — 模块入口（包含 V2 与 V4）
 */

// V2 (legacy, for backward compatibility)
export * from './ConversationState'
export * from './CharacterRuntime'
export * from './SpeakerScheduler'
export * from './PerceptionFilter'
export * from './MultiCharacterEngine'
export * from './PromptCompiler'
export * from './ReplyValidator'
export * from './RelationshipCache'
export * from './useMultiCharacter'
export * from './multiCharacterSlice'

// V4 (new)
export * from './EventAnalyzer'
export * from './CharacterRuntimeV4'
export * from './SpeakerSchedulerV4'
export * from './InteractionMatrix'
export * from './CharacterConstraintEngine'
export * from './SharedSceneMemory'
export * from './MultiCharacterEngineV4'
