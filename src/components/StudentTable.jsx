import { useState } from 'react'

function StudentTable({ students, onUpdate, showHearingColumn, showExaminationColumn }) {
  const [editingStudent, setEditingStudent] = useState(null)
  const [formData, setFormData] = useState({})

  const handleEdit = (student) => {
    setEditingStudent(student.studentId)
    setFormData({
      extension_certainty: student.extensionData?.extension_certainty || '',
      hearing_status: student.extensionData?.hearing_status || false,
      examination_result: student.extensionData?.examination_result || '',
      notes: student.extensionData?.notes || '',
    })
  }

  const handleSave = async (studentId) => {
    await onUpdate(studentId, formData)
    setEditingStudent(null)
  }

  const handleCancel = () => {
    setEditingStudent(null)
    setFormData({})
  }

  return (
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
                フォーム最終更新
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                延長確度
              </th>
              {showHearingColumn && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ヒアリング
                </th>
              )}
              {showExaminationColumn && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  審査結果
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                備考
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {students.map((student) => {
              const isEditing = editingStudent === student.studentId

              return (
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.formLastUpdate || '-'}
                  </td>
                  
                  {/* 延長確度 */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {isEditing ? (
                      <select
                        value={formData.extension_certainty}
                        onChange={(e) => setFormData({ ...formData, extension_certainty: e.target.value })}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="">選択</option>
                        <option value="高">高</option>
                        <option value="中">中</option>
                        <option value="低">低</option>
                        <option value="対象外">対象外</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 text-xs rounded-full ${
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
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={formData.hearing_status}
                          onChange={(e) => setFormData({ ...formData, hearing_status: e.target.checked })}
                          className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                      ) : (
                        <span className="text-2xl">
                          {student.extensionData?.hearing_status ? '✅' : '❌'}
                        </span>
                      )}
                    </td>
                  )}

                  {/* 審査結果 */}
                  {showExaminationColumn && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isEditing ? (
                        <select
                          value={formData.examination_result}
                          onChange={(e) => setFormData({ ...formData, examination_result: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="">選択</option>
                          <option value="延長">延長</option>
                          <option value="在籍">在籍</option>
                          <option value="退会">退会</option>
                          <option value="永久会員">永久会員</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          student.extensionData?.examination_result === '延長'
                            ? 'bg-green-100 text-green-800'
                            : student.extensionData?.examination_result === '在籍'
                            ? 'bg-blue-100 text-blue-800'
                            : student.extensionData?.examination_result === '退会'
                            ? 'bg-red-100 text-red-800'
                            : student.extensionData?.examination_result === '永久会員'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {student.extensionData?.examination_result || '-'}
                        </span>
                      )}
                    </td>
                  )}

                  {/* 備考 */}
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {isEditing ? (
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="px-2 py-1 border border-gray-300 rounded text-sm w-full"
                        rows="2"
                        placeholder="備考を入力..."
                      />
                    ) : (
                      <span className="line-clamp-2">
                        {student.extensionData?.notes || '-'}
                      </span>
                    )}
                  </td>

                  {/* 操作 */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {isEditing ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSave(student.studentId)}
                          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleCancel}
                          className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                        >
                          キャンセル
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(student)}
                        className="px-3 py-1 bg-primary text-white rounded hover:bg-primary/90"
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
