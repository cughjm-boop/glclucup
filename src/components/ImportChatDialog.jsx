import { useState, useRef, useEffect, useCallback } from 'react'
import useStore from '../store/useStore'
import { parseChatLogFile, getImportProgress, clearImportProgress } from '../services/chatLogParser'
import { estimateImportCost } from '../services/memoryExtractor'

export default function ImportChatDialog({ characterId, onImport, onCancel, existingMemory, mode }) {
  const isExtractMode = mode === 'extract'
  const { importChatLogAndExtractMemories, importState, setImportState, setMemoryDashboardFilter } = useStore()
  const [step, setStep] = useState('select') // select | parsing | preview | extracting | done | error
  const [file, setFile] = useState(null)
  const [parsedData, setParsedData] = useState(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0, step: '', memories: 0 })
  const [customDelimiters, setCustomDelimiters] = useState({ userDelimiter: '用户：', aiDelimiter: 'AI：' })
  const [csvMapping, setCsvMapping] = useState({ roleCol: '', contentCol: '' })
  const [costLimit, setCostLimit] = useState(0.5) // 默认 0.5 元上限
  const [result, setResult] = useState(null)
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)

  // 检查断点续传
  useEffect(() => {
    const saved = getImportProgress(characterId)
    if (saved && saved.rawText) {
      setStep('resume')
      setParsedData({ rawText: saved.rawText, stats: saved.stats })
    }
  }, [characterId])

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    setFile(selectedFile)
    setError('')
    setStep('parsing')

    try {
      const result = await parseChatLogFile(selectedFile, customDelimiters)
      setParsedData(result)
      const cost = estimateImportCost(result.rawText)
      setParsedData((prev) => ({ ...prev, cost }))
      setStep('preview')
    } catch (err) {
      setError(err.message)
      setStep('select')
    }
  }

  const handleRetryWithDelimiters = async () => {
    if (!file) return
    setError('')
    setStep('parsing')
    try {
      const result = await parseChatLogFile(file, customDelimiters)
      setParsedData(result)
      const cost = estimateImportCost(result.rawText)
      setParsedData((prev) => ({ ...prev, cost }))
      setStep('preview')
    } catch (err) {
      setError(err.message)
      setStep('select')
    }
  }

  const handleStartExtraction = useCallback(async () => {
    if (!file || !parsedData) return

    // 简单模式：直接导入解析的消息
    if (!isExtractMode) {
      setStep('done')
      onImport?.(parsedData.messages)
      return
    }

    const cost = parsedData.cost?.estimatedCost || 0
    if (cost > costLimit) {
      setError(`预估费用 ¥${cost} 超过上限 ¥${costLimit}。请调整上限或取消。`)
      return
    }

    setStep('extracting')
    setError('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const extractionResult = await importChatLogAndExtractMemories(
        characterId,
        file,
        customDelimiters,
        (p) => setProgress(p),
        controller.signal
      )
      setResult(extractionResult)
      setStep('done')
      onImport?.(extractionResult)
    } catch (err) {
      if (err.message === '导入已取消') {
        setStep('preview')
        return
      }
      setError(err.message)
      setStep('error')
    }
  }, [file, parsedData, characterId, customDelimiters, costLimit, importChatLogAndExtractMemories, onImport, isExtractMode])

  const handleResume = useCallback(async () => {
    if (!parsedData?.rawText) return
    clearImportProgress(characterId)
    // 重新走完整流程
    if (file) {
      handleStartExtraction()
    } else {
      setStep('select')
    }
  }, [parsedData, characterId, file, handleStartExtraction])

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    setImportState(null)
    onCancel()
  }

  const handleNavigateToDashboard = (filterTier) => {
    setMemoryDashboardFilter(filterTier)
    handleCancel()
  }

  const handleReset = () => {
    setStep('select')
    setFile(null)
    setParsedData(null)
    setError('')
    setProgress({ current: 0, total: 0, step: '', memories: 0 })
    if (fileInputRef.current) fileInputRef.current.value = ''
    abortRef.current = null
  }

  const totalCost = parsedData?.cost?.estimatedCost || parsedData?.stats?.estimatedCost || 0

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 animate-fade-in">
      <div className="ios-card p-6 mx-4 w-full max-w-lg animate-bounce-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {isExtractMode ? '导入外部聊天记录并提取记忆' : '导入聊天记录'}
          </h2>
          <button onClick={handleCancel} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Step: 断点续传 */}
        {step === 'resume' && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/30 rounded-xl">
              <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-1">检测到未完成的导入</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                上次导入中断于 {parsedData?.stats?.totalChars ? `${parsedData.stats.totalChars.toLocaleString()} 字的文本` : '未知进度'}。你可以继续上次的导入，或重新开始。
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleResume} className="flex-1 ios-button">继续导入</button>
              <button onClick={() => { clearImportProgress(characterId); setStep('select') }} className="flex-1 ios-button-secondary">重新开始</button>
            </div>
          </div>
        )}

        {/* Step: 选择文件 */}
        {(step === 'select' || step === 'parsing') && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
              {isExtractMode ? (
                <>
                  <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                    导入其他平台的聊天记录，AI 将自动分析并提取完整记忆，让角色"继承"这段历史。
                  </p>
                  <ul className="text-xs text-blue-600 dark:text-blue-400 mt-2 space-y-1 list-disc list-inside">
                    <li>支持 .txt / .json / .csv / .docx 格式</li>
                    <li>自动分段提取，支持数万字聊天记录</li>
                    <li>生成记忆条目、用户画像、事件时间线、关系图谱</li>
                    <li>所有数据存储在本地</li>
                  </ul>
                </>
              ) : (
                <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                  导入聊天记录作为对话上下文，角色将直接记住这些对话内容。
                </p>
              )}
            </div>

            {existingMemory && existingMemory.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  当前已有 {existingMemory.length} 条导入记忆。新导入的记忆将与现有记忆合并。
                </p>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept=".json,.csv,.txt,.docx" onChange={handleFileSelect} className="hidden" />

            <button onClick={() => fileInputRef.current?.click()} disabled={step === 'parsing'}
              className="w-full py-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl hover:border-ios-blue dark:hover:border-ios-blue transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-50">
              {step === 'parsing' ? (
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

            {/* 自定义分隔符 */}
            <details className="group">
              <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">纯文本导入自定义分隔符</summary>
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-2">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">用户消息前缀</label>
                  <input type="text" value={customDelimiters.userDelimiter} onChange={(e) => setCustomDelimiters({ ...customDelimiters, userDelimiter: e.target.value })}
                    className="ios-input mt-1" placeholder="用户：" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">AI 消息前缀</label>
                  <input type="text" value={customDelimiters.aiDelimiter} onChange={(e) => setCustomDelimiters({ ...customDelimiters, aiDelimiter: e.target.value })}
                    className="ios-input mt-1" placeholder="AI：" />
                </div>
                <button onClick={handleRetryWithDelimiters} disabled={!file} className="w-full ios-button-secondary text-xs py-2">重新解析</button>
              </div>
            </details>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-xl">
                <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Step: 预览 */}
        {step === 'preview' && parsedData && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-ios-green/10 text-ios-green text-xs font-medium">{parsedData.format.toUpperCase()}</span>
              <span className="text-gray-500 dark:text-gray-400">{parsedData.stats?.totalMessages} 条消息</span>
              <span className="text-gray-400 dark:text-gray-500 text-xs">{parsedData.stats?.totalChars?.toLocaleString()} 字</span>
            </div>

            {/* 预览消息 */}
            <div className="max-h-48 overflow-y-auto space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">预览（前 10 条）</p>
              {parsedData.messages?.slice(0, 10).map((msg, i) => (
                <div key={i} className={`p-2.5 rounded-xl text-xs ${
                  msg.role === 'user' ? 'bg-ios-blue/10 dark:bg-ios-blue/20 text-gray-800 dark:text-gray-200 ml-4' : 'bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 text-gray-800 dark:text-gray-200 mr-4'
                }`}>
                  <span className="font-medium text-gray-400 dark:text-gray-500">{msg.role === 'user' ? '用户' : 'AI'}:</span>{' '}
                  {msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content}
                </div>
              ))}
              {(parsedData.messages?.length || 0) > 10 && (
                <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-1">... 还有 {(parsedData.messages?.length || 0) - 10} 条消息</p>
              )}
            </div>

            {/* 成本预估 */}
            {isExtractMode && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">成本预估</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">总字数</span><p className="text-gray-700 dark:text-gray-300">{parsedData.stats?.totalChars?.toLocaleString()} 字</p></div>
                <div><span className="text-gray-400">预估分段</span><p className="text-gray-700 dark:text-gray-300">{parsedData.cost?.estimatedChunks || parsedData.stats?.estimatedChunks} 段</p></div>
                <div><span className="text-gray-400">预估 Token</span><p className="text-gray-700 dark:text-gray-300">{(parsedData.cost?.estimatedTokens || parsedData.stats?.estimatedTokens)?.toLocaleString()}</p></div>
                <div><span className="text-gray-400">预估费用</span><p className="text-ios-blue font-semibold">¥{totalCost}</p></div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <label className="text-xs text-gray-400">费用上限</label>
                <input type="number" value={costLimit} onChange={(e) => setCostLimit(Number(e.target.value))} step="0.1" min="0.1" max="10"
                  className="w-20 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-300" />
                <span className="text-xs text-gray-400">元</span>
              </div>
            </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleReset} className="flex-1 ios-button-secondary">重新选择</button>
              <button onClick={handleStartExtraction} className="flex-1 ios-button">
                {isExtractMode ? `开始提取记忆 (${parsedData.stats?.totalMessages} 条)` : `确认导入 (${parsedData.stats?.totalMessages} 条)`}
              </button>
            </div>
          </div>
        )}

        {/* Step: 提取中 */}
        {step === 'extracting' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-ios-blue/10 flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-gray-200 border-t-ios-blue rounded-full animate-spin" style={{ borderWidth: '3px' }} />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {progress.step === 'extracting' ? '正在提取记忆...' : '正在处理...'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {progress.step === 'extracting' && progress.total > 0
                  ? `第 ${progress.current}/${progress.total} 段 · 已提取 ${progress.memories} 条记忆`
                  : '请稍候...'}
              </p>
            </div>

            {/* 进度条 */}
            {progress.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>进度</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div className="h-full rounded-full bg-ios-blue transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
              </div>
            )}

            <button onClick={handleCancel} className="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-900/30 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
              取消导入
            </button>
          </div>
        )}

        {/* Step: 完成 */}
        {step === 'done' && (
          <div className="space-y-4">
            {isExtractMode && result ? (
              <>
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-ios-green/10 dark:bg-ios-green/20 mx-auto flex items-center justify-center mb-3">
                    <svg className="w-8 h-8 text-ios-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">导入完成</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    从 {parsedData?.stats?.totalMessages?.toLocaleString() || '0'} 条消息中
                  </p>
                </div>

                {/* 三层分类报告 */}
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">提取分类</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">点击数字可跳转查看</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleNavigateToDashboard('core')}
                      className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors text-center"
                    >
                      <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{result.v2Stats?.core || result.stats?.core || 0}</p>
                      <p className="text-xs text-amber-500 dark:text-amber-400">核心档案</p>
                    </button>
                    <button
                      onClick={() => handleNavigateToDashboard('emotional')}
                      className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-center"
                    >
                      <p className="text-lg font-bold text-red-500 dark:text-red-400">{result.v2Stats?.emotional || result.stats?.emotional || 0}</p>
                      <p className="text-xs text-red-500 dark:text-red-400">情感精华</p>
                    </button>
                    <button
                      onClick={() => handleNavigateToDashboard('daily')}
                      className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-center"
                    >
                      <p className="text-lg font-bold text-gray-600 dark:text-gray-300">{result.v2Stats?.daily || result.stats?.daily || 0}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">日常琐事</p>
                    </button>
                  </div>
                  {(result.v2Stats?.discarded || result.stats?.discarded || 0) > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        丢弃 {result.v2Stats?.discarded || result.stats?.discarded || 0} 条与官方设定冲突的条目
                      </p>
                    </div>
                  )}
                </div>

                {/* 丢弃详情 */}
                {result.discarded?.length > 0 && (
                  <details className="group">
                    <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                      查看丢弃详情（{result.discarded.length} 条）
                    </summary>
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {result.discarded.map((item, i) => (
                        <div key={i} className="p-2 bg-red-50 dark:bg-red-900/10 rounded-lg text-xs">
                          <p className="text-red-600 dark:text-red-400">{item.content}</p>
                          <p className="text-red-400 dark:text-red-500 mt-0.5">原因：{item.reason || '与官方设定冲突'}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {result.systemMessage && (
                  <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/10 dark:to-purple-900/10 rounded-xl border border-blue-100 dark:border-blue-900/20">
                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{result.systemMessage}"</p>
                  </div>
                )}

                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    角色已完整继承这段历史。你可以在"记忆仪表盘"中核验、编辑或删除任何记忆条目。
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-ios-green/10 dark:bg-ios-green/20 mx-auto flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-ios-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">导入完成</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  已导入 {parsedData?.stats?.totalMessages} 条消息作为对话上下文
                </p>
              </div>
            )}

            <button onClick={handleCancel} className="w-full ios-button">完成</button>
          </div>
        )}

        {/* Step: 错误 */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/30 rounded-xl">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">导入失败</p>
              <p className="text-xs text-red-500 dark:text-red-400 whitespace-pre-wrap">{error}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleReset} className="flex-1 ios-button-secondary">重新开始</button>
              <button onClick={handleStartExtraction} className="flex-1 ios-button">重试</button>
            </div>
          </div>
        )}

        {/* Bottom cancel */}
        {step !== 'preview' && step !== 'extracting' && step !== 'done' && step !== 'error' && step !== 'resume' && (
          <div className="mt-4"><button onClick={handleCancel} className="w-full ios-button-secondary">取消</button></div>
        )}
      </div>
    </div>
  )
}