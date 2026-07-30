import { useState, useRef } from 'react'
import { parseImportFile } from '../services/importParser'

export default function ImportChatDialog({ onImport, onCancel, existingMemory }) {
  const [step, setStep] = useState('select') // 'select' | 'preview' | 'importing' | 'done'
  const [file, setFile] = useState(null)
  const [parsedData, setParsedData] = useState(null)
  const [error, setError] = useState('')
  const [customDelimiters, setCustomDelimiters] = useState({
    userDelimiter: '用户：',
    aiDelimiter: 'AI：',
  })
  const fileInputRef = useRef(null)

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setError('')
    setStep('importing')

    try {
      const result = await parseImportFile(selectedFile, customDelimiters)
      setParsedData(result)
      setStep('preview')
    } catch (err) {
      setError(err.message)
      setStep('select')
    }
  }

  const handleRetryWithDelimiters = async () => {
    if (!file) return
    setError('')
    setStep('importing')

    try {
      const result = await parseImportFile(file, customDelimiters)
      setParsedData(result)
      setStep('preview')
    } catch (err) {
      setError(err.message)
      setStep('select')
    }
  }

  const handleConfirmImport = () => {
    if (parsedData?.messages) {
      onImport(parsedData.messages)
      setStep('done')
    }
  }

  const handleReset = () => {
    setStep('select')
    setFile(null)
    setParsedData(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 animate-fade-in">
      <div className="ios-card p-6 mx-4 w-full max-w-lg animate-bounce-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">导入聊天记录</h2>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step: Select file */}
        {(step === 'select' || step === 'importing') && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
              <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                支持导入以下格式的聊天记录作为角色记忆：
              </p>
              <ul className="text-xs text-blue-600 dark:text-blue-400 mt-2 space-y-1 list-disc list-inside">
                <li>JSON（ChatGPT 导出、Character.AI、本应用导出）</li>
                <li>CSV（role/content 或 sender/message 列）</li>
                <li>纯文本（用户：/AI：分隔，或按空行交替）</li>
                <li>DOCX（Word 文档，自动提取文本后按对话格式解析）</li>
              </ul>
            </div>

            {existingMemory && existingMemory.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  当前已有 {existingMemory.length} 条导入记忆。重新导入将覆盖现有记忆。
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.txt,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={step === 'importing'}
              className="w-full py-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl
                         hover:border-ios-blue dark:hover:border-ios-blue transition-colors
                         flex flex-col items-center justify-center gap-2
                         disabled:opacity-50"
            >
              {step === 'importing' ? (
                <>
                  <div className="w-8 h-8 border-3 border-gray-200 border-t-ios-blue rounded-full animate-spin" style={{ borderWidth: '3px' }} />
                  <p className="text-sm text-gray-500 dark:text-gray-400">解析中...</p>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-gray-400">点击选择文件</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">.json / .csv / .txt / .docx</p>
                </>
              )}
            </button>

            {/* 纯文本自定义分隔符 */}
            <details className="group">
              <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                纯文本导入自定义分隔符
              </summary>
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-2">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">用户消息前缀</label>
                  <input
                    type="text"
                    value={customDelimiters.userDelimiter}
                    onChange={(e) => setCustomDelimiters({ ...customDelimiters, userDelimiter: e.target.value })}
                    className="ios-input mt-1"
                    placeholder="用户："
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">AI 消息前缀</label>
                  <input
                    type="text"
                    value={customDelimiters.aiDelimiter}
                    onChange={(e) => setCustomDelimiters({ ...customDelimiters, aiDelimiter: e.target.value })}
                    className="ios-input mt-1"
                    placeholder="AI："
                  />
                </div>
                <button
                  onClick={handleRetryWithDelimiters}
                  disabled={!file}
                  className="w-full ios-button-secondary text-xs py-2"
                >
                  重新解析
                </button>
              </div>
            </details>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-xl">
                <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && parsedData && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-ios-green/10 text-ios-green text-xs font-medium">
                {parsedData.format.toUpperCase()}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                解析到 {parsedData.messages.length} 条消息
              </span>
              {parsedData.detectedPattern && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  ({parsedData.detectedPattern})
                </span>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">预览（前 {Math.min(parsedData.messages.length, 5)} 条）</p>
              {parsedData.messages.slice(0, 5).map((msg, i) => (
                <div
                  key={i}
                  className={`p-2.5 rounded-xl text-xs ${
                    msg.role === 'user'
                      ? 'bg-ios-blue/10 dark:bg-ios-blue/20 text-gray-800 dark:text-gray-200 ml-4'
                      : 'bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 text-gray-800 dark:text-gray-200 mr-4'
                  }`}
                >
                  <span className="font-medium text-gray-400 dark:text-gray-500">
                    {msg.role === 'user' ? '用户' : 'AI'}:
                  </span>{' '}
                  {msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content}
                </div>
              ))}
              {parsedData.messages.length > 5 && (
                <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-1">
                  ... 还有 {parsedData.messages.length - 5} 条消息
                </p>
              )}
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                导入后，这些消息将作为角色的记忆，在每次对话时作为上下文提供给 AI，让角色拥有之前的记忆，无缝延续对话。
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={handleReset} className="flex-1 ios-button-secondary">
                重新选择
              </button>
              <button onClick={handleConfirmImport} className="flex-1 ios-button">
                确认导入 ({parsedData.messages.length} 条)
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-ios-green/10 dark:bg-ios-green/20 mx-auto flex items-center justify-center">
              <svg className="w-8 h-8 text-ios-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">导入成功</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                已导入 {parsedData?.messages?.length || 0} 条消息作为角色记忆
              </p>
            </div>
            <button onClick={onCancel} className="ios-button">
              完成
            </button>
          </div>
        )}

        {/* Bottom cancel */}
        {step !== 'preview' && step !== 'done' && (
          <div className="mt-4">
            <button onClick={onCancel} className="w-full ios-button-secondary">
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}