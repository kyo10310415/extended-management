import { useEffect, useState } from 'react'


export default function CrewWorkspace() {
  const [cycle, setCycle] = useState(1)
  const [students, setStudents] = useState([])
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  useEffect(() => {

    const controller = new AbortController()
    setLoading(true); setStudents([]); setEditing(null); setMessage('')
    fetch(`/api/crew/students?cycle=${cycle}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() })
      .then(body => setStudents(body.data))
      .catch(error => { if (error.name !== 'AbortError') setMessage('生徒を取得できません。管理者にお問い合わせください。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [cycle])
  const save = async event => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(editing.studentId)}/hearing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, cycle }),
      })
      const body = await response.json()
      if (!response.ok || !body.success) throw new Error()
      setStudents(previous => previous.map(student => student.studentId === editing.studentId
        ? { ...student, ...body.data } : student))
      setEditing(null); setMessage('保存しました。')
    } catch { setMessage('保存できませんでした。権限・入力内容を確認し、管理者にお問い合わせください。') }
    finally { setBusy(false) }
  }
  return <main className="max-w-6xl mx-auto p-6">
    <h1 className="text-2xl font-bold">生徒の延長管理</h1>
    <p className="mt-2 text-gray-600">全生徒を表示しています。crewはヒアリング状況・延長確度・備考のみ更新できます。審査結果は閲覧のみです。</p>
    <label className="block my-5">審査サイクル <select className="border rounded p-2" value={cycle} disabled={busy || !!editing} onChange={e => setCycle(Number(e.target.value))}>{Array.from({ length: 10 }, (_, index) => <option key={index} value={index + 1}>{index + 1}回目</option>)}</select></label>
    {message && <p role="status" className="my-4">{message}</p>}
    {loading ? <p>読み込み中…</p> : students.length === 0 ? <p>生徒がありません。データ同期の状況を管理者に確認してください。</p> : <div className="overflow-x-auto"><table className="w-full text-left bg-white"><thead><tr>{['学籍番号', '生徒名', 'プラン', 'ステータス', '延長確度', 'ヒアリング', '審査結果', '操作'].map(label => <th key={label} className="p-3 border-b">{label}</th>)}</tr></thead><tbody>{students.map(student => <tr key={student.studentId}>
      <td className="p-3">{student.studentId}</td><td>{student.name}</td><td>{student.plan}</td><td>{student.status}</td><td>{student.extension_certainty || '—'}</td><td>{student.hearing_status ? '済' : '未'}</td><td>{student.examination_result || '—'}</td><td><button className="underline p-2" disabled={busy} onClick={() => { setEditing(student); setDraft({ extension_certainty: student.extension_certainty || '', hearing_status: student.hearing_status, notes: student.notes || '' }) }}>編集</button></td>
    </tr>)}</tbody></table></div>}
    {editing && <form onSubmit={save} className="mt-6 border rounded bg-white p-5 space-y-4">
      <h2 className="font-bold">{editing.name}：{cycle}回目</h2>
      <label className="block">延長確度 <select className="border p-2" disabled={busy} value={draft.extension_certainty} onChange={e => setDraft({ ...draft, extension_certainty: e.target.value })}>{['', '高', '中', '低', '対象外'].map(value => <option key={value} value={value}>{value || '未入力'}</option>)}</select></label>
      <label className="block"><input type="checkbox" disabled={busy} checked={draft.hearing_status} onChange={e => setDraft({ ...draft, hearing_status: e.target.checked })} /> ヒアリング済み</label>
      <p>審査結果（閲覧のみ）：{editing.examination_result || '未入力'}</p>
      <label className="block">備考<textarea className="block border w-full p-2" disabled={busy} maxLength={5000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
      <button disabled={busy} className="bg-blue-600 text-white rounded px-5 py-2">{busy ? '保存中…' : '保存'}</button><button type="button" disabled={busy} className="ml-4 underline" onClick={() => setEditing(null)}>キャンセル</button>
    </form>}
  </main>
}
