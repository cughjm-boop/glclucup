/**
 * 时间同步服务
 * 负责生成带入系统提示词的时间上下文，包括现实时间、时间段感知、对话时长、节假日等
 *
 * 优化：
 * - 使用口语化时间格式化器，用最少 Token 让 AI 理解时间环境
 * - 添加时间提及限制规则，防止 AI 机械报时
 */

// 中国法定节假日
const CHINESE_HOLIDAYS = [
  { pattern: '01-01', name: '元旦' },
  { pattern: '02-14', name: '情人节' },
  { pattern: '03-08', name: '妇女节' },
  { pattern: '04-01', name: '愚人节' },
  { pattern: '05-01', name: '劳动节' },
  { pattern: '06-01', name: '儿童节' },
  { pattern: '07-01', name: '建党节' },
  { pattern: '08-01', name: '建军节' },
  { pattern: '09-10', name: '教师节' },
  { pattern: '10-01', name: '国庆节' },
  { pattern: '10-31', name: '万圣节' },
  { pattern: '12-24', name: '平安夜' },
  { pattern: '12-25', name: '圣诞节' },
  { pattern: '12-31', name: '跨年夜' },
  { pattern: '01-22', name: '春节' },
  { pattern: '02-05', name: '元宵节' },
  { pattern: '04-05', name: '清明节' },
  { pattern: '06-22', name: '端午节' },
  { pattern: '08-15', name: '中秋节' },
  { pattern: '10-23', name: '重阳节' },
]

// 星期映射
const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

// 中文数字
const CN_NUMBERS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/**
 * 将数字转为中文口语读法（用于时间场景，2读"两"）
 * @param {number} n - 数字 (0-99)
 * @returns {string}
 */
function numToCn(n) {
  // 时间场景中，2 读"两"
  if (n === 2) return '两'
  if (n === 10) return '十'
  if (n <= 10) return CN_NUMBERS[n]
  if (n < 20) return '十' + (n === 10 ? '' : CN_NUMBERS[n - 10])
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return CN_NUMBERS[tens] + '十' + (ones === 0 ? '' : CN_NUMBERS[ones])
}

/**
 * 口语化时间格式化器
 * 将具体的小时和分钟转换为自然的中文口语表达
 *
 * 规则（覆盖 1440 分钟）：
 *   - 01-05 分：XX点刚过
 *   - 06-10 分：XX点过几分
 *   - 11-19 分：XX点十几分
 *   - 20-27 分：XX点二十多
 *   - 28-32 分：快XX点半
 *   - 33-37 分：XX点半刚过
 *   - 38-47 分：XX点XX十左右
 *   - 48-53 分：快XX+1点了
 *   - 54-59 分：马上XX+1点
 *
 * @param {number} hour - 小时 (0-23)
 * @param {number} minute - 分钟 (0-59)
 * @returns {string} 口语化时间表达
 */
export function formatTimeColloquially(hour, minute) {
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour

  // 特殊处理：整点前后
  if (minute === 0) {
    return `${numToCn(displayHour)}点整`
  }

  // 30 分钟的特殊表达
  if (minute === 30) {
    return `${numToCn(displayHour)}点半`
  }

  // 54-59: 马上XX点 / 快XX点了
  if (minute >= 54) {
    const nextHour = displayHour === 12 ? 1 : displayHour + 1
    if (minute >= 58) {
      return `马上${numToCn(nextHour)}点`
    }
    return `快${numToCn(nextHour)}点了`
  }

  // 48-53: 快XX+1点了（指下一个小时）
  if (minute >= 48) {
    const nextHour = displayHour === 12 ? 1 : displayHour + 1
    return `快${numToCn(nextHour)}点了`
  }

  // 38-47: XX点XX十左右
  if (minute >= 38) {
    const tens = Math.floor(minute / 10)
    return `${numToCn(displayHour)}点${CN_NUMBERS[tens]}十左右`
  }

  // 33-37: XX点半刚过
  if (minute >= 33) {
    return `${numToCn(displayHour)}点半刚过`
  }

  // 28-32: 快XX点半
  if (minute >= 28) {
    return `快${numToCn(displayHour)}点半`
  }

  // 20-27: XX点二十多
  if (minute >= 20) {
    return `${numToCn(displayHour)}点二十多`
  }

  // 11-19: XX点十几分
  if (minute >= 11) {
    return `${numToCn(displayHour)}点十几分`
  }

  // 6-10: XX点过几分
  if (minute >= 6) {
    return `${numToCn(displayHour)}点过几分`
  }

  // 1-5: XX点刚过
  return `${numToCn(displayHour)}点刚过`
}

