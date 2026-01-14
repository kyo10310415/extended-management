import { useState, useEffect } from 'react'

function Dashboard() {
  const [stats, setStats] = useState({
    totalStudents: 0,
    hearingCount: 0,
    examinationCount: 0,
    loading: true,
  })

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const [allRes, hearingRes, examRes] = await Promise.all([
        fetch('/api/notion/students'),
        fetch('/api/notion/hearing'),
        fetch('/api/notion/examination'),
      ])

      const allData = await allRes.json()
      const hearingData = await hearingRes.json()
      const examData = await examRes.json()

      setStats({
        totalStudents: allData.count || 0,
        hearingCount: hearingData.count || 0,
        examinationCount: examData.count || 0,
        loading: false,
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
      setStats(prev => ({ ...prev, loading: false }))
    }
  }

  if (stats.loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  const cards = [
    {
      title: '総生徒数',
      value: stats.totalStudents,
      icon: '👥',
      color: 'bg-blue-500',
    },
    {
      title: 'ヒアリング対象（4ヶ月目）',
      value: stats.hearingCount,
      icon: '🎤',
      color: 'bg-yellow-500',
    },
    {
      title: '延長審査対象（5ヶ月目）',
      value: stats.examinationCount,
      icon: '📋',
      color: 'bg-green-500',
    },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">ダッシュボード</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {cards.map((card, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">{card.title}</p>
                <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              </div>
              <div className={`${card.color} p-4 rounded-full text-white text-2xl`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">システム概要</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            <span className="font-semibold">📊 データソース:</span> Notion API + Google Spreadsheet
          </p>
          <p>
            <span className="font-semibold">🎤 ヒアリング一覧:</span> レッスン開始月から4ヶ月目の生徒
          </p>
          <p>
            <span className="font-semibold">📋 延長審査一覧:</span> レッスン開始月から5ヶ月目の生徒
          </p>
          <p>
            <span className="font-semibold">✍️ 手動入力項目:</span> 延長確度、ヒアリング、審査結果、備考
          </p>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
