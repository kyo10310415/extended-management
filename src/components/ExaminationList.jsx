import { useState, useEffect } from 'react'
import StudentTable from './StudentTable'

function ExaminationList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchExaminationStudents()
  }, [])

  const fetchExaminationStudents = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/notion/examination')
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
      console.error('Error fetching examination students:', err)
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
          📋 延長審査一覧（5ヶ月目）
        </h2>
        <button
          onClick={fetchExaminationStudents}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
        >
          🔄 更新
        </button>
      </div>

      {students.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          現在、延長審査対象の生徒はいません
        </div>
      ) : (
        <StudentTable
          students={students}
          onUpdate={handleUpdate}
          showExaminationColumn={true}
        />
      )}
    </div>
  )
}

export default ExaminationList
