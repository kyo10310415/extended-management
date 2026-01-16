import { useState, useEffect } from 'react'

function SuspensionList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchSuspensionStudents()
  }, [])

  const fetchSuspensionStudents = async () => {
    try {
      setLoading(true)
      // 全生徒データを取得
      const response = await fetch('/api/notion/students')
      const data = await response.json()

      if (data.success) {
        // 休会歴がある生徒のみをフィルター
        const suspensionStudents = data.data.filter(
          student => student.suspensionMonths > 0 || student.hasSuspensionHistory
        )
        setStudents(suspensionStudents)
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('Error fetching suspension students:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 検索フィルター
  const filteredStudents = students.filter(student => {
    const searchLower = searchTerm.toLowerCase()
    return (
      student.name?.toLowerCase().includes(searchLower) ||
      student.studentId?.toLowerCase().includes(searchLower) ||
      student.tutor?.toLowerCase().includes(searchLower)
    )
  })

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">エラーが発生しました: {error}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          ⏸️ 休会歴一覧
        </h2>
        <button
          onClick={fetchSuspensionStudents}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
        >
          🔄 更新
        </button>
      </div>

      {/* 検索バー */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="生徒名、学籍番号、担任Tutorで検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {/* 統計情報 */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">休会歴のある生徒数</p>
            <p className="text-2xl font-bold text-orange-600">{students.length}名</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">現在表示中</p>
            <p className="text-2xl font-bold text-gray-900">{filteredStudents.length}名</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">平均休会期間</p>
            <p className="text-2xl font-bold text-gray-900">
              {students.length > 0
                ? (students.reduce((sum, s) => sum + (s.suspensionMonths || 0), 0) / students.length).toFixed(1)
                : 0}ヶ月
            </p>
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          休会歴のある生徒はいません
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                    学籍番号
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                    生徒様名
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                    担任
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                    ステータス
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                    開始月
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                    継続
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                    休会
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                    調整後
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-2 py-1 whitespace-nowrap text-xs font-medium text-gray-900">
                      {student.studentId}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-900">
                      {student.name}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-500">
                      {student.tutor || '-'}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        student.status === 'アクティブ'
                          ? 'bg-green-100 text-green-800'
                          : student.status === '休会'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {student.status}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-500">
                      {student.lessonStartDate}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {student.monthsElapsed || 0}ヶ月
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                        {student.suspensionMonths || 0}ヶ月
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                        {student.adjustedMonths || student.monthsElapsed || 0}ヶ月
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default SuspensionList
