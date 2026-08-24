import { useState, useMemo, useCallback } from 'react'

function StudentTable({
  students,
  onUpdate,
  showHearingColumn,
  showExaminationColumn,
  showStatusColumn,
  showLessonDatesColumn = false,
}) {
  const [editingStudent, setEditingStudent] = useState(null)
  const [formData, setFormData] = useState({})
  const [sortField, setSortField] = useState('tutor') // デフォルトで担任Tutorでソート
  const [sortDirection, setSortDirection] = useState('asc')

  const handleEdit = useCallback((student) => {
    setEditingStudent(student.studentId)
    setFormData({
      extension_certainty: student.extensionData?.extension_certainty || '',
      hearing_status: student.extensionData?.hearing_status || false,
      examination_result: student.extensionData?.examination_result || '',
      notes: student.extensionData?.notes || '',
    })
  }, [])

  const handleSave = useCallback(async (studentId) => {
    await onUpdate(studentId, formData)
    setEditingStudent(null)
  }, [formData, onUpdate])

  const handleCancel = useCallback(() => {
    setEditingStudent(null)
    setFormData({})
  }, [])

  // ソート機能
  const handleSort = useCallback((field) => {
    setSortField(prevField => {
      if (prevField === field) {
        setSortDirection(prevDir => prevDir === 'asc' ? 'desc' : 'asc')
        return prevField
      } else {
        setSortDirection('asc')
        return field
      }
    })
  }, [])

  // ソート後の生徒リスト
  const sortedStudents = useMemo(() => {
    if (!sortField) return students

    return [...students].sort((a, b) => {
      let aValue = a[sortField] || ''
      let bValue = b[sortField] || ''

      // 文字列比較
      if (sortDirection === 'asc') {
        return aValue.localeCompare(bValue, 'ja')
      } else {
        return bValue.localeCompare(aValue, 'ja')
      }
    })
  }, [students, sortField, sortDirection])

  return (
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
              <th 
                className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('tutor')}
              >
                <div className="flex items-center">
                  担任
                  {sortField === 'tutor' && (
                    <span className="ml-1 text-xs">
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </div>
              </th>
              {showStatusColumn && (
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                  ステータス
                </th>
              )}
              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                プラン
              </th>
              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                開始月
              </th>
              {showLessonDatesColumn && (
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase min-w-[120px]">
                  レッスン日
                </th>
              )}
              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                継続
              </th>
              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                確度
              </th>
              {showHearingColumn && (
                <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase">
                  H
                </th>
              )}
              {showExaminationColumn && (
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
                  審査
                </th>
              )}
              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase" style={{minWidth: '200px'}}>
                備考
              </th>
              <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase" style={{width: '60px'}}>
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedStudents.map((student) => {
              const isEditing = editingStudent === student.studentId
              
              // 休会歴があるかチェック（未来の休会予定は別テキスト）
              const suspensionWarning = (() => {
                if (!student.hasSuspensionHistory) return '';

                const today = new Date();
                // 今月初日（年/月 比較用）
                const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

                // suspensionRecords（配列）があれば未来開始レコードを探す
                const records = student.suspensionRecords || [];
                const futureRecord = records.find(r => {
                  if (!r.suspensionStartDate) return false;
                  try {
                    const d = new Date(r.suspensionStartDate.replace(/\//g, '-'));
                    const recordMonthStart = new Date(d.getFullYear(), d.getMonth(), 1);
                    return recordMonthStart > thisMonthStart;
                  } catch { return false; }
                });

                if (futureRecord) {
                  // 未来開始の休会 → 「〇年〇月から休会予定」
                  try {
                    const d = new Date(futureRecord.suspensionStartDate.replace(/\//g, '-'));
                    return `${d.getFullYear()}年${d.getMonth() + 1}月から休会予定`;
                  } catch {
                    return '休会予定あり';
                  }
                }

                // suspensionRecords がない場合は suspensionStartDate で判定
                if (records.length === 0 && student.suspensionStartDate) {
                  try {
                    const d = new Date(student.suspensionStartDate.replace(/\//g, '-'));
                    const recordMonthStart = new Date(d.getFullYear(), d.getMonth(), 1);
                    if (recordMonthStart > thisMonthStart) {
                      return `${d.getFullYear()}年${d.getMonth() + 1}月から休会予定`;
                    }
                  } catch { /* fall through */ }
                }

                return '⚠️ 休会歴あり。要チェック';
              })();

              return (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1 whitespace-nowrap text-xs font-medium text-gray-900">
                    {student.notionUrl ? (
                      <a
                        href={student.notionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        title="Notionページを開く"
                      >
                        {student.studentId}
                      </a>
                    ) : (
                      <span>{student.studentId}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-900">
                    {student.name}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-500">
                    {student.tutor || '-'}
                  </td>
                  {showStatusColumn && (
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
                        student.status === 'アクティブ'
                          ? 'bg-green-100 text-green-800'
                          : student.status === '正規退会'
                          ? 'bg-red-100 text-red-800'
                          : student.status === '強制退会'
                          ? 'bg-red-200 text-red-900'
                          : student.status === '無断キャンセル'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {student.status || '-'}
                      </span>
                    </td>
                  )}
                  <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-500">
                    {student.plan || '-'}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-500">
                    {student.lessonStartDate}
                  </td>
                  {showLessonDatesColumn && (
                    <td className="px-2 py-1 text-xs text-gray-700 align-top">
                      {student.lessonDates?.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {student.lessonDates.map((lessonDate, index) => (
                            <span
                              key={`${lessonDate}-${index}`}
                              className="inline-flex whitespace-nowrap rounded bg-sky-50 px-2 py-0.5 text-sky-800"
                            >
                              {lessonDate}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1 whitespace-nowrap">
                    {student.suspensionMonths > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {student.adjustedMonths}ヶ月
                        </span>
                        <span className="text-xs text-gray-400">
                          (実{student.monthsElapsed}ヶ月-休{student.suspensionMonths}ヶ月)
                        </span>
                      </div>
                    ) : (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {student.adjustedMonths || student.monthsElapsed}ヶ月
                      </span>
                    )}
                  </td>
                  
                  {/* 延長確度 */}
                  <td className="px-2 py-1 whitespace-nowrap">
                    {isEditing ? (
                      <select
                        value={formData.extension_certainty}
                        onChange={(e) => setFormData({ ...formData, extension_certainty: e.target.value })}
                        className="px-2 py-1 border border-gray-300 rounded text-xs w-full"
                      >
                        <option value="">選択</option>
                        <option value="高">高</option>
                        <option value="中">中</option>
                        <option value="低">低</option>
                        <option value="対象外">対象外</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                        student.extensionData?.extension_certainty === '高'
                          ? 'bg-green-100 text-green-800'
                          : student.extensionData?.extension_certainty === '中'
                          ? 'bg-yellow-100 text-yellow-800'
                          : student.extensionData?.extension_certainty === '低'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {student.extensionData?.extension_certainty || '-'}
                      </span>
                    )}
                  </td>

                  {/* ヒアリング */}
                  {showHearingColumn && (
                    <td className="px-2 py-1 whitespace-nowrap text-center">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={formData.hearing_status}
                          onChange={(e) => setFormData({ ...formData, hearing_status: e.target.checked })}
                          className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                      ) : (
                        <span className="text-xl">
                          {student.extensionData?.hearing_status ? '✅' : '❌'}
                        </span>
                      )}
                    </td>
                  )}

                  {/* 審査結果 */}
                  {showExaminationColumn && (
                    <td className="px-2 py-1 whitespace-nowrap">
                      {isEditing ? (
                        <select
                          value={formData.examination_result}
                          onChange={(e) => setFormData({ ...formData, examination_result: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-xs w-full"
                        >
                          <option value="">選択</option>
                          <option value="延長">延長</option>
                          <option value="在籍">在籍</option>
                          <option value="退会">退会</option>
                          <option value="永久会員">永久会員</option>
                          <option value="未払い">未払い</option>
                          <option value="音信不通">音信不通</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                          student.extensionData?.examination_result === '延長'
                            ? 'bg-green-100 text-green-800'
                            : student.extensionData?.examination_result === '在籍'
                            ? 'bg-blue-100 text-blue-800'
                            : student.extensionData?.examination_result === '退会'
                            ? 'bg-red-100 text-red-800'
                            : student.extensionData?.examination_result === '永久会員'
                            ? 'bg-purple-100 text-purple-800'
                            : student.extensionData?.examination_result === '未払い'
                            ? 'bg-orange-100 text-orange-800'
                            : student.extensionData?.examination_result === '音信不通'
                            ? 'bg-gray-200 text-gray-700'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {student.extensionData?.examination_result || '-'}
                        </span>
                      )}
                    </td>
                  )}

                  {/* 備考 */}
                  <td className="px-2 py-1 text-xs text-gray-500" style={{minWidth: '200px'}}>
                    {isEditing ? (
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="px-2 py-1 border border-gray-300 rounded text-xs w-full"
                        rows="2"
                        placeholder="備考を入力..."
                      />
                    ) : (
                      <div className="space-y-1">
                        {suspensionWarning && (
                          <div className="text-orange-600 font-semibold text-xs mb-1">
                            {suspensionWarning}
                          </div>
                        )}
                        <span className="line-clamp-2 text-xs">
                          {student.extensionData?.notes || '-'}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* 操作 */}
                  <td className="px-1 py-1 whitespace-nowrap text-center" style={{width: '60px'}}>
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleSave(student.studentId)}
                          className="px-1 py-0.5 bg-green-500 text-white rounded text-[10px] hover:bg-green-600"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleCancel}
                          className="px-1 py-0.5 bg-gray-500 text-white rounded text-[10px] hover:bg-gray-600"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(student)}
                        className="px-1 py-0.5 bg-primary text-white rounded text-[10px] hover:bg-primary/90"
                      >
                        編集
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default StudentTable
