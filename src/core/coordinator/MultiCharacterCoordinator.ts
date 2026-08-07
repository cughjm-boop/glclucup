/**
 * MultiCharacterCoordinator — 多人聊天协调器
 *
 * 整合 V5 ConversationDispatcher 与现有聊天系统的桥梁。
 * 负责：
 * 1. 命令解析（CommandParser）
 * 2. Dispatcher 生命周期管理
 * 3. Runtime 状态同步
 * 4. Prompt 生成调度
 */

import {
  ConversationDispatcher,
  type DispatcherProcessResult,
} from '../dispatcher/ConversationDispatcher'
import type { ConversationRuntime } from '../dispatcher/ConversationRuntime'
import {
  parseCommand,
  validateCommand,
  generateCommandSystemMessage,
  type ParsedCommand,
} from '../command/CommandParser'

export interface CoordinatorConfig {
  characterId: string
  characterName: string
  /** 可用角色列表（用于验证召唤命令） */
  availableCharacters: Array<{ id: string; name: string }>
  /** 初始在场角色 */
  initialActiveCharacters?: string[]
  /** 初始场景信息 */
  initialScene?: {
    location?: string
    time?: string
    weather?: string
  }
}

export interface ProcessUserMessageResult {
  /** 处理结果类型 */
  type: 'command' | 'chat' | 'error'
  /** 如果是命令，这里是系统消息 */
  systemMessage?: string
  /** 如果是聊天，这里是 Dispatcher 处理结果 */
  dispatcherResult?: DispatcherProcessResult
  /** 错误信息 */
  error?: string
  /** 当前在场角色列表（唯一数据源） */
  activeCharacters: string[]
  /** 当前 Runtime 快照 */
  runtime: ConversationRuntime
}

/** 协调器实例缓存 */
const coordinatorInstances = new Map<string, MultiCharacterCoordinator>()

export class MultiCharacterCoordinator {
  private dispatcher: ConversationDispatcher
  private config: CoordinatorConfig

  private constructor(config: CoordinatorConfig) {
    this.config = config
    this.dispatcher = ConversationDispatcher.get(config.characterId, {
      scene: {
        location: config.initialScene?.location || '默认场景',
        time: config.initialScene?.time || '',
        weather: config.initialScene?.weather || '晴朗',
      },
      activeCharacters: config.initialActiveCharacters || [],
    })

    // 确保主角色在场
    this.dispatcher.summonCharacter({
      characterId: config.characterId,
      characterName: config.characterName,
      position: config.initialScene?.location || '默认场景',
      action: '在场',
    })
  }

  /** 获取或创建协调器实例 */
  static get(config: CoordinatorConfig): MultiCharacterCoordinator {
    const key = config.characterId
    if (!coordinatorInstances.has(key)) {
      coordinatorInstances.set(key, new MultiCharacterCoordinator(config))
    }
    // 更新配置
    const instance = coordinatorInstances.get(key)!
    instance.config = config
    return instance
  }

  /** 销毁协调器 */
  static dispose(characterId: string): void {
    coordinatorInstances.delete(characterId)
    ConversationDispatcher.dispose(characterId)
  }

  /**
   * 获取当前在场角色列表（唯一数据源）
   */
  getActiveCharacters(): string[] {
    const runtime = this.dispatcher.getRuntime()
    return runtime.activeCharacters.filter(
      (id) => id !== this.config.characterId
    )
  }

  /**
   * 获取 Runtime 快照
   */
  getRuntime(): ConversationRuntime {
    return this.dispatcher.getRuntime()
  }

  /**
   * 处理用户消息（主入口）
   *
   * 流程：
   * 1. CommandParser 解析命令
   * 2. 如果是命令 → 本地处理，不调用 AI
   * 3. 如果是普通消息 → Dispatcher.processUserMessage() → 准备 AI 调用
   */
  processUserMessage(message: string): ProcessUserMessageResult {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      return {
        type: 'error',
        error: '消息不能为空',
        activeCharacters: this.getActiveCharacters(),
        runtime: this.getRuntime(),
      }
    }

