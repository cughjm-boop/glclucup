import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from '../services/storage'
import { sendChatMessage } from '../services/api'

// 默认设置
const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
  ttsProvider: 'web-speech',
  elevenLabsApiKey: '',
  theme: 'system', // 'system' | 'light' | 'dark'
}

const DEFAULT_VOICE_SETTINGS = {
  autoPlay: true,
  voiceIndex: 0,
  voiceURI: '',
  speed: 1.0,
  pitch: 1.0,
  clonedVoiceId: null,
  clonedVoiceName: '',
  clonedProvider: null, // 'elevenlabs' | 'simulated' | null
  simulatedClone: null, // 模拟克隆的完整分析结果
}

// 应用主题到 document
function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

const useStore = create((set, get) => ({
  // ===== 状态 =====
  characters: loadFromStorage(STORAGE_KEYS.CHARACTERS) || [],
  messages: loadFromStorage(STORAGE_KEYS.MESSAGES) || {},
  currentCharacterId: null,
  settings: { ...DEFAULT_SETTINGS, ...(loadFromStorage(STORAGE_KEYS.SETTINGS) || {}) },
  voiceSettings: { ...DEFAULT_VOICE_SETTINGS, ...(loadFromStorage(STORAGE_KEYS.VOICE_SETTINGS) || {}) },
  isLoading: false,
  error: null,
  view: 'chat',
  editingCharacterId: null,

  // 初始化主题
  initTheme: () => {
    const { settings } = get()
    applyTheme(settings.theme || 'system')
    // 监听系统主题变化
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (get().settings.theme === 'system') {
        applyTheme('system')
      }
    }
    mq.addEventListener('change', handler)
  },

  setTheme: (theme) => {
    const settings = { ...get().settings, theme }
    set({ settings })
    saveToStorage(STORAGE_KEYS.SETTINGS, settings)
    applyTheme(theme)
  },

  // ===== 角色管理 =====
  createCharacter: (characterData) => {
    const newCharacter = {
      id: uuidv4(),
      ...characterData,
      voiceSettings: characterData.voiceSettings || { ...DEFAULT_VOICE_SETTINGS },
      avatar: characterData.avatar || '',
      createdAt: Date.now(),
    }
    const characters = [...get().characters, newCharacter]
    set({ characters, view: 'chat', currentCharacterId: newCharacter.id })
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
    return newCharacter
  },

  updateCharacter: (id, characterData) => {
    const characters = get().characters.map((c) =>
      c.id === id ? { ...c, ...characterData } : c
    )
    set({ characters, view: 'chat', editingCharacterId: null })
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
  },

  deleteCharacter: (id) => {
    const characters = get().characters.filter((c) => c.id !== id)
    const messages = { ...get().messages }
    delete messages[id]

    const updates = { characters, messages }
    if (get().currentCharacterId === id) {
      updates.currentCharacterId = characters.length > 0 ? characters[0].id : null
    }

    set(updates)
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
    saveToStorage(STORAGE_KEYS.MESSAGES, messages)
  },

  setCurrentCharacter: (id) => {
    set({ currentCharacterId: id, view: 'chat' })
  },

  // ===== 导入记忆 =====
  setCharacterMemory: (characterId, memoryMessages) => {
    const characters = get().characters.map((c) =>
      c.id === characterId ? { ...c, importedMemory: memoryMessages } : c
    )
    set({ characters })
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
  },

  clearCharacterMemory: (characterId) => {
    const characters = get().characters.map((c) => {
      if (c.id === characterId) {
        const { importedMemory, ...rest } = c
        return rest
      }
      return c
    })
    set({ characters })
    saveToStorage(STORAGE_KEYS.CHARACTERS, characters)
  },

  // ===== 消息管理 =====
  sendMessage: async (content) => {
    const { currentCharacterId, characters, messages, settings } = get()
    if (!currentCharacterId || !content.trim()) return

    const character = characters.find((c) => c.id === currentCharacterId)
    if (!character) return

    const userMessage = {
      id: uuidv4(),
      characterId: currentCharacterId,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    }

    const charMessages = messages[currentCharacterId] || []
    const updatedMessages = {
      ...messages,
      [currentCharacterId]: [...charMessages, userMessage],
    }

    set({ messages: updatedMessages, isLoading: true, error: null })
    saveToStorage(STORAGE_KEYS.MESSAGES, updatedMessages)

    try {
      const conversationHistory = [...charMessages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const reply = await sendChatMessage(conversationHistory, character, settings)

      const assistantMessage = {
        id: uuidv4(),
        characterId: currentCharacterId,
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      }

      const finalMessages = {
        ...get().messages,
        [currentCharacterId]: [...(get().messages[currentCharacterId] || []), assistantMessage],
      }

      set({ messages: finalMessages, isLoading: false })
      saveToStorage(STORAGE_KEYS.MESSAGES, finalMessages)
    } catch (err) {
      set({ isLoading: false, error: err.message })
      const reverted = {
        ...get().messages,
        [currentCharacterId]: charMessages,
      }
      set({ messages: reverted })
      saveToStorage(STORAGE_KEYS.MESSAGES, reverted)
    }
  },

  clearMessages: (characterId) => {
    const messages = { ...get().messages }
    delete messages[characterId]
    set({ messages })
    saveToStorage(STORAGE_KEYS.MESSAGES, messages)
  },

  clearError: () => set({ error: null }),

  // ===== 导出聊天记录 =====
  exportChatHistory: (characterId, format = 'json') => {
    const { characters, messages } = get()
    const character = characters.find((c) => c.id === characterId)
    const charMessages = messages[characterId] || []

    let content, filename, mimeType

    const dateStr = new Date().toISOString().slice(0, 10)
    const safeName = (character?.name || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')

    if (format === 'json') {
      content = JSON.stringify({
        exportedAt: new Date().toISOString(),
        character: {
          name: character?.name,
          identity: character?.identity,
          personality: character?.personality,
          speakingStyle: character?.speakingStyle,
          relationship: character?.relationship,
          backstory: character?.backstory,
        },
        messages: charMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp).toISOString(),
        })),
      }, null, 2)
      filename = `${safeName}_${dateStr}.json`
      mimeType = 'application/json'
    } else {
      // TXT format
      const lines = [
        `=== ${character?.name || '未知角色'} 聊天记录 ===`,
        `导出时间: ${new Date().toLocaleString()}`,
        `角色介绍: ${character?.identity || '无'}`,
        `角色性格: ${character?.personality || '无'}`,
        ``,
        `--- 对话内容 ---`,
        ``,
      ]
      charMessages.forEach((m) => {
        const role = m.role === 'user' ? '用户' : character?.name || 'AI'
        const time = new Date(m.timestamp).toLocaleString()
        lines.push(`[${time}] ${role}:`)
        lines.push(m.content)
        lines.push('')
      })
      content = lines.join('\n')
      filename = `${safeName}_${dateStr}.txt`
      mimeType = 'text/plain'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  // ===== 设置管理 =====
  updateSettings: (newSettings) => {
    const settings = { ...get().settings, ...newSettings }
    set({ settings })
    saveToStorage(STORAGE_KEYS.SETTINGS, settings)
    if (newSettings.theme !== undefined) {
      applyTheme(newSettings.theme)
    }
  },

  updateVoiceSettings: (newVoiceSettings) => {
    const voiceSettings = { ...get().voiceSettings, ...newVoiceSettings }
    set({ voiceSettings })
    saveToStorage(STORAGE_KEYS.VOICE_SETTINGS, voiceSettings)
  },

  // ===== 视图管理 =====
  setView: (view, editingCharacterId = null) => {
    set({ view, editingCharacterId })
  },

  getCurrentCharacter: () => {
    const { currentCharacterId, characters } = get()
    return characters.find((c) => c.id === currentCharacterId) || null
  },

  getCurrentMessages: () => {
    const { currentCharacterId, messages } = get()
    return currentCharacterId ? messages[currentCharacterId] || [] : []
  },
}))

export default useStore