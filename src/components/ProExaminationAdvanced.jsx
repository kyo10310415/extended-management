/**
 * ProExaminationAdvanced.jsx
 *
 * PROプラン継続月数に基づく「4回目以降の延長審査」一覧。
 *
 * ・4回目審査 : PROプラン継続 5 か月目
 * ・5回目審査 : PROプラン継続 11 か月目
 * ・6回目審査 : PROプラン継続 17 か月目
 * ・以降 6 か月ごと
 *
 * API: GET /api/pro-plan/advanced-examination?round=N&monthOffset=M
 */
import { useState, useEffect, useMemo } from 'react'
import StudentTable from './StudentTable'

// N 回目審査が何か月目か（サーバーと同じロジック）
function examMonth(round) {
  return 5 + (round - 4) * 6
}

// 表示できる最大回数
const MAX_ROUND = 10

function ProExaminationAdvanced() {
  const [round, setRound] = useState(4)
  const [monthOffset, setMonthOffset] = useState(0)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const [searchFilters, setSearchFilters] = useState({
    studentId: '',
    name: '',
    tutor: '',
    extension_certainty: '',
    examination_result: '',
  })

  useEffect(() => {
    fetchStudents()
  }, [round, monthOffset])

  const fetchStudents = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(
        `/api/pro-plan/advanced-examination?round=${round}&monthOffset=${monthOffset}`
      )
      const data = await res.json()
      if (data.success) {
        setStudents(data.data || [])
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('Error fetching advanced examination students:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await fetchStudents()
      alert('✅ 最新データに更新しました！')
    } catch (err) {
      console.error('更新エラー:', err)
      alert('❌ 更新に失敗しました: ' + err.message)
      setRefreshing(false)
    }
  }

  const handleUpdate = async (studentId, updatedData) => {
    try {
      const cycle = round
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedData, cycle }),
      })
      const data = await res.json()
      if (data.success) {
        setStudents(prev =>
          prev.map(s => s.studentId === studentId ? { ...s, extensionData: data.data } : s)
        )
      }
    } catch (err) {
      console.error('handleUpdate error:', err)
    }
  }

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (searchFilters.studentId && !s.studentId?.toLowerCase().includes(searchFilters.studentId.toLowerCase())) return false
      if (searchFilters.name    && !s.name?.toLowerCase().includes(searchFilters.name.toLowerCase()))    return false
      if (searchFilters.tutor   && !s.tutor?.toLowerCase().includes(searchFilters.tutor.toLowerCase()))   return false
      if (searchFilters.extension_certainty) {
        const ec = s.extensionData?.[`extension_certainty_${round}`]
        if (ec !== searchFilters.extension_certainty) return false
      }
      if (searchFilters.examination_result) {
        const er = s.extensionData?.[`examination_result_${round}`]
        if (!er?.includes(searchFilters.examination_result)) return false
      }
      return true
    })
  }, [students, searchFilters, round])

  // ─────────── ローディング UI ───────────
  if (loading && !refreshing) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (refreshing) {
    return (
      <>
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 shadow-xl flex flex-col items-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mb-4"></div>
            <p className="text-lg font-semibold text-gray-800">読み込み中...</p>
            <p className="text-sm text-gray-600 mt-2">最新データを取得しています</p>
          </div>
        </div>
        <div className="opacity-50 pointer-events-none">
          <h2 className="text-2xl font-bold text-gray-900">📝 Proプラン延長審査（4回目以降）</h2>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">エラーが発生しました: {error}</p>
      </div>
    )
  }

  const targetMonth = examMonth(round)

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            📝 Proプラン延長審査（4回目以降）
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            現在：<span className="font-semibold text-primary">{round}回目</span>
            　対象月：<span className="font-semibold text-primary">PRO継続 {targetMonth}か月目</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 更新ボタン */}
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition shadow text-sm"
          >
            🔄 最新データに更新
          </button>

          {/* 回数セレクタ */}
          <div className="flex items-center gap-2 bg-white rounded-lg shadow px-3 py-2">
            <span className="text-xs text-gray-600">回数:</span>
            {Array.from({ length: MAX_ROUND - 3 }, (_, i) => i + 4).map(r => (
              <button
                key={r}
                onClick={() => setRound(r)}
                className={`px-3 py-1 text-xs rounded transition ${
                  round === r
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {r}回目<br/>
                <span className="text-[10px]">({examMonth(r)}か月目)</span>
              </button>
            ))}
          </div>

          {/* 月切り替えボタン */}
          <div className="flex items-center gap-2 bg-white rounded-lg shadow px-3 py-2 flex-wrap">
            <span className="text-xs text-gray-600">対象月:</span>
            {[-6, -5, -4, -3, -2, -1, 0, 1].map(offset => {
              const label = (() => {
                if (offset === 0) return '今月';
                if (offset === 1) return '翌月';
                const d = new Date();
                d.setMonth(d.getMonth() + offset);
                return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;
              })();
              return (
                <button
                  key={offset}
                  onClick={() => setMonthOffset(offset)}
                  className={`px-2 py-1 text-xs rounded transition ${
                    monthOffset === offset
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
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
              onChange={(e) => setSearchFilters({ ...searchFilters, studentId: e.target.value })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">生徒名</label>
            <input
              type="text"
              placeholder="例：山田"
              value={searchFilters.name}
              onChange={(e) => setSearchFilters({ ...searchFilters, name: e.target.value })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">担当Tutor</label>
            <input
              type="text"
              placeholder="例：ごう"
              value={searchFilters.tutor}
              onChange={(e) => setSearchFilters({ ...searchFilters, tutor: e.target.value })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">延長確度</label>
            <select
              value={searchFilters.extension_certainty}
              onChange={(e) => setSearchFilters({ ...searchFilters, extension_certainty: e.target.value })}
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
            <label className="block text-xs text-gray-600 mb-1">審査結果</label>
            <select
              value={searchFilters.examination_result}
              onChange={(e) => setSearchFilters({ ...searchFilters, examination_result: e.target.value })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="">すべて</option>
              <option value="延長">延長</option>
              <option value="在籍">在籍</option>
              <option value="退会">退会</option>
              <option value="永久会員">永久会員</option>
              <option value="未払い">未払い</option>
              <option value="音信不通">音信不通</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            表示中: <span className="font-semibold text-primary">{filteredStudents.length}</span> / {students.length} 件
          </p>
          <button
            onClick={() => setSearchFilters({ studentId: '', name: '', tutor: '', extension_certainty: '', examination_result: '' })}
            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
          >
            🔄 リセット
          </button>
        </div>
      </div>

      {/* 生徒テーブル / 空メッセージ */}
      {students.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <p className="text-lg mb-2">対象の生徒はいません</p>
          <p className="text-sm text-gray-400">
            {round}回目審査（PRO継続 {targetMonth}か月目）に該当する生徒が見つかりません。
          </p>
          <p className="text-xs text-gray-400 mt-2">
            ※ 外部DBに pro_plan_start_date が登録されている必要があります
          </p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          検索条件に一致する生徒はいません
        </div>
      ) : (
        <>
          {/* 追加情報バナー */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
            <span className="font-semibold">📋 {round}回目延長審査対象</span>：
            PROプラン開始から {targetMonth}か月目の生徒 {filteredStudents.length} 名
          </div>
          <StudentTable
            students={filteredStudents.map(s => ({
              ...s,
              extensionData: s.extensionData
                ? {
                    extension_certainty: s.extensionData[`extension_certainty_${round}`],
                    hearing_status:      s.extensionData[`hearing_status_${round}`],
                    examination_result:  s.extensionData[`examination_result_${round}`],
                    notes:               s.extensionData[`notes_${round}`],
                  }
                : null,
              monthsElapsed: s.proPlanMonths,
              adjustedMonths: s.proPlanMonths,
            }))}
            onUpdate={handleUpdate}
            showHearingColumn={false}
            showExaminationColumn={true}
          />
        </>
      )}
    </div>
  )
}

export default ProExaminationAdvanced
