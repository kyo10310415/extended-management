import { useState, useEffect } from 'react'
import StudentTable from './StudentTable'

function ProPlanList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  
  // 検索フィルター
  const [searchFilters, setSearchFilters] = useState({
    studentId: '',
    name: '',
    tutor: '',
  })

  useEffect(() => {
    fetchProPlanStudents()
  }, [])

  const fetchProPlanStudents = async () => {
    try {
      setLoading(true)
      setRefreshing(false)
      
      // Notionから全生徒データを取得
      const response = await fetch('/api/notion/students')
      const data = await response.json()

      if (data.success) {
        // 永久会員のみをフィルタリング
        const proPlanStudents = data.data.filter(s => s.plan === '永久会員')
        
        // 学籍番号のリストを取得
        const studentIds = proPlanStudents.map(s => s.studentId)
        
        // Proプラン管理データを一括取得
        let proPlanData = {}
        if (studentIds.length > 0) {
          const res = await fetch('/api/pro-plan/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentIds }),
          })
          const bulkData = await res.json()
          proPlanData = bulkData.data || {}
        }
        
        // データをマージ
        const enrichedStudents = proPlanStudents.map(student => ({
          ...student,
          proPlanData: proPlanData[student.studentId] || null,
        }))

        setStudents(enrichedStudents)
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('Error fetching pro plan students:', err)
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
      await fetchProPlanStudents()
    } catch (err) {
      console.error('Error refreshing data:', err)
      setError(err.message)
    }
  }

  // 検索フィルター適用
  const filteredStudents = students.filter(student => {
    if (searchFilters.studentId && !student.studentId?.toLowerCase().includes(searchFilters.studentId.toLowerCase())) {
      return false
    }
    if (searchFilters.name && !student.name?.toLowerCase().includes(searchFilters.name.toLowerCase())) {
      return false
    }
    if (searchFilters.tutor && !student.tutor?.toLowerCase().includes(searchFilters.tutor.toLowerCase())) {
      return false
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">エラー: {error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Proプラン管理</h2>
          <p className="text-sm text-gray-600 mt-1">
            永久会員: {filteredStudents.length} / {students.length} 名
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              担任
            </label>
            <input
              type="text"
              value={searchFilters.tutor}
              onChange={(e) => setSearchFilters({ ...searchFilters, tutor: e.target.value })}
              placeholder="担任で検索"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* 生徒テーブル */}
      <StudentTable students={filteredStudents} type="pro-plan" onRefresh={fetchProPlanStudents} />
    </div>
  )
}

export default ProPlanList
