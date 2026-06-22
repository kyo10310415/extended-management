import { useState } from 'react'
import Dashboard from './components/Dashboard'
import HearingList from './components/HearingList'
import ExaminationList from './components/ExaminationList'
import ProHearingList from './components/ProHearingList'
import ProExaminationList from './components/ProExaminationList'
import StudentMaster from './components/StudentMaster'
import SuspensionList from './components/SuspensionList'
import ProPlanList from './components/ProPlanList'
import ActiveProPlanList from './components/ActiveProPlanList'
import KpiHistory from './components/KpiHistory'
import KpiChart from './components/KpiChart'
import KpiByTutor from './components/KpiByTutor'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  // 一度でも開いたタブを記録（初回だけマウントするため）
  const [visitedTabs, setVisitedTabs] = useState(new Set(['dashboard']))

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setVisitedTabs(prev => new Set([...prev, tabId]))
  }

  const tabs = [
    { id: 'dashboard', name: 'ダッシュボード', icon: '📊' },
    { id: 'hearing', name: 'ヒアリング一覧', icon: '🎤' },
    { id: 'examination', name: '延長審査一覧', icon: '📋' },
    { id: 'pro-hearing', name: 'Proヒアリング', icon: '🎯' },
    { id: 'pro-examination', name: 'Pro延長審査', icon: '📝' },
    { id: 'suspension', name: '休会歴一覧', icon: '⏸️' },
    { id: 'lifetime-members', name: '永久会員', icon: '👑' },
    { id: 'active-pro-plan', name: 'Proプラン受講中', icon: '⭐' },
    { id: 'master', name: '生徒情報マスタ', icon: '👥' },
    { id: 'kpi-history', name: 'KPI履歴', icon: '📅' },
    { id: 'kpi-chart',   name: 'KPIグラフ', icon: '📈' },
    { id: 'kpi-tutor',  name: 'Tutor別KPI', icon: '👤' },
  ]

  // タブのコンテンツ定義（コンポーネントとidの対応）
  const tabContents = [
    { id: 'dashboard',        component: <Dashboard /> },
    { id: 'hearing',          component: <HearingList /> },
    { id: 'examination',      component: <ExaminationList /> },
    { id: 'pro-hearing',      component: <ProHearingList /> },
    { id: 'pro-examination',  component: <ProExaminationList /> },
    { id: 'suspension',       component: <SuspensionList /> },
    { id: 'lifetime-members', component: <ProPlanList /> },
    { id: 'active-pro-plan',  component: <ActiveProPlanList /> },
    { id: 'master',           component: <StudentMaster /> },
    { id: 'kpi-history',      component: <KpiHistory /> },
    { id: 'kpi-chart',        component: <KpiChart /> },
    { id: 'kpi-tutor',        component: <KpiByTutor /> },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              🎓 WannaV 延長管理システム
            </h1>
            <div className="text-sm text-gray-500">
              {new Date().toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content
          一度開いたタブは display:none で隠すだけ（unmountしない）
          → useEffect の再実行・APIの再fetchが発生しない */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {tabContents.map(({ id, component }) =>
          visitedTabs.has(id) ? (
            <div key={id} style={{ display: activeTab === id ? 'block' : 'none' }}>
              {component}
            </div>
          ) : null
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500">
            © 2025 WannaV 延長管理システム
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
