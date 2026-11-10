import { useState } from 'react'
import { useIsCrew } from '../session'

export default function ExaminationHistoryExport() {
  const isCrew = useIsCrew()
  const now = new Date()
  const tokyo = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(now)
  const previous = new Date(Date.UTC(Number(tokyo.slice(0, 4)), Number(tokyo.slice(5)) - 2, 1)).toISOString().slice(0, 7)
  const [from, setFrom] = useState(`${previous.slice(0, 4)}-01`)
  const [to, setTo] = useState(previous)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (isCrew) return null
  const download = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/examination-history/export.csv?${new URLSearchParams({ from, to })}`)
      if (!response.ok) throw new Error('CSVを取得できませんでした。期間とログイン状態を確認してください。')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = `延長審査履歴_${from}_${to}.csv`
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <div className="mb-4">
    <button onClick={() => setOpen(!open)} className="px-4 py-2 bg-green-700 text-white rounded-lg">過去の審査結果をCSV出力</button>
    {open && <div className="mt-3 p-4 bg-white rounded-lg border space-y-3">
      <p className="text-sm">3一覧をまとめて出力します（1～10回目・退会済みを含む／EP専用審査は対象外）。</p>
      <p className="text-sm text-amber-800">審査回ごとの保存済み最新値です。当時の月末確定値ではありません。年月は現在の開始月・休会履歴・PRO開始月から計算します。未入力は空欄です。</p>
      <div className="flex flex-wrap gap-3 items-center">
        <label>開始月 <input type="month" min="2000-01" max={to} value={from} onChange={e => setFrom(e.target.value)} className="border rounded p-2" /></label>
        <label>終了月 <input type="month" min={from} max={previous} value={to} onChange={e => setTo(e.target.value)} className="border rounded p-2" /></label>
        <button onClick={download} disabled={busy || !from || !to || from > to} className="px-4 py-2 bg-green-700 text-white rounded disabled:opacity-50">{busy ? '出力中...' : 'CSVダウンロード'}</button>
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>}
  </div>
}
