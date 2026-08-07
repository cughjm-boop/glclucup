import { useState, useRef, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import useStore, { WORLDVIEW_OPTIONS, getWorldviewSummary } from '../store/useStore'
import ImportChatDialog from './ImportChatDialog'
import AvatarCropper from './AvatarCropper'
import { findCharacter } from '../services/characterDataService'

const EMPTY_FORM = {
  name: '',
  avatar: '',
  identity: '',
  personality: '',
  speakingStyle: '',
  relationship: '',
  openingLine: '',
  backstory: '',
  worldview: '',
  srCharacterRef: '',
}

/**
 * 检测角色是否在星穹铁道官方角色库中
 * @returns {Object|null} 官方角色数据，或 null
 */
function findOfficialCharacter(character) {
  if (!character || character.worldview !== 'star_rail') return null
  const ref = character.srCharacterRef || character.name
  return findCharacter(ref)
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
    transferMemories,
  } = useStore()

  const isEditing = view === 'edit'
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showExtractImport, setShowExtractImport] = useState(false)
  const [pendingMemory, setPendingMemory] = useState(null)
  const [tempCharId] = useState(() => uuidv4())
  const fileInputRef = useRef(null)

  const [showWorldviewPreview, setShowWorldviewPreview] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState(null)
  const [showCropper, setShowCropper] = useState(false)
  const [showLockInfo, setShowLockInfo] = useState(false)
  const [personalityMicro, setPersonalityMicro] = useState('')

  const editingChar = isEditing && editingCharacterId
    ? characters.find((c) => c.id === editingCharacterId)
    : null
  const officialChar = isEditing ? findOfficialCharacter(editingChar) : null
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
          worldview: char.worldview || '',
          srCharacterRef: char.srCharacterRef || '',
        })
        // 检测官方角色，提取微调部分
        const offChar = findOfficialCharacter(char)
        if (offChar && offChar.personality && char.personality) {
          const officialPersonality = offChar.personality.join('、')
          if (char.personality !== officialPersonality) {
            setPersonalityMicro(char.personality)
          } else {
            setPersonalityMicro('')
          }
        } else {
          setPersonalityMicro('')
        }
      }
    } else {
      setForm(EMPTY_FORM)
      setPendingMemory(null)
      setPersonalityMicro('')
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
    if (file.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, avatar: '图片大小不能超过 10MB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      setCropImageSrc(event.target.result)
      setShowCropper(true)
    }
    reader.readAsDataURL(file)
  }

  const handleCropComplete = (croppedImage) => {
    updateField('avatar', croppedImage)
    setShowCropper(false)
    setCropImageSrc(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropCancel = () => {
    setShowCropper(false)
    setCropImageSrc(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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
      identity: officialChar ? (officialChar.identity || form.identity) : form.identity.trim(),
      personality: officialChar
        ? (personalityMicro.trim() || (officialChar.personality || []).join('、'))
        : form.personality.trim(),
      speakingStyle: form.speakingStyle.trim(),
      relationship: form.relationship.trim(),
      openingLine: form.openingLine.trim(),
      backstory: officialChar ? (form.backstory || officialChar.story_summary || '') : form.backstory.trim(),
      worldview: form.worldview,
      srCharacterRef: form.srCharacterRef,
    }

    if (isEditing && editingCharacterId) {
      updateCharacter(editingCharacterId, data)
    } else {
      const newChar = createCharacter(data)
      if (pendingMemory && pendingMemory.length > 0 && newChar) {
        setCharacterMemory(newChar.id, pendingMemory)
      }
      if (newChar && tempCharId) {
        transferMemories(tempCharId, newChar.id)
      }
    }
  }

  const handleImport = (messages) => {
    if (isEditing && editingCharacterId) {
      setCharacterMemory(editingCharacterId, messages)
    } else {
      setPendingMemory(messages)
    }
    setShowImportDialog(false)
  }

  const handleExtractImport = (result) => {
    if (!isEditing && result?.memories?.length > 0) {
      setPendingMemory(result.memories)
    }
    setShowExtractImport(false)
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              头像
              
            </label>
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

          {/* 选择世界观 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              选择世界观
            </label>
            <div className="flex gap-2">
              <select
                value={form.worldview || ''}
                onChange={(e) => {
                  const val = e.target.value
                  updateField('worldview', val)
                  if (!val) {
                    updateField('srCharacterRef', '')
                  }
                }}
                className="flex-1 ios-input"
              >
                {WORLDVIEW_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {form.worldview === 'star_rail' && (
                <button
                  type="button"
                  onClick={() => setShowWorldviewPreview(true)}
                  className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
                             flex items-center justify-center transition-colors flex-shrink-0"
                  title="查看世界观摘要"
                >
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
            </div>
            {form.worldview === 'star_rail' && (
              <p className="mt-1.5 text-xs text-ios-blue dark:text-ios-blue">
                已选择「星穹铁道」世界观，角色对话时将自动注入该世界观的背景设定。
              </p>
            )}
            {!form.worldview && (
              <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                不套用预设世界观，角色设定完全由你手动填写。
              </p>
            )}
          </div>

          {/* Identity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              身份
              {officialChar && (
                <button
                  type="button"
                  onClick={() => setShowLockInfo(!showLockInfo)}
                  className="inline-flex items-center ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="官方设定"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] ml-0.5 text-gray-400">官方设定</span>
                </button>
              )}
            </label>
            {officialChar ? (
              <div className="relative">
                <input
                  type="text"
                  value={officialChar.identity || ''}
                  disabled
                  className="ios-input bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
              </div>
            ) : (
              <input
                type="text"
                value={form.identity}
                onChange={(e) => updateField('identity', e.target.value)}
                placeholder="例如：高中生、咖啡店老板、私家侦探..."
                className="ios-input"
                maxLength={50}
              />
            )}
          </div>

          {/* Personality */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              性格 <span className="text-red-400">*</span>
              {officialChar && (
                <button
                  type="button"
                  onClick={() => setShowLockInfo(!showLockInfo)}
                  className="inline-flex items-center ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="官方设定"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] ml-0.5 text-gray-400">官方设定</span>
                </button>
              )}
            </label>
            {officialChar ? (
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">官方性格（不可编辑）</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {(officialChar.personality || []).join('、')}
                  </p>
                </div>
                <label className="block text-xs text-gray-400 dark:text-gray-500">
                  微调（可选，如"更害羞一点"、"比平时更开朗"）
                </label>
                <input
                  type="text"
                  value={personalityMicro}
                  onChange={(e) => setPersonalityMicro(e.target.value)}
                  placeholder="在官方性格基础上微调..."
                  className="ios-input"
                  maxLength={100}
                />
              </div>
            ) : (
              <textarea
                value={form.personality}
                onChange={(e) => updateField('personality', e.target.value)}
                placeholder="例如：温柔体贴、有点傲娇、喜欢开玩笑、偶尔毒舌..."
                className={inputClass('personality')}
                rows={2}
                maxLength={200}
              />
            )}
            {errors.personality && <p className="text-xs text-red-500 mt-1">{errors.personality}</p>}
          </div>

          {/* Speaking Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              说话风格
            </label>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              与用户的关系
            </label>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              开场白
            </label>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              角色介绍 / 相遇场景
              {officialChar && (
                <button
                  type="button"
                  onClick={() => setShowLockInfo(!showLockInfo)}
                  className="inline-flex items-center ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="官方设定"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] ml-0.5 text-gray-400">官方设定</span>
                </button>
              )}
            </label>
            {officialChar ? (
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">官方背景（不可编辑）</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {officialChar.story_summary || '暂无官方背景故事'}
                  </p>
                </div>
                <label className="block text-xs text-gray-400 dark:text-gray-500">
                  相遇场景（可编辑）
                </label>
                <textarea
                  value={form.backstory}
                  onChange={(e) => updateField('backstory', e.target.value)}
                  placeholder="描述与用户的相遇场景..."
                  className="ios-textarea"
                  rows={2}
                  maxLength={300}
                />
              </div>
            ) : (
              <textarea
                value={form.backstory}
                onChange={(e) => updateField('backstory', e.target.value)}
                placeholder="描述角色的背景故事、与用户的相遇场景，帮助 AI 更好地理解角色..."
                className="ios-textarea"
                rows={3}
                maxLength={500}
              />
            )}
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
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowExtractImport(true)}
                  className="w-full py-3 border-2 border-dashed border-ios-blue dark:border-ios-blue rounded-xl
                             text-sm text-ios-blue dark:text-ios-blue flex items-center justify-center gap-2
                             hover:bg-ios-blue/5 dark:hover:bg-ios-blue/10 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  导入外部聊天记录并自动提取记忆
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportDialog(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl
                             hover:border-ios-blue dark:hover:border-ios-blue transition-colors
                             text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                  </svg>
                  导入原始聊天记录（仅作为上下文）
                </button>
              </div>
            )}
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

      {/* Worldview preview modal */}
      {showWorldviewPreview && (
        <WorldviewPreviewModal
          worldviewKey={form.worldview}
          onClose={() => setShowWorldviewPreview(false)}
        />
      )}

      {/* Import dialog - 原始聊天记录导入 */}
      {showImportDialog && (
        <ImportChatDialog
          characterId={isEditing ? editingCharacterId : tempCharId}
          onImport={handleImport}
          onCancel={() => setShowImportDialog(false)}
          existingMemory={isEditing ? editingChar?.importedMemory : pendingMemory}
        />
      )}

      {/* Extract import dialog - 外部聊天记录提取记忆 */}
      {showExtractImport && (
        <ImportChatDialog
          characterId={isEditing ? editingCharacterId : tempCharId}
          onImport={handleExtractImport}
          onCancel={() => setShowExtractImport(false)}
          existingMemory={isEditing ? editingChar?.importedMemory : pendingMemory}
          mode="extract"
        />
      )}

      {/* Avatar cropper */}
      {showCropper && cropImageSrc && (
        <AvatarCropper
          imageSrc={cropImageSrc}
          onComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

      {/* Lock info tooltip */}
      {showLockInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowLockInfo(false)}>
          <div className="ios-card p-5 mx-4 max-w-sm w-full animate-bounce-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">官方设定锁定</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  此内容为「崩坏：星穹铁道」官方角色设定，不可编辑。如需完全自定义角色设定，请创建原创角色。
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  可编辑字段：说话风格、与用户的关系、开场白、相遇场景、头像。
                </p>
                <button
                  onClick={() => setShowLockInfo(false)}
                  className="w-full mt-4 py-2 rounded-xl bg-ios-blue text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  我知道了
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 世界观摘要预览弹窗
 */
function WorldviewPreviewModal({ worldviewKey, onClose }) {
  const summary = getWorldviewSummary(worldviewKey)

  if (!summary) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 animate-fade-in">
      <div className="ios-card p-6 mx-4 w-full max-w-md animate-bounce-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {summary.world}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {summary.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          以下模块将在角色对话时自动注入到系统提示词中，帮助 AI 理解世界观背景。
        </p>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {summary.modules.map((mod, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-ios-blue" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {mod.title}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-3.5">
                {mod.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>重要规则：</strong>世界观设定与个人记忆分层独立管理。当世界观设定与聊天记录中的个人经历冲突时，<strong>个人记忆优先级更高</strong>。
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 ios-button"
        >
          关闭
        </button>
      </div>
    </div>
  )
}