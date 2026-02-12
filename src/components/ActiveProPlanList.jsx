import { useState, useEffect } from 'react'

function ActiveProPlanList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  
  // 検索フィルター
  const [searchFilters, setSearchFilters] = useState({
    studentId: '',
    name: '',
  })

  useEffect(() => {
    fetchActiveProPlanStudents()
  }, [])

  const fetchActiveProPlanStudents = async () => {
    try {
      console.log('🔄 Fetching active Pro plan students...')
      setLoading(true)
      setRefreshing(false)
      
      // Notionから全生徒データを取得
      const response = await fetch('/api/notion/students')
      const data = await response.json()

      console.log('📦 All students API response:', data)

      if (data.success) {
        // PROプランの生徒のみフィルタ
        const proStudents = (data.data || []).filter(s => s.plan === 'PROプラン')
        console.log('✅ Filtered Pro plan students:', proStudents.length)
        
        // Proプランデータを取得
        if (proStudents.length > 0) {
          const studentIds = proStudents.map(s => s.studentId)
          const proPlanRes = await fetch('/api/pro-plan/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentIds }),
          })
          const proPlanData = await proPlanRes.json()
          
          // データをマージ
          const enrichedStudents = proStudents.map(student => ({
            ...student,
            proPlanStartMonth: proPlanData.data?.[student.studentId]?.pro_plan_start_month || null,
          }))
          
          setStudents(enrichedStudents)
        } else {
          setStudents([])
        }
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('❌ Error fetching active pro plan students:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // 手動更新機能
  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      
      // キャッシュクリア
      await fetch('/api/notion/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      // データ再取得
      await fetchActiveProPlanStudents()
    } catch (err) {
      console.error('Error refreshing data:', err)
      alert(`更新エラー: ${err.message}`)
    }
  }

  // 検索フィルターを適用
  const filteredStudents = students.filter(student => {
    if (searchFilters.studentId && !student.studentId?.toLowerCase().includes(searchFilters.studentId.toLowerCase())) {
      return false
    }
    if (searchFilters.name && !student.name?.includes(searchFilters.name)) {
      return false
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl text-gray-600">読み込み中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">エラー: {error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          ページをリロード
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">⭐ Proプラン受講中</h2>
          <p className="text-sm text-gray-600 mt-1">
            PROプラン受講者: {filteredStudents.length} / {students.length} 名
          </p>
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
            refreshing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {refreshing ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              更新中...
            </>
          ) : (
            <>
              🔄 最新データに更新
            </>
          )}
        </button>
      </div>

      {/* 検索フィルター */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              学籍番号
            </label>
            <input
              type="text"
              value={searchFilters.studentId}
              onChange={(e) => setSearchFilters({ ...searchFilters, studentId: e.target.value })}
              placeholder="学籍番号で検索"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              生徒様名
            </label>
            <input
              type="text"
              value={searchFilters.name}
              onChange={(e) => setSearchFilters({ ...searchFilters, name: e.target.value })}
              placeholder="名前で検索"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* 生徒テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">学籍番号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">契約プラン</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proプラン開始月</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                    該当する生徒が見つかりません
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.studentId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      {student.notionUrl ? (
                        <a 
                          href={student.notionUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {student.studentId}
                        </a>
                      ) : (
                        student.studentId
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{student.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        {student.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {student.proPlanStartMonth || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default ActiveProPlanList
