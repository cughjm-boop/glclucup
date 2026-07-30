const STORAGE_KEYS = {
  CHARACTERS: 'ai-chat-characters',
  MESSAGES: 'ai-chat-messages',
  SETTINGS: 'ai-chat-settings',
  VOICE_SETTINGS: 'ai-chat-voice-settings',
}

export function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.error('Failed to save to localStorage:', e)
  }
}

export function removeFromStorage(key) {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    console.error('Failed to remove from localStorage:', e)
  }
}

export { STORAGE_KEYS }