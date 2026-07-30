import { useState } from 'react'
import useStore from '../store/useStore'
import VoiceSettings from './VoiceSettings'

export default function SettingsPanel() {
  const { settings, updateSettings, setView, setTheme } = useStore()
  const [showApiKey, setShowApiKey] = useState(false)
  const [localSettings, setLocalSettings] = useState({ ...settings })

  const handleSave = () => {
    updateSettings(localSettings)
    if (localSettings.theme !== settings.theme) {
      setTheme(localSettings.theme)
    }
    setView('chat')
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 animate-fade-in">
      <div className="ios-card p-6 mx-4 w-full max-w-lg animate-bounce-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">设置</h2>
          <button
            onClick={() => setView('chat')}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* Theme */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">外观</h3>
            <div className="flex gap-2">
              {[
                { value: 'system', label: '跟随系统', icon: '💻' },
                { value: 'light', label: '浅色', icon: '☀️' },
                { value: 'dark', label: '深色', icon: '🌙' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLocalSettings({ ...localSettings, theme: opt.value })}
                  className={`flex-1 py-3 px-3 rounded-xl text-sm font-medium transition-all flex flex-col items-center gap-1 ${
                    localSettings.theme === opt.value
                      ? 'bg-ios-blue text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="text-lg">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* API Configuration */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">大模型 API 配置</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={localSettings.apiKey}
                    onChange={(e) => setLocalSettings({ ...localSettings, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="ios-input pr-10"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showApiKey ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M15 12a3 3 0 01-3 3m0 0l7.5-7.5M6.5 6.5l2.5 2.5" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">API Base URL</label>
                <input
                  type="text"
                  value={localSettings.baseUrl}
                  onChange={(e) => setLocalSettings({ ...localSettings, baseUrl: e.target.value })}
                  placeholder="https://api.deepseek.com"
                  className="ios-input"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  支持 OpenAI 兼容接口。DeepSeek: api.deepseek.com，OpenAI: api.openai.com/v1
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">模型名称</label>
                <input
                  type="text"
                  value={localSettings.modelName}
                  onChange={(e) => setLocalSettings({ ...localSettings, modelName: e.target.value })}
                  placeholder="deepseek-chat"
                  className="ios-input"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  例如: deepseek-chat, gpt-4o, gpt-4o-mini, claude-3-5-sonnet
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          <VoiceSettings />

          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* Data management */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">数据管理</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              所有数据（角色、聊天记录、API Key）均存储在浏览器本地 (localStorage)，不会上传到任何服务器。
            </p>
            <button
              onClick={() => {
                if (confirm('确定要清除所有数据吗？此操作不可恢复。')) {
                  localStorage.clear()
                  window.location.reload()
                }
              }}
              className="ios-button-danger text-sm py-2.5"
            >
              清除所有数据
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setView('chat')}
              className="flex-1 ios-button-secondary"
            >
              取消
            </button>
            <button onClick={handleSave} className="flex-1 ios-button">
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}