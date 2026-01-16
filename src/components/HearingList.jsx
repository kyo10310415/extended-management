import { useState, useEffect, useMemo } from 'react'
import StudentTable from './StudentTable'

function HearingList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [monthOffset, setMonthOffset] = useState(0) // -1: 前月, 0: 今月, 1: 翌月
  
  // 検索フィルター
  const [searchFilters, setSearchFilters] = useState({
    studentId: '',
    name: '',
    tutor: '',
    extension_certainty: '',
    hearing_status: 'all', // 'all', 'checked', 'unchecked'
  })

  useEffect(() => {
    fetchHearingStudents()
  }, [monthOffset])

  const fetchHearingStudents = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/notion/hearing?monthOffset=${monthOffset}`)
      const data = await response.json()

      if (data.success) {
        // 延長管理データを一括取得
        const studentIds = data.data.map(s => s.studentId)
        const extensionsRes = await fetch('/api/students/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds }),
        })
        const extensionsData = await extensionsRes.json()

        // データをマージ
        const enrichedStudents = data.data.map(student => ({
          ...student,
          extensionData: extensionsData.data?.[student.studentId] || null,
        }))

        setStudents(enrichedStudents)
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('Error fetching hearing students:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (studentId, updatedData) => {
    try {
      const response = await fetch(`/api/students/${studentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      })

      const data = await response.json()

      if (data.success) {
        // ローカル状態を更新
        setStudents(prev =>
          prev.map(s =>
            s.studentId === studentId
              ? { ...s, extensionData: data.data }
              : s
          )
        )
      }
    } catch (err) {
      console.error('Error updating student:', err)
    }
  }

  // フィルター済み生徒リスト（フックはトップレベルで呼ぶ必要がある）
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // 学籍番号フィルター
      if (searchFilters.studentId && !student.studentId?.toLowerCase().includes(searchFilters.studentId.toLowerCase())) {
        return false;
      }
      
      // 生徒名フィルター
      if (searchFilters.name && !student.name?.toLowerCase().includes(searchFilters.name.toLowerCase())) {
        return false;
      }
      
      // 担当Tutorフィルター
      if (searchFilters.tutor && !student.tutor?.toLowerCase().includes(searchFilters.tutor.toLowerCase())) {
        return false;
      }
      
      // 延長確度フィルター
      if (searchFilters.extension_certainty && student.extensionData?.extension_certainty !== searchFilters.extension_certainty) {
        return false;
      }
      
      // ヒアリングステータスフィルター
      if (searchFilters.hearing_status === 'checked' && !student.extensionData?.hearing_status) {
        return false;
      }
      if (searchFilters.hearing_status === 'unchecked' && student.extensionData?.hearing_status) {
        return false;
      }
      
      return true;
    });
  }, [students, searchFilters]);

  const getMonthLabel = () => {
    if (monthOffset === -1) return '前月';
    if (monthOffset === 1) return '翌月';
    return '今月';
  };

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
          🎤 ヒアリング一覧（4ヶ月目・10ヶ月目）
        </h2>
        <div className="flex items-center gap-3">
          {/* 月切り替えボタン */}
          <div className="flex items-center gap-2 bg-white rounded-lg shadow px-3 py-2">
            <span className="text-xs text-gray-600">対象月:</span>
            <button
              onClick={() => setMonthOffset(-1)}
              className={`px-3 py-1 text-xs rounded transition ${
                monthOffset === -1
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              前月
            </button>
            <button
              onClick={() => setMonthOffset(0)}
              className={`px-3 py-1 text-xs rounded transition ${
                monthOffset === 0
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              今月
            </button>
            <button
              onClick={() => setMonthOffset(1)}
              className={`px-3 py-1 text-xs rounded transition ${
                monthOffset === 1
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              翌月
            </button>
          </div>
          <button
            onClick={fetchHearingStudents}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
          >
            🔄 更新
          </button>
        </div>
      </div>

      {/* 検索フィルター */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">🔍 検索フィルター（AND検索）</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">学籍番号</label>
            <input
              type="text"
              placeholder="例：W12345"
              value={searchFilters.studentId}
              onChange={(e) => setSearchFilters({...searchFilters, studentId: e.target.value})}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">生徒名</label>
            <input
              type="text"
              placeholder="例：山田"
              value={searchFilters.name}
              onChange={(e) => setSearchFilters({...searchFilters, name: e.target.value})}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">担当Tutor</label>
            <input
              type="text"
              placeholder="例：ごう"
              value={searchFilters.tutor}
              onChange={(e) => setSearchFilters({...searchFilters, tutor: e.target.value})}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">延長確度</label>
            <select
              value={searchFilters.extension_certainty}
              onChange={(e) => setSearchFilters({...searchFilters, extension_certainty: e.target.value})}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="">すべて</option>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
              <option value="対象外">対象外</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">ヒアリング</label>
            <select
              value={searchFilters.hearing_status}
              onChange={(e) => setSearchFilters({...searchFilters, hearing_status: e.target.value})}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="all">すべて</option>
              <option value="checked">チェック済み</option>
              <option value="unchecked">未チェック</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            表示中: <span className="font-semibold text-primary">{filteredStudents.length}</span> / {students.length} 件
          </p>
          <button
            onClick={() => setSearchFilters({
              studentId: '',
              name: '',
              tutor: '',
              extension_certainty: '',
              hearing_status: 'all',
            })}
            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
          >
            🔄 リセット
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          現在、ヒアリング対象の生徒はいません
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          検索条件に一致する生徒はいません
        </div>
      ) : (
        <StudentTable
          students={filteredStudents}
          onUpdate={handleUpdate}
          showHearingColumn={true}
        />
      )}
    </div>
  )
}

export default HearingList
