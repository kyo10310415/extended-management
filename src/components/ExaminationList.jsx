import { useState, useEffect, useMemo } from 'react'
import StudentTable from './StudentTable'

function ExaminationList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false) // 手動更新中フラグ
  const [monthOffset, setMonthOffset] = useState(0) // -1: 前月, 0: 今月, 1: 翌月
  
  // 検索フィルター
  const [searchFilters, setSearchFilters] = useState({
    studentId: '',
    name: '',
    tutor: '',
    extension_certainty: '',
    examination_result: '',
  })

  useEffect(() => {
    fetchExaminationStudents()
  }, [monthOffset])

  const fetchExaminationStudents = async () => {
    try {
      setLoading(true)
      setRefreshing(false) // 初回読み込みの場合はrefreshingをfalseに
      const response = await fetch(`/api/notion/examination?monthOffset=${monthOffset}`)
      const data = await response.json()

      if (data.success) {
        // 調整後月数が5ヶ月目と11ヶ月目の生徒を分ける
        const month5Students = data.data.filter(s => s.adjustedMonths === 5);
        const month11Students = data.data.filter(s => s.adjustedMonths === 11);
        
        // それぞれのサイクルで一括取得
        const cycle1Ids = month5Students.map(s => s.studentId);
        const cycle2Ids = month11Students.map(s => s.studentId);
        
        // サイクル1のデータ取得（5ヶ月目）
        let cycle1Data = {};
        if (cycle1Ids.length > 0) {
          const res1 = await fetch('/api/students/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentIds: cycle1Ids, cycle: 1 }),
          });
          const data1 = await res1.json();
          cycle1Data = data1.data || {};
        }
        
        // サイクル2のデータ取得（11ヶ月目）
        let cycle2Data = {};
        if (cycle2Ids.length > 0) {
          const res2 = await fetch('/api/students/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentIds: cycle2Ids, cycle: 2 }),
          });
          const data2 = await res2.json();
          cycle2Data = data2.data || {};
        }

        // データをマージ（各生徒のサイクルを個別に判定）
        const enrichedStudents = data.data.map(student => {
          const cycle = student.adjustedMonths === 11 ? 2 : 1;
          const extensionData = cycle === 1 ? cycle1Data[student.studentId] : cycle2Data[student.studentId];
          
          return {
            ...student,
            cycle,  // 個別のサイクル情報を保存
            extensionData: extensionData || null,
          };
        });

        // 延長確度が「対象外」の生徒を除外
        const filteredStudents = enrichedStudents.filter(student => 
          student.extensionData?.extension_certainty !== '対象外'
        );

        setStudents(filteredStudents)
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('Error fetching examination students:', err)
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
      await fetchExaminationStudents()
      
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
      // 対象生徒のサイクル情報を取得
      const student = students.find(s => s.studentId === studentId);
      const cycle = student?.cycle || 1;
      
      console.log('📝 handleUpdate 呼び出し (延長審査)');
      console.log('  学籍番号:', studentId);
      console.log('  継続月数:', student?.monthsElapsed);
      console.log('  サイクル:', cycle);
      console.log('  更新データ:', updatedData);
      
      // 審査結果が入力された場合、フォームの送信状況を確認
      if (updatedData.examination_result) {
        console.log('  📋 審査結果が入力されました。フォームの送信状況を確認中...');
        
        try {
          const formCheckResponse = await fetch('/api/notifications/check-examination-form', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId }),
          });
          
          const formCheckData = await formCheckResponse.json();
          
          console.log('  フォーム確認結果:', formCheckData);
          
          // フォームが未送信の場合、警告を表示
          if (formCheckData.success && !formCheckData.hasSubmission) {
            alert('⚠️ 審査結果フォームが未送信です。フォームを送信してください');
          }
        } catch (formCheckError) {
          console.error('  ⚠️ フォーム確認エラー:', formCheckError);
          // フォーム確認エラーは更新処理を妨げない
        }
      }
      
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
      if (searchFilters.extension_certainty) {
        // "空白"が選択された場合はデータが空またはnullのものを検索
        if (searchFilters.extension_certainty === '空白') {
          const value = student.extensionData?.extension_certainty;
          if (value && value !== '') {
            return false;
          }
        } else {
          // 通常の検索
          if (student.extensionData?.extension_certainty !== searchFilters.extension_certainty) {
            return false;
          }
        }
      }
      
      // 審査結果フィルター
      if (searchFilters.examination_result) {
        // "空白"が選択された場合はデータが空またはnullのものを検索
        if (searchFilters.examination_result === '空白') {
          const value = student.extensionData?.examination_result;
          if (value && value !== '') {
            return false;
          }
        } else {
          // 通常の検索
          if (student.extensionData?.examination_result !== searchFilters.examination_result) {
            return false;
          }
        }
      }
      
      return true;
    });
  }, [students, searchFilters]);

  const getMonthLabel = () => {
    if (monthOffset === -1) return '前月';
    if (monthOffset === 1) return '翌月';
    return '今月';
  };

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
              <h2 className="text-2xl font-bold text-gray-900">📋 延長審査一覧</h2>
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
          📋 延長審査一覧（5ヶ月目・11ヶ月目）
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
            onClick={fetchExaminationStudents}
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
              <option value="空白">空白（未入力）</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">審査結果</label>
            <select
              value={searchFilters.examination_result}
              onChange={(e) => setSearchFilters({...searchFilters, examination_result: e.target.value})}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="">すべて</option>
              <option value="延長">延長</option>
              <option value="在籍">在籍</option>
              <option value="退会">退会</option>
              <option value="永久会員">永久会員</option>
              <option value="空白">空白（未入力）</option>
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
              examination_result: '',
            })}
            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
          >
            🔄 リセット
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          現在、延長審査対象の生徒はいません
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          検索条件に一致する生徒はいません
        </div>
      ) : (
        <StudentTable
          students={filteredStudents}
          onUpdate={handleUpdate}
          showExaminationColumn={true}
        />
      )}
    </div>
  )
}

export default ExaminationList
