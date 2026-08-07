import { useState } from 'react'
import { createPortal } from 'react-dom'
import useStore from '../store/useStore'
import { Z_INDEX } from './FloatingLayer'

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}`
}

const SECTION_CONFIG = {
  deepReflection: { label: '深度反思', icon: '🧠', color: 'purple' },
  associationNetwork: { label: '关联网络', icon: '🔗', color: 'blue' },
  monologue: { label: '内心独白', icon: '💭', color: 'pink' },
  smartTopic: { label: '智能话题', icon: '💡', color: 'yellow' },
}

export default function EnhancedMemoryPanel({ character, onClose }) {
  const { enhancedMemories } = useStore()
  const charId = character.id
  const enhanced = enhancedMemories[charId] || {}
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { id: 'overview', label: '概览', icon: '📊' },
    { id: 'deepReflection', label: '深度反思', icon: '🧠' },
    { id: 'monologue', label: '内心独白', icon: '💭' },
    { id: 'network', label: '关联网络', icon: '🔗' },
    { id: 'other', label: '更多', icon: '📋' },
  ]

  const hasAnyData = Object.keys(enhanced).length > 0

  return createPortal(
    <div className="fixed inset-0 flex items-start justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm pt-safe animate-fade-in overflow-y-auto py-8" style={{ zIndex: Z_INDEX.DIALOG }}>
      <div className="fixed inset-0" style={{ zIndex: Z_INDEX.DIALOG - 1 }} onClick={onClose} />
      <div className="ios-card mx-4 w-full max-w-lg animate-bounce-in relative" style={{ zIndex: Z_INDEX.DIALOG }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-ios-blue/20 to-purple-400/20 flex items-center justify-center">
              {character?.avatar ? (
                <img src={character.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-ios-blue">
                  {character?.name?.charAt(0) || '?'}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                增强记忆
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {character?.name || '当前角色'} · AI 深度分析
              </p>
            </div>
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

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors whitespace-nowrap px-2 ${
                activeTab === tab.id
                  ? 'text-ios-blue border-b-2 border-ios-blue'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {!hasAnyData ? (
            <div className="text-center py-8">
              <span className="text-4xl mb-3 block">🔍</span>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                暂无增强记忆数据
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                继续聊天，AI 会在后台自动分析生成
              </p>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {Object.entries(SECTION_CONFIG).map(([key, config]) => {
                    const data = enhanced[key]
                    if (!data) return null
                    return (
                      <div
                        key={key}
                        className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => setActiveTab(key)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{config.icon}</span>
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {config.label}
                          </h4>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                            {formatTime(data.generatedAt)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                          {data.user_summary || data.content?.slice(0, 100) || '已生成'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Deep Reflection Tab */}
              {activeTab === 'deepReflection' && enhanced.deepReflection && (
                <DeepReflectionView data={enhanced.deepReflection} />
              )}
              {activeTab === 'deepReflection' && !enhanced.deepReflection && (
                <EmptySection icon="🧠" text="对话后自动生成深度反思" />
              )}

              {/* Monologue Tab */}
              {activeTab === 'monologue' && enhanced.monologue && (
                <MonologueView data={enhanced.monologue} character={character} />
              )}
              {activeTab === 'monologue' && !enhanced.monologue && (
                <EmptySection icon="💭" text="每2天自动生成角色内心独白" />
              )}

              {/* Network Tab */}
              {activeTab === 'network' && enhanced.associationNetwork && (
                <AssociationNetworkView data={enhanced.associationNetwork} />
              )}
              {activeTab === 'network' && !enhanced.associationNetwork && (
                <EmptySection icon="🔗" text="每3天自动生成关联网络" />
              )}

              {/* Other Tab */}
              {activeTab === 'other' && (
                <div className="space-y-4">
                  {enhanced.smartTopic && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                        <span>💡</span> 智能话题
                      </h4>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
                        {formatTime(enhanced.smartTopic.generatedAt)}
                      </p>
                      {enhanced.smartTopic.opening_message && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                          "{enhanced.smartTopic.opening_message}"
                        </p>
                      )}
                    </div>
                  )}
                  {!enhanced.smartTopic && (
                    <EmptySection icon="📋" text="更多分析数据等待生成" />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-4">
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            增强记忆数据仅存储在本地，角色独立
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}

function EmptySection({ icon, text }) {
  return (
    <div className="text-center py-8">
      <span className="text-3xl mb-2 block">{icon}</span>
      <p className="text-sm text-gray-400 dark:text-gray-500">{text}</p>
    </div>
  )
}

function DeepReflectionView({ data }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatTime(data.generatedAt)}</p>

      {data.personality_model && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">性格模型</h4>
          <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {data.personality_model.mbti_likely && <p>MBTI: {data.personality_model.mbti_likely}</p>}
            {data.personality_model.attachment_style && <p>依恋类型: {data.personality_model.attachment_style}</p>}
            {data.personality_model.life_stage && <p>人生阶段: {data.personality_model.life_stage}</p>}
            {data.personality_model.values?.length > 0 && (
              <p>价值观: {data.personality_model.values.join('、')}</p>
            )}
            {data.personality_model.deep_needs?.length > 0 && (
              <p>深层需求: {data.personality_model.deep_needs.join('、')}</p>
            )}
          </div>
        </div>
      )}

      {data.relationship_stage && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">关系评估</h4>
          <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <p>阶段: {data.relationship_stage.current}</p>
            {data.relationship_stage.prediction && <p>预测: {data.relationship_stage.prediction}</p>}
          </div>
        </div>
      )}

      {data.emotion_peaks?.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">情绪波动</h4>
          <div className="space-y-2">
            {data.emotion_peaks.map((peak, i) => (
              <div key={i} className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">{peak.emotion}</span> ({peak.intensity})
                {peak.trigger && <span className="text-gray-400"> — {peak.trigger}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.hidden_insights?.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">隐藏洞察</h4>
          <div className="space-y-1">
            {data.hidden_insights.map((insight, i) => (
              <p key={i} className="text-sm text-gray-600 dark:text-gray-400">{insight}</p>
            ))}
          </div>
        </div>
      )}

      {data.user_summary && (
        <div className="bg-ios-blue/5 dark:bg-ios-blue/10 rounded-xl p-3 border border-ios-blue/20">
          <h4 className="text-xs font-semibold text-ios-blue uppercase mb-2">用户认知摘要</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{data.user_summary}</p>
        </div>
      )}
    </div>
  )
}

function MonologueView({ data, character }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatTime(data.generatedAt)}</p>
      <div className="bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-900/10 dark:to-purple-900/10 rounded-xl p-4 border border-pink-100 dark:border-pink-900/20">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
          {character?.name || '角色'} 的内心独白
        </p>
        <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap italic">
          {data.content}
        </div>
      </div>
    </div>
  )
}

function AssociationNetworkView({ data }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatTime(data.generatedAt)}</p>

      {data.people_network?.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">人物关系图谱</h4>
          <div className="space-y-2">
            {data.people_network.map((person, i) => (
              <div key={i} className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">{person.name}</span>
                <span className="text-gray-400"> — {person.relation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.event_chains?.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">事件因果链</h4>
          <div className="space-y-2">
            {data.event_chains.map((chain, i) => (
              <div key={i} className="text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium text-gray-700 dark:text-gray-300">{chain.title}</p>
                {chain.narrative && <p className="text-xs mt-1">{chain.narrative}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.theme_clusters?.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">主题聚合</h4>
          <div className="flex flex-wrap gap-2">
            {data.theme_clusters.map((cluster, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {cluster.theme}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.predicted_topics?.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">预测话题</h4>
          <div className="space-y-1">
            {data.predicted_topics.map((topic, i) => (
              <p key={i} className="text-sm text-gray-600 dark:text-gray-400">• {topic}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}