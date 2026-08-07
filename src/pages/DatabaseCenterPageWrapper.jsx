import { useEffect } from 'react'
import PageShell from './PageShell'
import DatabaseCenterPage from '../components/DatabaseCenterPage'
import useStore from '../store/useStore'

export default function DatabaseCenterPageWrapper() {
  const { setView, setFullScreenPageOpen } = useStore()

  // 挂载时设置全屏守卫
  useEffect(() => {
    setFullScreenPageOpen(true)
    console.log('[DatabaseCenterPage] 已设置 fullScreenPageOpen=true')
  }, [setFullScreenPageOpen])

  const handleBack = () => {
    console.log('[DatabaseCenterPage] handleBack 触发')
    setFullScreenPageOpen(false)
    setView('chat')
  }

  return (
    <PageShell
      title="角色数据库中心"
      subtitle="扫描与验证所有角色数据"
      onBack={handleBack}
    >
      <DatabaseCenterPage />
    </PageShell>
  )
}