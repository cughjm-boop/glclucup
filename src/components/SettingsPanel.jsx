import { useState } from 'react'
import useStore from '../store/useStore'
import VoiceSettings from './VoiceSettings'
import { TONE_PRESETS } from '../services/tts'

const TTS_PROVIDERS = [
  { value: 'web-speech', label: '浏览器内置', icon: '🌐', desc: '使用系统语音引擎，无需配置' },
  { value: 'aliyun', label: '阿里云', icon: '☁️', desc: '阿里云智能语音服务' },
  { value: 'tencent', label: '腾讯云', icon: '🔊', desc: '腾讯云语音合成' },
  { value: 'xunfei', label: '讯飞', icon: '🎙️', desc: '科大讯飞语音合成' },
]

export default function SettingsPanel() {
  const { settings, updateSettings, setView, setTheme } = useStore()
  const [showApiKey, setShowApiKey] = useState(false)
  const [localSettings, setLocalSettings] = useState({ ...settings })
  const [showCloudKeys, setShowCloudKeys] = useState({})

  const toggleCloudKey = (key) => {
    setShowCloudKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = () => {
    updateSettings(localSettings)
    if (localSettings.theme !== settings.theme) {
      setTheme(localSettings.theme)
    }
    setView('chat')
  }

  const updateLocalSetting = (key, value) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }))
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
                  onClick={() => updateLocalSetting('theme', opt.value)}
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
                    onChange={(e) => updateLocalSetting('apiKey', e.target.value)}
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
                  onChange={(e) => updateLocalSetting('baseUrl', e.target.value)}
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
                  onChange={(e) => updateLocalSetting('modelName', e.target.value)}
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

          {/* TTS Provider */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">语音服务商</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {TTS_PROVIDERS.map((prov) => (
                <button
                  key={prov.value}
                  onClick={() => updateLocalSetting('ttsProvider', prov.value)}
                  className={`p-3 rounded-xl text-left transition-all border ${
                    localSettings.ttsProvider === prov.value
                      ? 'bg-ios-blue/10 border-ios-blue shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-ios-blue/50'
                  }`}
                >
                  <span className="text-lg">{prov.icon}</span>
                  <p className={`text-sm font-medium mt-1 ${localSettings.ttsProvider === prov.value ? 'text-ios-blue' : 'text-gray-700 dark:text-gray-300'}`}>
                    {prov.label}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{prov.desc}</p>
                </button>
              ))}
            </div>

            {/* Cloud TTS key fields */}
            {localSettings.ttsProvider !== 'web-speech' && (
              <CloudTTSConfig
                provider={localSettings.ttsProvider}
                settings={localSettings}
                onChange={updateLocalSetting}
                showKeys={showCloudKeys}
                onToggleKey={toggleCloudKey}
              />
            )}

            {/* Cloud voice selection */}
            {localSettings.ttsProvider !== 'web-speech' && TONE_PRESETS[localSettings.ttsProvider] && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  默认音色
                </label>
                <select
                  value={localSettings.cloudVoiceId || ''}
                  onChange={(e) => updateLocalSetting('cloudVoiceId', e.target.value)}
                  className="ios-input"
                >
                  <option value="">-- 选择音色 --</option>
                  {TONE_PRESETS[localSettings.ttsProvider].map((tone) => (
                    <option key={tone.id} value={tone.id}>
                      {tone.name} - {tone.desc} ({tone.gender === 'female' ? '女' : '男'})
                    </option>
                  ))}
                </select>
              </div>
            )}
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

// 云 TTS 配置子组件
function CloudTTSConfig({ provider, settings, onChange, showKeys, onToggleKey }) {
  if (provider === 'aliyun') {
    return (
      <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <PasswordField
          label="AccessKey ID"
          value={settings.aliyunAccessKeyId}
          onChange={(v) => onChange('aliyunAccessKeyId', v)}
          placeholder="LTAI..."
          show={showKeys.aliyunAccessKeyId}
          onToggle={() => onToggleKey('aliyunAccessKeyId')}
        />
        <PasswordField
          label="AccessKey Secret"
          value={settings.aliyunAccessKeySecret}
          onChange={(v) => onChange('aliyunAccessKeySecret', v)}
          placeholder="..."
          show={showKeys.aliyunAccessKeySecret}
          onToggle={() => onToggleKey('aliyunAccessKeySecret')}
        />
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">AppKey</label>
          <input
            type="text"
            value={settings.aliyunAppKey}
            onChange={(e) => onChange('aliyunAppKey', e.target.value)}
            placeholder="阿里云智能语音 AppKey"
            className="ios-input"
          />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          <a href="https://nls-portal.console.aliyun.com/" target="_blank" rel="noopener noreferrer" className="text-ios-blue underline">阿里云语音服务控制台</a> 获取
        </p>
      </div>
    )
  }

  if (provider === 'tencent') {
    return (
      <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <PasswordField
          label="SecretId"
          value={settings.tencentSecretId}
          onChange={(v) => onChange('tencentSecretId', v)}
          placeholder="AKID..."
          show={showKeys.tencentSecretId}
          onToggle={() => onToggleKey('tencentSecretId')}
        />
        <PasswordField
          label="SecretKey"
          value={settings.tencentSecretKey}
          onChange={(v) => onChange('tencentSecretKey', v)}
          placeholder="..."
          show={showKeys.tencentSecretKey}
          onToggle={() => onToggleKey('tencentSecretKey')}
        />
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">AppId</label>
          <input
            type="text"
            value={settings.tencentAppId}
            onChange={(e) => onChange('tencentAppId', e.target.value)}
            placeholder="腾讯云 AppId"
            className="ios-input"
          />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          <a href="https://console.cloud.tencent.com/tts" target="_blank" rel="noopener noreferrer" className="text-ios-blue underline">腾讯云语音合成控制台</a> 获取
        </p>
      </div>
    )
  }

  if (provider === 'xunfei') {
    return (
      <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">AppId</label>
          <input
            type="text"
            value={settings.xunfeiAppId}
            onChange={(e) => onChange('xunfeiAppId', e.target.value)}
            placeholder="讯飞应用 AppId"
            className="ios-input"
          />
        </div>
        <PasswordField
          label="APIKey"
          value={settings.xunfeiApiKey}
          onChange={(v) => onChange('xunfeiApiKey', v)}
          placeholder="..."
          show={showKeys.xunfeiApiKey}
          onToggle={() => onToggleKey('xunfeiApiKey')}
        />
        <PasswordField
          label="APISecret"
          value={settings.xunfeiApiSecret}
          onChange={(v) => onChange('xunfeiApiSecret', v)}
          placeholder="..."
          show={showKeys.xunfeiApiSecret}
          onToggle={() => onToggleKey('xunfeiApiSecret')}
        />
        <p className="text-xs text-gray-400 dark:text-gray-500">
          <a href="https://console.xfyun.cn/services/tts" target="_blank" rel="noopener noreferrer" className="text-ios-blue underline">讯飞开放平台</a> 获取
        </p>
      </div>
    )
  }

  return null
}

function PasswordField({ label, value, onChange, placeholder, show, onToggle }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="ios-input pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {show ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M15 12a3 3 0 01-3 3m0 0l7.5-7.5M6.5 6.5l2.5 2.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}