/**
 * 获取时间段描述（简洁版，仅用英文 period 标识）
 * @param {number} hour - 小时 (0-23)
 * @returns {{ period: string }}
 */
function getTimePeriod(hour) {
  if (hour >= 5 && hour < 7) {
    return { period: '清晨' }
  }
  if (hour >= 7 && hour < 9) {
    return { period: '早晨' }
  }
  if (hour >= 9 && hour < 11) {
    return { period: '上午' }
  }
  if (hour >= 11 && hour < 13) {
    return { period: '中午' }
  }
  if (hour >= 13 && hour < 14) {
    return { period: '午后' }
  }
  if (hour >= 14 && hour < 17) {
    return { period: '下午' }
  }
  if (hour >= 17 && hour < 18) {
    return { period: '傍晚' }
  }
  if (hour >= 18 && hour < 21) {
    return { period: '晚上' }
  }
  if (hour >= 21 && hour < 23) {
    return { period: '夜晚' }
  }
  return { period: '深夜' }
}

/**
 * 格式化时间差为人类可读的字符串
 */
function formatDuration(diffMs) {
  if (diffMs < 60000) return '不到一分钟'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) {
    if (minutes <= 1) return '1分钟'
    if (minutes <= 5) return '几分钟'
    if (minutes <= 15) return '十几分钟'
    if (minutes <= 30) return '半个多小时'
    return `${minutes}分钟`
  }
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (hours < 24) {
    if (hours === 1) return remainMinutes > 0 ? `1小时${remainMinutes}分钟` : '1个小时'
    return remainMinutes > 0 ? `${hours}小时${remainMinutes}分钟` : `${hours}个小时`
  }
  const days = Math.floor(hours / 24)
  return `${days}天`
}

/**
 * 检查当前日期是否是特殊节日
 */
function checkHolidays(now) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${month}-${day}`
  return CHINESE_HOLIDAYS
    .filter((h) => h.pattern === dateStr)
    .map((h) => h.name)
}

/**
 * 生成简洁的时间上下文对象
 * @param {Array} messages - 当前对话历史
 * @returns {Object} 时间上下文
 */
export function generateTimeContext(messages) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekday = WEEKDAY_NAMES[now.getDay()]
  const hour = now.getHours()
  const minute = now.getMinutes()

  const timePeriod = getTimePeriod(hour)
  const colloquialTime = formatTimeColloquially(hour, minute)

  // 计算对话时长
  let durationStr = null
  if (messages && messages.length > 0) {
    const sortedMessages = [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    const firstMsg = sortedMessages[0]
    if (firstMsg && firstMsg.timestamp) {
      const diffMs = now.getTime() - firstMsg.timestamp
      if (diffMs > 60000) {
        durationStr = formatDuration(diffMs)
      }
    }
  }

  const holidays = checkHolidays(now)

  return {
    year,
    month,
    day,
    weekday,
    hour,
    minute,
    period: timePeriod.period,
    colloquialTime,
    durationStr,
    holidays,
    isNight: hour >= 18 || hour < 6,
  }
}

/**
 * 将时间上下文格式化为极简系统提示词注入文本
 * 核心原则：用最少 Token 让 AI 理解时间环境，避免机械报时
 *
 * @param {Object} timeContext - generateTimeContext 的返回值
 * @returns {string}
 */
export function formatTimeContextForPrompt(timeContext) {
  const parts = []

  // ===== 极简时间注入 =====
  parts.push(`当前时间：${timeContext.colloquialTime}（${timeContext.period}）。`)

  // ===== 时间提及限制规则 =====
  parts.push('')
  parts.push('【时间使用规则】')
  parts.push('时间只作为环境信息。只有在以下情况才自然地提及时间：')
  parts.push('  1. 用户直接询问时间（如"现在几点了"、"什么时间了"）')
  parts.push('  2. 用户话题涉及作息、吃饭、睡觉、出门、天气等时间相关内容')
  parts.push('  3. 首次与用户聊天，或距离上次聊天已过去很久')
  parts.push('  4. 其他你认为有必要自然提及的少数情况')
  parts.push('平时不要每句话都报时，避免机械地说"现在XX点"、"早上好"等。')

  // ===== 对话时长（如果有）=====
  if (timeContext.durationStr) {
    parts.push('')
    parts.push(`你们已经聊了大约${timeContext.durationStr}。时间流逝感要与实际一致。`)
  }

  // ===== 节日提醒 =====
  if (timeContext.holidays && timeContext.holidays.length > 0) {
    parts.push('')
    const holidayNames = timeContext.holidays.join('、')
    parts.push(`今天是${holidayNames}，可以自然地送上祝福或聊节日相关话题。`)
  }

  return parts.join('\n')
}