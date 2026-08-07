/**
 * CommandParser — 本地命令解析器
 *
 * 所有 / 前缀或括号内的命令必须本地处理，不发送给模型。
 * 支持：/召唤、/遣散、/换装、/定位、/时间、/天气、/场景 等
 */

export type LocalCommandType =
  | 'summon'      // /召唤 <角色名>
  | 'dismiss'     // /遣散 <角色名>
  | 'outfit'      // /换装 <服装名>
  | 'position'    // /定位 <位置>
  | 'time'        // /时间 <时间描述>
  | 'weather'     // /天气 <天气描述>
  | 'scene'       // /场景 <场景名>
  | 'list'        // /列表 - 查看当前在场角色
  | 'clear'       // /清场 - 遣散所有角色
  | 'help'        // /帮助 - 显示命令列表
  | 'unknown'     // 未知命令

export interface ParsedCommand {
  type: LocalCommandType
  args: string[]
  raw: string
  handled: boolean
  message?: string
}

/** 命令前缀正则 */
const COMMAND_PREFIX = /^[\/／]\s*([\u4e00-\u9fa5a-zA-Z]+)/

/** 命令到类型的映射 */
const COMMAND_MAP: Record<string, LocalCommandType> = {
  '召唤': 'summon',
  'summon': 'summon',
  'add': 'summon',
  '加': 'summon',
  
  '遣散': 'dismiss',
  'dismiss': 'dismiss',
  'remove': 'dismiss',
  '踢': 'dismiss',
  
  '换装': 'outfit',
  'outfit': 'outfit',
  '穿': 'outfit',
  
  '定位': 'position',
  'position': 'position',
  'pos': 'position',
  
  '时间': 'time',
  'time': 'time',
  
  '天气': 'weather',
  'weather': 'weather',
  
  '场景': 'scene',
  'scene': 'scene',
  
  '列表': 'list',
  'list': 'list',
  'ls': 'list',
  '在场': 'list',
  
  '清场': 'clear',
  'clear': 'clear',
  '清空': 'clear',
  '全部离开': 'clear',
  
  '帮助': 'help',
  'help': 'help',
  '?': 'help',
}

/**
 * 解析用户输入中的本地命令
 * @param input 用户原始输入
 * @returns 解析结果，如果是命令则返回 ParsedCommand，否则返回 null
 */
export function parseCommand(input: string): ParsedCommand | null {
  if (!input || !input.trim()) return null

  const trimmed = input.trim()
  
  // 检查是否以命令前缀开头
  const prefixMatch = trimmed.match(COMMAND_PREFIX)
  if (!prefixMatch) return null

  const commandName = prefixMatch[1].toLowerCase()
  const rest = trimmed.slice(prefixMatch[0].length).trim()
  
  const type = COMMAND_MAP[commandName] || 'unknown'
  const args = rest ? rest.split(/\s+/).filter(Boolean) : []

  const command: ParsedCommand = {
    type,
    args,
    raw: trimmed,
    handled: false,
  }

  // 处理特殊命令
  switch (type) {
    case 'list':
      command.handled = true
      command.message = '📋 当前命令列表：\n/召唤 <角色名> - 召唤角色\n/遣散 <角色名> - 遣散角色\n/换装 <服装> - 切换服装\n/定位 <位置> - 设置位置\n/时间 <描述> - 推进时间\n/天气 <描述> - 设置天气\n/场景 <场景名> - 切换场景\n/列表 - 查看在场角色\n/清场 - 遣散所有\n/帮助 - 显示帮助'
      break
    case 'help':
      command.handled = true
      command.message = '📖 多人聊天命令帮助：\n\n【角色管理】\n/召唤 <角色名> - 召唤角色加入对话\n/遣散 <角色名> - 遣散指定角色\n/清场 - 遣散所有角色\n\n【状态设置】\n/换装 <服装名> - 切换当前服装\n/定位 <位置> - 设置角色位置\n/时间 <描述> - 推进时间（如：1小时后）\n/天气 <描述> - 设置天气（如：下雨）\n/场景 <场景名> - 切换场景\n\n【信息查询】\n/列表 - 查看当前在场角色\n/帮助 - 显示此帮助信息\n\n示例：\n/召唤 三月七\n/时间 过了一会\n/场景 星穹列车'
      break
    case 'unknown':
      command.handled = true
      command.message = `❌ 未知命令：/${commandName}\n输入 /帮助 查看可用命令列表。`
      break
  }

  return command
}

/**
 * 检查输入是否包含命令（用于决定是否跳过 AI 调用）
 */
export function containsCommand(input: string): boolean {
  return parseCommand(input) !== null
}

/**
 * 验证命令参数是否完整
 */
export function validateCommand(command: ParsedCommand, availableCharacters: string[], activeCharacters: string[]): {
  valid: boolean
  error?: string
} {
  switch (command.type) {
    case 'summon': {
      if (command.args.length === 0) {
        return { valid: false, error: '请指定要召唤的角色名，如：/召唤 三月七' }
      }
      const name = command.args[0]
      if (!availableCharacters.includes(name)) {
        return { valid: false, error: `未找到角色：${name}。请确认角色名是否正确。` }
      }
      if (activeCharacters.includes(name)) {
        return { valid: false, error: `${name} 已经在场了。` }
      }
      if (activeCharacters.length >= 3) {
        return { valid: false, error: '最多支持 4 个角色同时在场（含主角色），请先遣散其他角色。' }
      }
      return { valid: true }
    }
    case 'dismiss': {
      if (command.args.length === 0) {
        return { valid: false, error: '请指定要遣散的角色名，如：/遣散 三月七' }
      }
      const name = command.args[0]
      if (!activeCharacters.includes(name)) {
        return { valid: false, error: `${name} 不在当前对话中。` }
      }
      return { valid: true }
    }
    case 'outfit':
    case 'position':
    case 'time':
    case 'weather':
    case 'scene':
      if (command.args.length === 0) {
        return { valid: false, error: `请指定${getTypeLabel(command.type)}，如：/${command.raw.split(' ')[0]} <值>` }
      }
      return { valid: true }
    case 'list':
    case 'clear':
    case 'help':
    case 'unknown':
      return { valid: true }
    default:
      return { valid: true }
  }
}

function getTypeLabel(type: LocalCommandType): string {
  const labels: Record<string, string> = {
    outfit: '服装',
    position: '位置',
    time: '时间',
    weather: '天气',
    scene: '场景',
  }
  return labels[type] || '参数'
}

/**
 * 生成命令执行后的系统消息
 */
export function generateCommandSystemMessage(command: ParsedCommand, success: boolean): string {
  if (command.message) return command.message
  if (!success) return ''
  
  const argsStr = command.args.join(' ')
  
  switch (command.type) {
    case 'summon':
      return `📢 ${argsStr} 加入了对话`
    case 'dismiss':
      return `🚪 ${argsStr} 离开了`
    case 'outfit':
      return `👗 已切换为：${argsStr}`
    case 'position':
      return `📍 位置已更新：${argsStr}`
    case 'time':
      return `⏰ 时间流转：${argsStr}`
    case 'weather':
      return `🌤️ 天气变化：${argsStr}`
    case 'scene':
      return `🎬 场景切换：${argsStr}`
    case 'clear':
      return `🧹 已遣散所有角色`
    case 'list':
      return command.message || ''
    default:
      return ''
  }
}
