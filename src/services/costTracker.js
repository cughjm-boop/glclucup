/**
 * Token 成本追踪服务
 * 基于 DeepSeek 定价：输入 1元/百万token，输出 2元/百万token
 * 所有数据本地存储，按月重置
 * 支持按角色分别统计
 */

import { loadFromStorage, saveToStorage, STORAGE_KEYS } from './storage'

// 定价（元/百万token）
const PRICING = {
  input: 1.0,
  output: 2.0,
}

// 新增存储键
const USAGE_STATS_KEY = 'ai-chat-usage-stats'

/**
 * 获取用量统计数据
 */
export function getUsageStats() {
  const stored = loadFromStorage(USAGE_STATS_KEY)
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return {
    monthly: {},           // { '2026-08': { inputTokens, outputTokens, cost, characterStats: { [charId]: { inputTokens, outputTokens, cost } } } }
    sessionInputTokens: 0,  // 本次会话
    sessionOutputTokens: 0,
    sessionCost: 0,
    ...stored,
    // 确保当月数据存在
    monthly: {
      ...(stored?.monthly || {}),
      [monthKey]: {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        characterStats: {},
        ...(stored?.monthly?.[monthKey] || {}),
      },
    },
  }
}

/**
 * 保存用量统计数据
 */
function saveUsageStats(data) {
  saveToStorage(USAGE_STATS_KEY, data)
}

/**
 * 记录 API 调用消耗（增强版，支持 API 返回的 usage 字段和按角色追踪）
 */
export function recordCost(inputText, outputText, taskType = 'chat', characterId = null, apiUsage = null) {
  const data = getUsageStats()
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 优先使用 API 返回的 usage 数据，否则估算
  let inputTokens, outputTokens
  if (apiUsage && (apiUsage.prompt_tokens || apiUsage.completion_tokens)) {
    inputTokens = apiUsage.prompt_tokens || 0
    outputTokens = apiUsage.completion_tokens || 0
  } else {
    inputTokens = estimateTokens(inputText)
    outputTokens = estimateTokens(outputText)
  }
  const cost = (inputTokens / 1_000_000) * PRICING.input + (outputTokens / 1_000_000) * PRICING.output

  // 确保当月数据存在
  if (!data.monthly[monthKey]) {
    data.monthly[monthKey] = {
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      characterStats: {},
    }
  }

  data.monthly[monthKey].inputTokens += inputTokens
  data.monthly[monthKey].outputTokens += outputTokens
  data.monthly[monthKey].cost += cost

  // 按角色统计
  if (characterId) {
    if (!data.monthly[monthKey].characterStats[characterId]) {
      data.monthly[monthKey].characterStats[characterId] = {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      }
    }
    data.monthly[monthKey].characterStats[characterId].inputTokens += inputTokens
    data.monthly[monthKey].characterStats[characterId].outputTokens += outputTokens
    data.monthly[monthKey].characterStats[characterId].cost += cost
  }

  // 会话统计
  data.sessionInputTokens += inputTokens
  data.sessionOutputTokens += outputTokens
  data.sessionCost += cost

  saveUsageStats(data)

  // 同时更新旧的 costData 存储（兼容）
  const oldData = getCostData()
  if (!oldData.monthly[monthKey]) {
    oldData.monthly[monthKey] = { inputTokens: 0, outputTokens: 0, cost: 0, tasks: {} }
  }
  oldData.monthly[monthKey].inputTokens += inputTokens
  oldData.monthly[monthKey].outputTokens += outputTokens
  oldData.monthly[monthKey].cost += cost
  if (!oldData.monthly[monthKey].tasks[taskType]) {
    oldData.monthly[monthKey].tasks[taskType] = { count: 0, cost: 0 }
  }
  oldData.monthly[monthKey].tasks[taskType].count++
  oldData.monthly[monthKey].tasks[taskType].cost += cost
  oldData.totalInputTokens += inputTokens
  oldData.totalOutputTokens += outputTokens
  oldData.totalCost += cost
  saveToStorage(STORAGE_KEYS.COST_DATA, oldData)

  return { inputTokens, outputTokens, cost, estimated: !apiUsage || (!apiUsage.prompt_tokens && !apiUsage.completion_tokens) }
}

/**
 * 重置本月统计
 */
export function resetMonthlyStats() {
  const data = getUsageStats()
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  data.monthly[monthKey] = {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    characterStats: {},
  }
  saveUsageStats(data)
}

/**
 * 导出用量报告
 */
