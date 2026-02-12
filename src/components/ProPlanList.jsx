import { useState, useEffect } from 'react'

function ProPlanList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState({})
  
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
      console.log('🔄 Fetching Pro plan students...')
      setLoading(true)
      setRefreshing(false)
      
      // 永久会員の生徒一覧を取得（Proプランデータも含む）
      const response = await fetch('/api/pro-plan/students')
      console.log('📡 Response status:', response.status)
      
      const data = await response.json()
      console.log('📦 Pro plan students API response:', data)
      console.log('📊 Student count:', data.count)
      console.log('👥 Students array length:', data.data?.length)

      if (data.success) {
        const studentsData = data.data || []
        console.log('✅ Setting students state with', studentsData.length, 'students')
        setStudents(studentsData)
      } else {
        console.error('❌ API error:', data.error)
        setError(data.error)
      }
    } catch (err) {
      console.error('❌ Error fetching pro plan students:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
      console.log('✅ Fetch complete')
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
      alert(`更新エラー: ${err.message}`)
    }
  }

  // Proプラン開始月を更新
  const handleProPlanStartMonthChange = async (studentId, value) => {
    try {
      setSaving({ ...saving, [studentId]: true })
      
      const student = students.find(s => s.studentId === studentId)
      
      const response = await fetch(`/api/pro-plan/${studentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_plan_start_month: value,
          promotion_reviewed: student?.promotionReviewed || false,
          pro_plan_status: student?.proPlanStatus || '',
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        // ローカル状態を更新
        setStudents(prev => prev.map(s => 
          s.studentId === studentId 
            ? { ...s, proPlanStartMonth: value }
            : s
        ))
      } else {
        alert(`保存エラー: ${data.error}`)
      }
    } catch (err) {
      console.error('Error saving pro plan start month:', err)
      alert(`保存エラー: ${err.message}`)
    } finally {
      setSaving(prev => ({ ...prev, [studentId]: false }))
    }
  }

  // 昇格審査済みチェックボックスを更新
  const handlePromotionReviewedToggle = async (studentId, checked) => {
    try {
      setSaving({ ...saving, [studentId]: true })
      
      const student = students.find(s => s.studentId === studentId)
      
      const response = await fetch(`/api/pro-plan/${studentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_plan_start_month: student?.proPlanStartMonth || null,
          promotion_reviewed: checked,
          pro_plan_status: student?.proPlanStatus || '',
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        // ローカル状態を更新
        setStudents(prev => prev.map(s => 
          s.studentId === studentId 
            ? { ...s, promotionReviewed: checked }
            : s
        ))
      } else {
        alert(`保存エラー: ${data.error}`)
      }
    } catch (err) {
      console.error('Error saving promotion reviewed:', err)
      alert(`保存エラー: ${err.message}`)
    } finally {
      setSaving(prev => ({ ...prev, [studentId]: false }))
    }
  }

  // Proプランステータスを更新
  const handleProPlanStatusChange = async (studentId, status) => {
    try {
      setSaving({ ...saving, [studentId]: true })
      
      const student = students.find(s => s.studentId === studentId)
      
      const response = await fetch(`/api/pro-plan/${studentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_plan_start_month: student?.proPlanStartMonth || null,
          promotion_reviewed: student?.promotionReviewed || false,
          pro_plan_status: status,
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        // ローカル状態を更新
        setStudents(prev => prev.map(s => 
          s.studentId === studentId 
            ? { ...s, proPlanStatus: status }
            : s
        ))
      } else {
        alert(`保存エラー: ${data.error}`)
      }
    } catch (err) {
      console.error('Error saving pro plan status:', err)
      alert(`保存エラー: ${err.message}`)
    } finally {
      setSaving(prev => ({ ...prev, [studentId]: false }))
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
    if (searchFilters.tutor && !student.tutor?.includes(searchFilters.tutor)) {
      return false
    }
    return true
  })

  // デバッグログ
  console.log('🎨 Rendering ProPlanList component')
  console.log('📊 State:', {
    loading,
    error,
    studentsCount: students.length,
    filteredStudentsCount: filteredStudents.length,
  })

  if (loading) {
    console.log('⏳ Showing loading state')
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl text-gray-600">読み込み中...</div>
      </div>
    )
  }

  if (error) {
    console.log('❌ Showing error state:', error)
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

  console.log('✅ Rendering table with', filteredStudents.length, 'students')

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">👑 Proプラン管理</h2>
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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">学籍番号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">担任</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">契約プラン</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">レッスン開始月</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proプラン開始月</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">昇格審査済み</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proプラン</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
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
                    <td className="px-4 py-3 text-sm">{student.tutor}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {student.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{student.lessonStartDate}</td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="month"
                        value={student.proPlanStartMonth || ''}
                        onChange={(e) => handleProPlanStartMonthChange(student.studentId, e.target.value)}
                        disabled={saving[student.studentId]}
                        className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={student.promotionReviewed || false}
                          onChange={(e) => handlePromotionReviewedToggle(student.studentId, e.target.checked)}
                          disabled={saving[student.studentId]}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center">
                        <select
                          value={student.proPlanStatus || ''}
                          onChange={(e) => handleProPlanStatusChange(student.studentId, e.target.value)}
                          disabled={saving[student.studentId]}
                          className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          <option value="">空白</option>
                          <option value="確定">確定</option>
                        </select>
                        {saving[student.studentId] && (
                          <span className="ml-2 text-xs text-gray-500">保存中...</span>
                        )}
                      </div>
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

export default ProPlanList
