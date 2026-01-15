import { useState, useEffect } from 'react'

function StudentMaster() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTutor, setFilterTutor] = useState('')
  const [activeStatusTab, setActiveStatusTab] = useState('すべて')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ステータスのタブ定義
  const statusTabs = [
    { name: 'すべて', color: 'gray', icon: '📊' },
    { name: 'アクティブ', color: 'green', icon: '✅' },
    { name: '正規退会', color: 'red', icon: '🚪' },
    { name: '休会', color: 'yellow', icon: '⏸️' },
    { name: 'レッスン準備中', color: 'blue', icon: '🔄' },
    { name: '無断キャンセル', color: 'orange', icon: '⚠️' },
  ]

  useEffect(() => {
    fetchAllStudents()
  }, [])

  const fetchAllStudents = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/notion/students')
      const data = await response.json()

      if (data.success) {
        setStudents(data.data)
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('Error fetching students:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // キャッシュをクリアして再取得
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true)
      
      // バックグラウンドサービスで更新
      const response = await fetch('/api/notion/update', { method: 'POST' })
      const result = await response.json()
      
      if (result.success) {
        // データを再取得
        await fetchAllStudents()
        alert(`✅ データを最新に更新しました！\n\n生徒数: ${result.studentsCount}件\n処理時間: ${result.duration}`)
      } else {
        throw new Error(result.error)
      }
    } catch (err) {
      console.error('Error refreshing:', err)
      alert('❌ 更新に失敗しました: ' + err.message)
    } finally {
      setIsRefreshing(false)
    }
  }

  // フィルタリング
  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesTutor = filterTutor === '' || student.tutor === filterTutor

    const matchesStatus = activeStatusTab === 'すべて' || student.status === activeStatusTab

    return matchesSearch && matchesTutor && matchesStatus
  })

  // Tutor一覧を取得
  const tutors = [...new Set(students.map(s => s.tutor).filter(Boolean))].sort()

  // ステータス別の件数を取得
  const getStatusCount = (status) => {
    if (status === 'すべて') return students.length
    return students.filter(s => s.status === status).length
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">生徒情報を読み込み中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">エラーが発生しました: {error}</p>
        <button
          onClick={fetchAllStudents}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          再試行
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          👥 生徒情報マスタ
        </h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRefreshing ? '🔄 更新中...' : '🔄 最新データに更新'}
        </button>
      </div>

      {/* ステータスタブ */}
      <div className="mb-6 bg-white rounded-lg shadow p-2">
        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => {
            const count = getStatusCount(tab.name)
            const isActive = activeStatusTab === tab.name
            
            return (
              <button
                key={tab.name}
                onClick={() => setActiveStatusTab(tab.name)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  isActive
                    ? `bg-${tab.color}-100 text-${tab.color}-800 ring-2 ring-${tab.color}-500`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={isActive ? {
                  backgroundColor: tab.color === 'gray' ? '#f3f4f6' : 
                                   tab.color === 'green' ? '#d1fae5' :
                                   tab.color === 'red' ? '#fee2e2' :
                                   tab.color === 'yellow' ? '#fef3c7' :
                                   tab.color === 'blue' ? '#dbeafe' :
                                   tab.color === 'orange' ? '#ffedd5' : '#f3f4f6',
                  color: tab.color === 'gray' ? '#374151' :
                         tab.color === 'green' ? '#065f46' :
                         tab.color === 'red' ? '#991b1b' :
                         tab.color === 'yellow' ? '#92400e' :
                         tab.color === 'blue' ? '#1e40af' :
                         tab.color === 'orange' ? '#9a3412' : '#374151'
                } : {}}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
                <span className="ml-2 text-sm font-bold">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* フィルター */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🔍 検索（名前・学籍番号）
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="検索..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              👨‍🏫 担任Tutor
            </label>
            <select
              value={filterTutor}
              onChange={(e) => setFilterTutor(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">すべて</option>
              {tutors.map(tutor => (
                <option key={tutor} value={tutor}>{tutor}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  学籍番号
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  生徒様名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  担任Tutor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  プラン
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  レッスン開始月
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  経過月数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  フォーム最終更新
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    該当する生徒が見つかりません
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {student.studentId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {student.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.tutor || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.plan || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.lessonStartDate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                      {student.monthsElapsed}ヶ月目
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        student.status === 'アクティブ' 
                          ? 'bg-green-100 text-green-800'
                          : student.status === '休会'
                          ? 'bg-yellow-100 text-yellow-800'
                          : student.status === '正規退会'
                          ? 'bg-red-100 text-red-800'
                          : student.status === 'レッスン準備中'
                          ? 'bg-blue-100 text-blue-800'
                          : student.status === '無断キャンセル'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {student.status || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.formLastUpdate || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        表示件数: {filteredStudents.length} / {students.length} 件
      </div>
    </div>
  )
}

export default StudentMaster