    // ① 命令解析
    const command = parseCommand(trimmedMessage)
    if (command) {
      return this.handleCommand(command)
    }

    // ② 普通消息 → 走 Dispatcher 流程
    const dispatcherResult = this.dispatcher.processUserMessage(trimmedMessage)

    return {
      type: 'chat',
      dispatcherResult,
      activeCharacters: this.getActiveCharacters(),
      runtime: this.getRuntime(),
    }
  }

  /**
   * 处理本地命令
   */
  private handleCommand(command: ParsedCommand): ProcessUserMessageResult {
    const activeChars = this.getActiveCharacters()
    const availableNames = this.config.availableCharacters.map((c) => c.name)

    // 特殊命令直接处理
    switch (command.type) {
      case 'list': {
        const names = activeChars.length > 0 ? activeChars.join('、') : '暂无'
        return {
          type: 'command',
          systemMessage: `📋 当前在场角色：${names}\n主角色：${this.config.characterName}`,
          activeCharacters: activeChars,
          runtime: this.getRuntime(),
        }
      }
      case 'help': {
        return {
          type: 'command',
          systemMessage: command.message!,
          activeCharacters: activeChars,
          runtime: this.getRuntime(),
        }
      }
      case 'clear': {
        // 遣散所有非主角色
        for (const name of activeChars) {
          const charConfig = this.config.availableCharacters.find((c) => c.name === name)
          if (charConfig) {
            this.dispatcher.dismissCharacter(charConfig.id)
          }
        }
        return {
          type: 'command',
          systemMessage: '🧹 已遣散所有角色',
          activeCharacters: [],
          runtime: this.getRuntime(),
        }
      }
      case 'unknown': {
        return {
          type: 'command',
          systemMessage: command.message!,
          activeCharacters: activeChars,
          runtime: this.getRuntime(),
        }
      }
    }

    // 验证命令参数
    const validation = validateCommand(command, availableNames, activeChars)
    if (!validation.valid) {
      return {
        type: 'command',
        systemMessage: `❌ ${validation.error}`,
        activeCharacters: activeChars,
        runtime: this.getRuntime(),
      }
    }

    // 执行命令
    return this.executeCommand(command)
  }

  /**
   * 执行已验证的命令
   */
  private executeCommand(command: ParsedCommand): ProcessUserMessageResult {
    const { args } = command
    let systemMessage = ''

    switch (command.type) {
      case 'summon': {
        const name = args[0]
        const charConfig = this.config.availableCharacters.find((c) => c.name === name)
        if (charConfig) {
          this.dispatcher.summonCharacter({
            characterId: charConfig.id,
            characterName: charConfig.name,
          })
          systemMessage = `📢 ${name} 加入了对话`
        }
        break
      }
      case 'dismiss': {
        const name = args[0]
        const charConfig = this.config.availableCharacters.find((c) => c.name === name)
        if (charConfig) {
          this.dispatcher.dismissCharacter(charConfig.id)
          systemMessage = `🚪 ${name} 离开了`
        }
        break
      }
      case 'outfit':
      case 'position':
      case 'time':
      case 'weather':
      case 'scene': {
        // 这些命令更新 Runtime，但仍然需要 AI 来回复
        // 所以标记为 chat 类型，让 Dispatcher 处理后续
        const dispatcherResult = this.dispatcher.processUserMessage(command.raw)
        return {
          type: 'chat',
          dispatcherResult,
          activeCharacters: this.getActiveCharacters(),
          runtime: this.getRuntime(),
        }
      }
    }

    return {
      type: 'command',
      systemMessage,
      activeCharacters: this.getActiveCharacters(),
      runtime: this.getRuntime(),
    }
  }

  /**
   * 处理 AI 回复
   */
  processAIReply(reply: string) {
    return this.dispatcher.processAIReply(reply)
  }

  /**
   * 订阅 Runtime 变更
   */
  subscribe(listener: (runtime: ConversationRuntime) => void): () => void {
    return this.dispatcher.subscribe(listener)
  }
}
