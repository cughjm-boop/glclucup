import { useState, useRef, useEffect } from 'react'
import useStore from '../store/useStore'
import ImportChatDialog from './ImportChatDialog'
import VoiceSettings from './VoiceSettings'

const EMPTY_FORM = {
  name: '',
  avatar: '',
  identity: '',
  personality: '',
  speakingStyle: '',
  relationship: '',
  openingLine: '',
  backstory: '',
}

const DEFAULT_VOICE_SETTINGS = {
  autoPlay: true,
  voiceIndex: 0,
  voiceURI: '',
  speed: 1.0,
  pitch: 1.0,
  clonedVoiceId: null,
  clonedVoiceName: '',
  clonedProvider: null,
  simulatedClone: null,
}

export default function CharacterForm() {
  const {
    view,
    editingCharacterId,
    characters,
    createCharacter,
    updateCharacter,
    setView,
    setCharacterMemory,
    clearCharacterMemory,
  } = useStore()

  const isEditing = view === 'edit'
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [pendingMemory, setPendingMemory] = useState(null) // 创建模式下的暂存记忆
  const [formVoiceSettings, setFormVoiceSettings] = useState(DEFAULT_VOICE_SETTINGS)
  const fileInputRef = useRef(null)

  const editingChar = isEditing && editingCharacterId
    ? characters.find((c) => c.id === editingCharacterId)
    : null
  const memoryCount = isEditing
    ? (editingChar?.importedMemory?.length || 0)
    : (pendingMemory?.length || 0)

  useEffect(() => {
    if (isEditing && editingCharacterId) {
      const char = characters.find((c) => c.id === editingCharacterId)
      if (char) {
        setForm({
          name: char.name || '',
          avatar: char.avatar || '',
          identity: char.identity || '',
          personality: char.personality || '',
          speakingStyle: char.speakingStyle || '',
          relationship: char.relationship || '',
          openingLine: char.openingLine || '',
          backstory: char.backstory || '',
        })
        // 加载角色的语音设置
        if (char.voiceSettings) {
          setFormVoiceSettings({ ...DEFAULT_VOICE_SETTINGS, ...char.voiceSettings })
        } else {
          setFormVoiceSettings(DEFAULT_VOICE_SETTINGS)
        }
      }
    } else {
      setForm(EMPTY_FORM)
      setFormVoiceSettings(DEFAULT_VOICE_SETTINGS)
      setPendingMemory(null)
    }
    setErrors({})
  }, [isEditing, editingCharacterId, characters])

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, avatar: '请选择图片文件' }))
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, avatar: '图片大小不能超过 5MB' }))
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      updateField('avatar', event.target.result)
    }
    reader.readAsDataURL(file)
  }

  const removeAvatar = () => {
    updateField('avatar', '')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const validate = () => {
    const newErrors = {}
    if (!form.name.trim()) newErrors.name = '请输入角色名字'
    if (!form.personality.trim()) newErrors.personality = '请输入角色性格'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const data = {
      name: form.name.trim(),
      avatar: form.avatar,
      identity: form.identity.trim(),
      personality: form.personality.trim(),
      speakingStyle: form.speakingStyle.trim(),
      relationship: form.relationship.trim(),
      openingLine: form.openingLine.trim(),
      backstory: form.backstory.trim(),
      voiceSettings: { ...formVoiceSettings },
    }

    if (isEditing && editingCharacterId) {
      updateCharacter(editingCharacterId, data)
    } else {
      const newChar = createCharacter(data)
      // 创建后如果有暂存记忆，写入角色
      if (pendingMemory && pendingMemory.length > 0 && newChar) {
        setCharacterMemory(newChar.id, pendingMemory)
      }
    }
  }

  const handleImport = (messages) => {
    if (isEditing && editingCharacterId) {
      setCharacterMemory(editingCharacterId, messages)
    } else {
      // 创建模式：暂存记忆
      setPendingMemory(messages)
    }
    setShowImportDialog(false)
  }

  const handleClearMemory = () => {
    if (isEditing && editingCharacterId) {
      if (confirm('确定要清除导入的记忆吗？')) {
        clearCharacterMemory(editingCharacterId)
      }
    } else {
      setPendingMemory(null)
    }
  }

  const inputClass = (field) =>
    `ios-input ${errors[field] ? 'border-red-300 dark:border-red-500 focus:border-red-400 focus:ring-red-200' : ''}`

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 animate-fade-in">
      <div className="ios-card p-6 mx-4 w-full max-w-lg animate-bounce-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {isEditing ? '编辑角色' : '创建角色'}
          </h2>
          <button
            onClick={() => setView('chat')}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Avatar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">头像</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center flex-shrink-0">
                {form.avatar ? (
                  <img src={form.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-semibold text-ios-blue">
                    {form.name?.charAt(0) || '?'}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="ios-button-secondary text-xs py-2 px-4"
                >
                  上传图片
                </button>
                {form.avatar && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    className="text-xs text-red-500 dark:text-red-400 hover:text-red-600 transition-colors"
                  >
                    移除头像
                  </button>
                )}
              </div>
            </div>
            {errors.avatar && <p className="text-xs text-red-500 mt-1">{errors.avatar}</p>}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              角色名字 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="例如：小月、林医生、Arthur..."
              className={inputClass('name')}
              maxLength={20}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Identity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">身份</label>
            <input
              type="text"
              value={form.identity}
              onChange={(e) => updateField('identity', e.target.value)}
              placeholder="例如：高中生、咖啡店老板、私家侦探..."
              className="ios-input"
              maxLength={50}
            />
          </div>

          {/* Personality */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              性格 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.personality}
              onChange={(e) => updateField('personality', e.target.value)}
              placeholder="例如：温柔体贴、有点傲娇、喜欢开玩笑、偶尔毒舌..."
              className={inputClass('personality')}
              rows={2}
              maxLength={200}
            />
            {errors.personality && <p className="text-xs text-red-500 mt-1">{errors.personality}</p>}
          </div>

          {/* Speaking Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">说话风格</label>
            <input
              type="text"
              value={form.speakingStyle}
              onChange={(e) => updateField('speakingStyle', e.target.value)}
              placeholder="例如：喜欢用颜文字、文绉绉的、简洁直接..."
              className="ios-input"
              maxLength={100}
            />
          </div>

          {/* Relationship */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">与用户的关系</label>
            <input
              type="text"
              value={form.relationship}
              onChange={(e) => updateField('relationship', e.target.value)}
              placeholder="例如：青梅竹马、导师、网友、同事..."
              className="ios-input"
              maxLength={50}
            />
          </div>

          {/* Opening Line */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">开场白</label>
            <textarea
              value={form.openingLine}
              onChange={(e) => updateField('openingLine', e.target.value)}
              placeholder="打开聊天时 AI 自动发送的第一句话..."
              className="ios-textarea"
              rows={2}
              maxLength={300}
            />
          </div>

          {/* Backstory */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">角色介绍 / 相遇场景</label>
            <textarea
              value={form.backstory}
              onChange={(e) => updateField('backstory', e.target.value)}
              placeholder="描述角色的背景故事、与用户的相遇场景，帮助 AI 更好地理解角色..."
              className="ios-textarea"
              rows={3}
              maxLength={500}
            />
          </div>

          {/* 记忆导入区块 */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              导入聊天记录（记忆迁移）
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              从其他平台导入聊天记录作为角色记忆，让 AI 无缝延续之前的对话
            </p>

            {memoryCount > 0 ? (
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="flex-1">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    已导入 <span className="font-semibold text-ios-blue">{memoryCount}</span> 条记忆
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImportDialog(true)}
                  className="ios-button-secondary text-xs py-2 px-3"
                >
                  重新导入
                </button>
                <button
                  type="button"
                  onClick={handleClearMemory}
                  className="text-xs text-red-500 dark:text-red-400 hover:text-red-600 px-2 py-2"
                >
                  清除
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowImportDialog(true)}
                className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl
                           hover:border-ios-blue dark:hover:border-ios-blue transition-colors
                           text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                导入聊天记录
              </button>
            )}
          </div>

          {/* 语音预设区块 */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <VoiceSettings
              voiceSettings={formVoiceSettings}
              onChange={(updates) => setFormVoiceSettings((prev) => ({ ...prev, ...updates }))}
              compact
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setView('chat')}
              className="flex-1 ios-button-secondary"
            >
              取消
            </button>
            <button type="submit" className="flex-1 ios-button">
              {isEditing ? '保存修改' : '创建角色'}
            </button>
          </div>
        </form>
      </div>

      {/* Import dialog */}
      {showImportDialog && (
        <ImportChatDialog
          onImport={handleImport}
          onCancel={() => setShowImportDialog(false)}
          existingMemory={isEditing ? editingChar?.importedMemory : pendingMemory}
        />
      )}
    </div>
  )
}