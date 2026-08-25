import { useEffect, useState } from 'react'

const WITHDRAWAL_REASONS = [
  '音信不通',
  '生徒様希望で途中退会',
  'コンプライアンス違反',
]

const EMPTY_FORM = {
  studentId: '',
  forcedWithdrawalDate: '',
  withdrawalReason: '',
}

function ForcedWithdrawalList() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [student, setStudent] = useState(null)
  const [studentLookupLoading, setStudentLookupLoading] = useState(false)
  const [studentLookupError, setStudentLookupError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchRecords = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/forced-withdrawals')
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || '強制退会一覧の取得に失敗しました。')
      }

      setRecords(data.data)
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  useEffect(() => {
    if (!isModalOpen) return undefined

    const studentId = form.studentId.trim()
    setStudent(null)
    setStudentLookupError('')

    if (!studentId) {
      setStudentLookupLoading(false)
      return undefined
    }

    const abortController = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setStudentLookupLoading(true)
        const response = await fetch(
          `/api/forced-withdrawals/student/${encodeURIComponent(studentId)}`,
          { signal: abortController.signal }
        )
        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.error || '生徒情報を取得できませんでした。')
        }

        setStudent(data.data)
      } catch (lookupError) {
        if (lookupError.name !== 'AbortError') {
          setStudentLookupError(lookupError.message)
        }
      } finally {
        if (!abortController.signal.aborted) {
          setStudentLookupLoading(false)
        }
      }
    }, 350)

    return () => {
      clearTimeout(timer)
      abortController.abort()
    }
  }, [form.studentId, isModalOpen])

  const openModal = () => {
    setForm(EMPTY_FORM)
    setStudent(null)
    setStudentLookupError('')
    setSubmitError('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (!submitting) setIsModalOpen(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!student || submitting) return

    try {
      setSubmitting(true)
      setSubmitError('')
      const response = await fetch('/api/forced-withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || '強制退会申請に失敗しました。')
      }

      setRecords((current) => [data.data, ...current])
      setIsModalOpen(false)
      setForm(EMPTY_FORM)
      setStudent(null)
    } catch (submitRequestError) {
      setSubmitError(submitRequestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">🚪 強制退会一覧</h2>
          <p className="mt-1 text-sm text-gray-500">
            強制退会の申請済みレコード {records.length}件
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white shadow transition hover:bg-red-700"
        >
          強制退会
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
          <button
            type="button"
            onClick={fetchRecords}
            className="whitespace-nowrap rounded bg-red-100 px-3 py-1 text-sm text-red-800 hover:bg-red-200"
          >
            再読み込み
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg bg-white p-10 text-center text-gray-500 shadow">
          強制退会の申請レコードはありません
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">生徒名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">学籍番号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">強制退会日</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">強制退会時期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{record.studentName}</td>
                  <td className="px-4 py-3 text-gray-700">{record.studentId}</td>
                  <td className="px-4 py-3 text-gray-700">{record.forcedWithdrawalDate}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                      {record.monthsElapsed}か月目
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forced-withdrawal-form-title"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 id="forced-withdrawal-form-title" className="text-xl font-bold text-gray-900">
                強制退会申請
              </h3>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                aria-label="閉じる"
                className="rounded p-1 text-2xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="forced-withdrawal-student-id" className="mb-1 block text-sm font-medium text-gray-700">
                  学籍番号 <span className="text-red-600">*</span>
                </label>
                <input
                  id="forced-withdrawal-student-id"
                  type="text"
                  required
                  autoFocus
                  autoComplete="off"
                  maxLength={50}
                  value={form.studentId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    studentId: event.target.value.toUpperCase(),
                  }))}
                  placeholder="OLTS000000-AA"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <p className="mb-1 block text-sm font-medium text-gray-700">生徒名</p>
                <div className={`min-h-10 rounded-lg border px-3 py-2 text-sm ${
                  student
                    ? 'border-green-200 bg-green-50 font-medium text-green-900'
                    : studentLookupError
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}>
                  {studentLookupLoading
                    ? '生徒情報を検索中...'
                    : student?.name || studentLookupError || '学籍番号を入力すると自動表示されます'}
                </div>
              </div>

              <div>
                <label htmlFor="forced-withdrawal-date" className="mb-1 block text-sm font-medium text-gray-700">
                  強制退会日 <span className="text-red-600">*</span>
                </label>
                <input
                  id="forced-withdrawal-date"
                  type="date"
                  required
                  value={form.forcedWithdrawalDate}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    forcedWithdrawalDate: event.target.value,
                  }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label htmlFor="forced-withdrawal-reason" className="mb-1 block text-sm font-medium text-gray-700">
                  退会理由 <span className="text-red-600">*</span>
                </label>
                <select
                  id="forced-withdrawal-reason"
                  required
                  value={form.withdrawalReason}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    withdrawalReason: event.target.value,
                  }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">選択してください</option>
                  {WITHDRAWAL_REASONS.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </div>

              {submitError && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {submitError}
                </p>
              )}

              <p className="text-xs text-gray-500">
                申請完了時に指定ユーザーへDiscord通知が送信されます。
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={
                    !student
                    || !form.forcedWithdrawalDate
                    || !form.withdrawalReason
                    || submitting
                  }
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? '申請・通知中...' : '申請する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ForcedWithdrawalList
