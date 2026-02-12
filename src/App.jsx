import { useState } from 'react'
import Dashboard from './components/Dashboard'
import HearingList from './components/HearingList'
import ExaminationList from './components/ExaminationList'
import StudentMaster from './components/StudentMaster'
import SuspensionList from './components/SuspensionList'
import ProPlanList from './components/ProPlanList'
import ActiveProPlanList from './components/ActiveProPlanList'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  const tabs = [
    { id: 'dashboard', name: 'ダッシュボード', icon: '📊' },
    { id: 'hearing', name: 'ヒアリング一覧', icon: '🎤' },
    { id: 'examination', name: '延長審査一覧', icon: '📋' },
    { id: 'suspension', name: '休会歴一覧', icon: '⏸️' },
    { id: 'lifetime-members', name: '永久会員', icon: '👑' },
    { id: 'active-pro-plan', name: 'Proプラン受講中', icon: '⭐' },
    { id: 'master', name: '生徒情報マスタ', icon: '👥' },
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
                onClick={() => setActiveTab(tab.id)}
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'hearing' && <HearingList />}
        {activeTab === 'examination' && <ExaminationList />}
        {activeTab === 'suspension' && <SuspensionList />}
        {activeTab === 'lifetime-members' && <ProPlanList />}
        {activeTab === 'active-pro-plan' && <ActiveProPlanList />}
        {activeTab === 'master' && <StudentMaster />}
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