export function exportUsageReport(format = 'json') {
  const data = getUsageStats()
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentMonth = data.monthly[monthKey] || { inputTokens: 0, outputTokens: 0, cost: 0, characterStats: {} }

  if (format === 'json') {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      pricing: PRICING,
      session: {
        inputTokens: data.sessionInputTokens,
        outputTokens: data.sessionOutputTokens,
        cost: data.sessionCost,
      },
      currentMonth: {
        month: monthKey,
        inputTokens: currentMonth.inputTokens,
        outputTokens: currentMonth.outputTokens,
        totalTokens: currentMonth.inputTokens + currentMonth.outputTokens,
        cost: currentMonth.cost,
        characterStats: currentMonth.characterStats,
      },
      history: Object.entries(data.monthly).map(([month, stats]) => ({
        month,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        totalTokens: stats.inputTokens + stats.outputTokens,
        cost: stats.cost,
      })),
    }, null, 2)
  } else {
    // TXT format
    const lines = []
    lines.push('========== Token 用量报告 ==========')
    lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`)
    lines.push(`定价：输入 ${PRICING.input} 元/百万token，输出 ${PRICING.output} 元/百万token`)
    lines.push('')
    lines.push('--- 本次会话 ---')
    lines.push(`输入 Token：${data.sessionInputTokens.toLocaleString()}`)
    lines.push(`输出 Token：${data.sessionOutputTokens.toLocaleString()}`)
    lines.push(`总 Token：${(data.sessionInputTokens + data.sessionOutputTokens).toLocaleString()}`)
    lines.push(`费用：¥${data.sessionCost.toFixed(4)}`)
    lines.push('')
    lines.push(`--- 当月累计 (${monthKey}) ---`)
    lines.push(`输入 Token：${currentMonth.inputTokens.toLocaleString()}`)
    lines.push(`输出 Token：${currentMonth.outputTokens.toLocaleString()}`)
    lines.push(`总 Token：${(currentMonth.inputTokens + currentMonth.outputTokens).toLocaleString()}`)
    lines.push(`费用：¥${currentMonth.cost.toFixed(4)}`)
    if (Object.keys(currentMonth.characterStats).length > 0) {
      lines.push('')
      lines.push('--- 按角色统计 ---')
      Object.entries(currentMonth.characterStats).forEach(([charId, stats]) => {
        lines.push(`角色 ${charId}：输入 ${stats.inputTokens.toLocaleString()}，输出 ${stats.outputTokens.toLocaleString()}，费用 ¥${stats.cost.toFixed(4)}`)
      })
    }
    lines.push('')
    lines.push('--- 历史月度 ---')
    Object.entries(data.monthly).forEach(([month, stats]) => {
      lines.push(`${month}：总 Token ${(stats.inputTokens + stats.outputTokens).toLocaleString()}，费用 ¥${stats.cost.toFixed(4)}`)
    })
    return lines.join('\n')
  }
}

// 模式配置
export const MEMORY_MODES = {
  eco: {
    label: '省电',
    icon: '🌱',
    budget: 1.0,
    desc: '月限1元，降低增强功能频率',
    deepReflection: 3,
    associationNetwork: 0,
    emotionSensing: true,
    monologue: 0,
    smartTopic: 0,
    anniversary: true,
  },
  standard: {
    label: '标准',
    icon: '⭐',
    budget: 5.0,
    desc: '月限5元，推荐配置',
    deepReflection: 1,
    associationNetwork: 3,
    emotionSensing: true,
    monologue: 2,
    smartTopic: 1,
    anniversary: true,
  },
  ultimate: {
    label: '极致',
    icon: '💎',
    budget: 10.0,
    desc: '月限10元，全部功能最高频率',
    deepReflection: 1,
    associationNetwork: 2,
    emotionSensing: true,
    monologue: 1,
    smartTopic: 1,
    anniversary: true,
  },
}

/**
 * 估算 token 数量
 */
export function estimateTokens(text) {
  if (!text) return 0
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.4)
}

/**
 * 获取成本数据（旧版兼容）
 */
export function getCostData() {
  const stored = loadFromStorage(STORAGE_KEYS.COST_DATA)
  return {
    monthly: {},
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    ...stored,
  }
}

/**
 * 获取当月成本
 */
export function getCurrentMonthCost() {
  const data = getCostData()
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return data.monthly[monthKey] || { inputTokens: 0, outputTokens: 0, cost: 0, tasks: {} }
}

/**
 * 获取当前模式
 */
export function getMemoryMode() {
  return loadFromStorage(STORAGE_KEYS.MEMORY_MODE) || 'standard'
}

/**
 * 设置模式
 */
export function setMemoryMode(mode) {
  if (MEMORY_MODES[mode]) {
    saveToStorage(STORAGE_KEYS.MEMORY_MODE, mode)
  }
}

/**
 * 检查是否超出预算
 */
export function isOverBudget() {
  const mode = getMemoryMode()
  const budget = MEMORY_MODES[mode]?.budget || 5
  const monthCost = getCurrentMonthCost()
  return monthCost.cost >= budget
}

/**
 * 检查是否允许执行某任务
 */
export function canRunTask(taskName) {
  const mode = getMemoryMode()
  const config = MEMORY_MODES[mode]
  if (!config) return false
  if (config[taskName] === undefined) return true
  if (config[taskName] === 0) return false
  if (config[taskName] === true) return true
  return true
}

/**
 * 获取任务频率配置
 */
export function getTaskFrequency(taskName) {
  const mode = getMemoryMode()
  const config = MEMORY_MODES[mode]
  if (!config || config[taskName] === undefined) return 0
  return config[taskName]
}