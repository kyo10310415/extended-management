import { useState, useEffect } from 'react'

function Dashboard() {
  const [stats, setStats] = useState({
    loading: true,
    // 基本データ
    totalStudents: 0,
    hearingStudents: [],
    examinationStudents: [],
    // KPI設定
    extensionRateKPI: 80, // デフォルト80%
    // 計算されたKPI
    extensionCountKPI: 0,
    certaintyFilledCount: 0,
    extensionCount: 0,
    withdrawalCount: 0,
    extensionRate: 0,
    extensionRateVsResult: 0,
    remainingCount: 0,
    certaintyHigh: 0,
    certaintyMid: 0,
    certaintyLow: 0,
    // 延長審査1回目（5ヶ月目）
    exam1stTargetCount: 0,
    exam1stExtensionCount: 0,
    exam1stExtensionRate: 0,
    // 延長審査2回目（11ヶ月目）
    exam2ndTargetCount: 0,
    exam2ndExtensionCount: 0,
    exam2ndExtensionRate: 0,
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

      // 延長管理データを一括取得（ヒアリング）
      const hearingIds = hearingData.data?.map(s => s.studentId) || []
      const hearingExtRes = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: hearingIds }),
      })
      const hearingExtData = await hearingExtRes.json()

      // 延長管理データを一括取得（延長審査）
      const examIds = examData.data?.map(s => s.studentId) || []
      const examExtRes = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: examIds }),
      })
      const examExtData = await examExtRes.json()

      // データマージ
      const hearingStudents = (hearingData.data || []).map(s => ({
        ...s,
        extensionData: hearingExtData.data?.[s.studentId] || null,
      }))

      const examinationStudents = (examData.data || []).map(s => ({
        ...s,
        extensionData: examExtData.data?.[s.studentId] || null,
      }))

      // KPI計算
      const examinationCount = examinationStudents.length
      
      // 延長確度記入済み = 確度が入力されている - 「対象外」
      const certaintyFilledCount = hearingStudents.filter(s => 
        s.extensionData?.extension_certainty && 
        s.extensionData.extension_certainty !== '対象外'
      ).length

      // 延長数 = 審査結果が「延長」
      const extensionCount = examinationStudents.filter(s => 
        s.extensionData?.examination_result === '延長'
      ).length

      // 退会数 = 審査結果が「退会」
      const withdrawalCount = examinationStudents.filter(s => 
        s.extensionData?.examination_result === '退会'
      ).length

      // 延長率 = 延長数 / 延長審査対象 × 100
      const extensionRate = examinationCount > 0 
        ? (extensionCount / examinationCount * 100) 
        : 0

      // 延長率（対 審査結果お伝え） = 延長数 / (延長数 + 退会数) × 100
      const totalDecided = extensionCount + withdrawalCount
      const extensionRateVsResult = totalDecided > 0 
        ? (extensionCount / totalDecided * 100) 
        : 0

      // 残弾数 = 延長審査対象 - 延長数 - 退会数
      const remainingCount = examinationCount - extensionCount - withdrawalCount

      // 延長確度別カウント
      const certaintyHigh = hearingStudents.filter(s => 
        s.extensionData?.extension_certainty === '高'
      ).length

      const certaintyMid = hearingStudents.filter(s => 
        s.extensionData?.extension_certainty === '中'
      ).length

      const certaintyLow = hearingStudents.filter(s => 
        s.extensionData?.extension_certainty === '低'
      ).length

      // 延長審査1回目（5ヶ月目）
      const exam1stStudents = examinationStudents.filter(s => s.monthsElapsed === 5)
      const exam1stTargetCount = exam1stStudents.length
      const exam1stExtensionCount = exam1stStudents.filter(s => 
        s.extensionData?.examination_result === '延長'
      ).length
      const exam1stExtensionRate = exam1stTargetCount > 0 
        ? (exam1stExtensionCount / exam1stTargetCount * 100) 
        : 0

      // 延長審査2回目（11ヶ月目）
      const exam2ndStudents = examinationStudents.filter(s => s.monthsElapsed === 11)
      const exam2ndTargetCount = exam2ndStudents.length
      const exam2ndExtensionCount = exam2ndStudents.filter(s => 
        s.extensionData?.examination_result === '延長'
      ).length
      const exam2ndExtensionRate = exam2ndTargetCount > 0 
        ? (exam2ndExtensionCount / exam2ndTargetCount * 100) 
        : 0

      setStats(prev => ({
        ...prev,
        loading: false,
        totalStudents: allData.count || 0,
        hearingStudents,
        examinationStudents,
        extensionCountKPI: Math.ceil(examinationCount * prev.extensionRateKPI / 100),
        certaintyFilledCount,
        extensionCount,
        withdrawalCount,
        extensionRate,
        extensionRateVsResult,
        remainingCount,
        certaintyHigh,
        certaintyMid,
        certaintyLow,
        exam1stTargetCount,
        exam1stExtensionCount,
        exam1stExtensionRate,
        exam2ndTargetCount,
        exam2ndExtensionCount,
        exam2ndExtensionRate,
      }))
    } catch (error) {
      console.error('Error fetching stats:', error)
      setStats(prev => ({ ...prev, loading: false }))
    }
  }

  const handleKPIChange = (value) => {
    const kpi = Number(value)
    const examinationCount = stats.examinationStudents.length
    const extensionCountKPI = Math.ceil(examinationCount * kpi / 100)
    
    setStats(prev => ({
      ...prev,
      extensionRateKPI: kpi,
      extensionCountKPI,
    }))
  }

  if (stats.loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  const examinationTargetCount = stats.examinationStudents.length

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">ダッシュボード</h2>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm"
        >
          🔄 更新
        </button>
      </div>
      
      {/* KPI設定 */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 mb-6 text-white">
        <h3 className="text-lg font-semibold mb-4">🎯 延長率KPI設定</h3>
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">目標延長率:</label>
          <input
            type="number"
            min="0"
            max="100"
            value={stats.extensionRateKPI}
            onChange={(e) => handleKPIChange(e.target.value)}
            className="w-24 px-3 py-2 text-gray-900 rounded-lg font-semibold text-center focus:ring-2 focus:ring-white"
          />
          <span className="text-lg font-bold">%</span>
          <div className="ml-auto flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
            <span className="text-sm">延長数KPI:</span>
            <span className="text-2xl font-bold">{stats.extensionCountKPI}</span>
            <span className="text-sm">件</span>
          </div>
        </div>
      </div>

      {/* メインKPIカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長審査対象</p>
          <p className="text-3xl font-bold text-gray-900">{examinationTargetCount}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長確度記入済み</p>
          <p className="text-3xl font-bold text-blue-600">{stats.certaintyFilledCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.hearingStudents.length > 0 ? 
              `${((stats.certaintyFilledCount / stats.hearingStudents.length) * 100).toFixed(1)}%` : 
              '0%'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長数</p>
          <p className="text-3xl font-bold text-green-600">{stats.extensionCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            目標まで残り {Math.max(0, stats.extensionCountKPI - stats.extensionCount)} 件
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">退会数</p>
          <p className="text-3xl font-bold text-red-600">{stats.withdrawalCount}</p>
        </div>
      </div>

      {/* 延長率 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長率（対 審査対象）</p>
          <p className="text-3xl font-bold text-purple-600">{stats.extensionRate.toFixed(2)}%</p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.extensionCount} / {examinationTargetCount} × 100
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長率（対 結果お伝え）</p>
          <p className="text-3xl font-bold text-indigo-600">{stats.extensionRateVsResult.toFixed(2)}%</p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.extensionCount} / {stats.extensionCount + stats.withdrawalCount} × 100
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">残弾数</p>
          <p className="text-3xl font-bold text-orange-600">{stats.remainingCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            未決定の対象者
          </p>
        </div>
      </div>

      {/* 延長確度 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長確度「高」</p>
          <p className="text-3xl font-bold text-green-600">{stats.certaintyHigh}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長確度「中」</p>
          <p className="text-3xl font-bold text-yellow-600">{stats.certaintyMid}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長確度「低」</p>
          <p className="text-3xl font-bold text-red-600">{stats.certaintyLow}</p>
        </div>
      </div>

      {/* 延長審査1回目・2回目 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 延長審査1回目（5ヶ月目）</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">対象数:</span>
              <span className="text-2xl font-bold text-gray-900">{stats.exam1stTargetCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">延長数:</span>
              <span className="text-2xl font-bold text-green-600">{stats.exam1stExtensionCount}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t">
              <span className="text-sm font-semibold text-gray-700">延長率:</span>
              <span className="text-3xl font-bold text-purple-600">{stats.exam1stExtensionRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 延長審査2回目（11ヶ月目）</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">対象数:</span>
              <span className="text-2xl font-bold text-gray-900">{stats.exam2ndTargetCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">延長数:</span>
              <span className="text-2xl font-bold text-green-600">{stats.exam2ndExtensionCount}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t">
              <span className="text-sm font-semibold text-gray-700">延長率:</span>
              <span className="text-3xl font-bold text-purple-600">{stats.exam2ndExtensionRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* システム概要 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">システム概要</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            <span className="font-semibold">📊 データソース:</span> Notion API + Google Spreadsheet
          </p>
          <p>
            <span className="font-semibold">🎤 ヒアリング一覧:</span> レッスン開始月から4ヶ月目・10ヶ月目の生徒
          </p>
          <p>
            <span className="font-semibold">📋 延長審査一覧:</span> レッスン開始月から5ヶ月目・11ヶ月目の生徒
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
