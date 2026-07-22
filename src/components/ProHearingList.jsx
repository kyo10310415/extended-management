import { useState, useEffect, useMemo } from 'react'
import StudentTable from './StudentTable'

function ProHearingList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false) // 手動更新中フラグ
  const [monthOffset, setMonthOffset] = useState(0) // -6〜0: 過去月, 1: 翌月
  
  // 検索フィルター
  const [searchFilters, setSearchFilters] = useState({
    studentId: '',
    name: '',
    tutor: '',
    extension_certainty: '',
    hearing_status: 'all', // 'all', 'checked', 'unchecked'
  })

  useEffect(() => {
    fetchProHearingStudents()
  }, [monthOffset])

  const fetchProHearingStudents = async () => {
    try {
      setLoading(true)
      setRefreshing(false) // 初回読み込みの場合はrefreshingをfalseに
      const response = await fetch(`/api/notion/pro-hearing?monthOffset=${monthOffset}`)
      const data = await response.json()

      if (data.success) {
        // 調整後月数が16ヶ月目の生徒を取得
        const month16Students = data.data.filter(s => s.adjustedMonths === 16);
        
        // サイクル3のデータ取得（16ヶ月目）
        const cycle3Ids = month16Students.map(s => s.studentId);
        
        let cycle3Data = {};
        if (cycle3Ids.length > 0) {
          const res3 = await fetch('/api/students/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentIds: cycle3Ids, cycle: 3 }),
          });
          const data3 = await res3.json();
          cycle3Data = data3.data || {};
        }

        // データをマージ
        const enrichedStudents = data.data.map(student => {
          const extensionData = cycle3Data[student.studentId];
          
          return {
            ...student,
            cycle: 3,  // サイクル3（Proプラン）
            extensionData: extensionData || null,
          };
        });

        setStudents(enrichedStudents)
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('Error fetching pro hearing students:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // 手動更新機能（キャッシュクリア）
  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      
      // キャッシュクリア
      await fetch('/api/notion/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      // データ再取得
      await fetchProHearingStudents()
      
      // 成功アラート
      alert('✅ 最新データに更新しました！')
    } catch (err) {
      console.error('更新エラー:', err)
      alert('❌ 更新に失敗しました: ' + err.message)
      setRefreshing(false)
    }
  }

  const handleUpdate = async (studentId, updatedData) => {
    try {
      const student = students.find(s => s.studentId === studentId);
      const cycle = 3; // Proプランはサイクル3
      
      console.log('📝 handleUpdate 呼び出し (Proヒアリング)');
      console.log('  学籍番号:', studentId);
      console.log('  継続月数:', student?.monthsElapsed);
      console.log('  サイクル:', cycle);
      console.log('  更新データ:', updatedData);
      
      const response = await fetch(`/api/students/${studentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedData, cycle }),
      })

      const data = await response.json()

      console.log('  レスポンス:', data);

      if (data.success) {
        console.log('  ✅ 更新成功 - ローカル状態を更新');
        // ローカル状態を更新
        setStudents(prev =>
          prev.map(s =>
            s.studentId === studentId
              ? { ...s, extensionData: data.data }
              : s
          )
        )
      } else {
        console.error('  ❌ 更新失敗:', data.error);
      }
    } catch (err) {
      console.error('  ❌ エラー:', err)
    }
  }

  // フィルター済み生徒リスト
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

  if (loading && !refreshing) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // 読み込み中オーバーレイ
  if (refreshing) {
    return (
      <>
        {/* 読み込み中オーバーレイ */}
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 shadow-xl flex flex-col items-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mb-4"></div>
            <p className="text-lg font-semibold text-gray-800">読み込み中...</p>
            <p className="text-sm text-gray-600 mt-2">最新データを取得しています</p>
          </div>
        </div>
        {/* 既存のコンテンツ（薄く表示） */}
        <div className="opacity-50 pointer-events-none">
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">🎤 Proプランヒアリング一覧</h2>
            </div>
          </div>
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          🎤 Proプランヒアリング一覧（16ヶ月目）
        </h2>
        <div className="flex items-center gap-3">
          {/* 更新ボタン */}
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition shadow"
          >
            🔄 最新データに更新
          </button>
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
          現在、Proプランヒアリング対象の生徒はいません
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

export default ProHearingList
