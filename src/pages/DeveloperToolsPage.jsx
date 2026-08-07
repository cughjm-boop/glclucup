import { useEffect, useState, useRef } from 'react'
import PageShell from './PageShell'
import useStore from '../store/useStore'

const DEBUG_ITEMS = [
  { id: 'memory-dashboard', icon: '🧠', label: '记忆仪表盘', desc: '三层记忆金字塔概览', view: 'memory-dashboard' },
  { id: 'database-center', icon: '🗄️', label: '角色数据库中心', desc: '扫描引擎 + 完成度仪表盘', view: 'database-center' },
  { id: 'character-manage', icon: '👥', label: '角色管理', desc: '创建、编辑、删除角色', view: 'character-manage' },
  { id: 'api-key', icon: '🔑', label: 'API 配置', desc: '管理 API Key 和模型设置', view: 'settings' },
  { id: 'theme', icon: '🎨', label: '外观主题', desc: '深色/浅色模式切换', view: 'settings' },
  { id: 'cost', icon: '💰', label: '用量统计', desc: 'Token 消耗与费用估算', view: 'settings' },
]

export default function DeveloperToolsPage() {
  const { setView } = useStore()
  const [activeSubView, setActiveSubView] = useState(null)

  const handleBack = () => {
    if (activeSubView) {
      setActiveSubView(null)
    } else {
      setView('chat')
    }
  }

  return (
    <PageShell
      title="开发者工具"
      subtitle="调试与配置"
      onBack={handleBack}
    >
      {!activeSubView ? (
        <div className="space-y-3 pb-8">
          <div className="grid grid-cols-2 gap-3">
            {DEBUG_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.view)}
                className="ios-card p-4 text-left hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>

          <div className="mt-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <span className="font-semibold">提示：</span> 开发者工具仅供调试使用，生产环境请关闭。
            </p>
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
