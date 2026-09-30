import { Component } from 'react'

/**
 * ErrorBoundary — 崩溃保护组件
 * 当子组件内部发生 JS 错误时，显示降级 UI 而非白屏。
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] 组件崩溃', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            {this.props.message || '该功能加载失败，请稍后重试'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            {this.state.error?.message || '发生了未知错误'}
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              this.props.onRetry?.()
            }}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
          >
            重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}