import { useState, useEffect } from 'react'

// KPIカード共通コンポーネント
function KpiCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    gray:   'bg-gray-50 border-gray-200 text-gray-700',
  }
  return (
    <div className={`border rounded-lg p-3 ${colors[color]}`}>
      <p className="text-xs font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold">{value ?? '—'}</p>
      {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
    </div>
  )
}

// 1回目・2回目・3回目の共通カードセクション
function ExamSection({ title, data, cycle }) {
  if (!data) return null
  const isThird = cycle === 3
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-600 mb-2">{title}</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="対象数" value={data.targetCount} color="blue" />
        <KpiCard label="延長数" value={data.extensionCount} color="green" />
        <KpiCard
          label={isThird ? '永久会員数' : '退会数'}
          value={data.withdrawalCount ?? data.lifetimeCount}
          color="red"
        />
        <KpiCard
          label="延長率"
          value={`${(data.extensionRate ?? 0).toFixed(1)}%`}
          color="purple"
        />
      </div>
    </div>
  )
}

function KpiHistory() {
  const [snapshots, setSnapshots]     = useState([])          // 一覧
  const [selected, setSelected]       = useState(null)        // 選択中の yearMonth
  const [detail, setDetail]           = useState(null)        // 詳細データ
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)           // 保存対象: 0=今月, -1=先月
  const [error, setError]             = useState(null)

  // --- CSV インポート state ---
  const [showCsvPanel, setShowCsvPanel]   = useState(false)
  const [csvText, setCsvText]             = useState('')
  const [csvOverwrite, setCsvOverwrite]   = useState(false)
  const [csvImporting, setCsvImporting]   = useState(false)
  const [csvResult, setCsvResult]         = useState(null)   // { imported, skipped, message }

  useEffect(() => { fetchList() }, [])

  const fetchList = async () => {
    try {
      setLoadingList(true)
      const res = await fetch('/api/kpi-snapshots/list')
      const d = await res.json()
      if (d.success) setSnapshots(d.data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingList(false)
    }
  }

  const fetchDetail = async (ym) => {
    try {
      setLoadingDetail(true)
      setSelected(ym)
      const res = await fetch(`/api/kpi-snapshots/${ym}`)
      const d = await res.json()
      if (d.success) setDetail(d.data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleSave = async (overwrite = false) => {
    const targetDate = new Date()
    targetDate.setMonth(targetDate.getMonth() + monthOffset)
    const label = `${targetDate.getFullYear()}年${String(targetDate.getMonth() + 1).padStart(2, '0')}月`

    if (!window.confirm(`${label}のKPIデータを保存しますか？\n\n※現在のNotionデータをもとに計算します。`)) return

    try {
      setSaving(true)
      const res = await fetch('/api/kpi-snapshots/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthOffset, overwrite }),
      })
      const d = await res.json()

      if (d.alreadyExists && !overwrite) {
        if (window.confirm(`${d.monthLabel}のスナップショットは既に存在します。\n上書きしますか？`)) {
          await handleSave(true)
        }
        return
      }

      if (d.success) {
        alert(`✅ ${d.monthLabel}のKPIスナップショットを保存しました。`)
        await fetchList()
        await fetchDetail(d.yearMonth)
      } else {
        throw new Error(d.error)
      }
    } catch (e) {
      alert(`❌ 保存に失敗しました: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const s = detail?.snapshotData

  // --- CSV インポート処理 ---
  const handleCsvImport = async () => {
    if (!csvText.trim()) {
      alert('CSVテキストを貼り付けてください。')
      return
    }
    try {
      setCsvImporting(true)
      setCsvResult(null)
      const res = await fetch('/api/kpi-snapshots/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: csvText.trim(), overwrite: csvOverwrite }),
      })
      const d = await res.json()
      if (d.success) {
        setCsvResult(d)
        await fetchList()
        if (d.imported.length > 0) {
          // 最後にインポートした月を自動選択
          const lastYm = d.imported[d.imported.length - 1].yearMonth
          await fetchDetail(lastYm)
        }
      } else {
        alert(`❌ インポート失敗: ${d.error}`)
      }
    } catch (e) {
      alert(`❌ インポート失敗: ${e.message}`)
    } finally {
      setCsvImporting(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">📅 KPI履歴（月別スナップショット）</h2>

      {/* 保存パネル */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-4">
        <h3 className="font-semibold text-blue-800 mb-3">📸 スナップショットを保存</h3>
        <p className="text-sm text-blue-700 mb-3">
          保存時点のNotionデータをもとにKPIを計算し、DBに固定保存します。<br/>
          月が替わったタイミングで保存することで、生徒ステータスが変わっても数値が変化しません。
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white rounded-lg shadow px-3 py-2">
            <span className="text-xs text-gray-600">保存対象月:</span>
            <button
              onClick={() => setMonthOffset(-1)}
              className={`px-3 py-1 text-xs rounded transition ${monthOffset === -1 ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >先月</button>
            <button
              onClick={() => setMonthOffset(0)}
              className={`px-3 py-1 text-xs rounded transition ${monthOffset === 0 ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >今月</button>
          </div>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className={`px-5 py-2 rounded-lg font-semibold text-white transition ${saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saving ? '保存中...' : '📸 スナップショット保存'}
          </button>
        </div>
      </div>

      {/* CSV インポートパネル */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-amber-800">📂 過去データをCSVからインポート</h3>
          <button
            onClick={() => { setShowCsvPanel(v => !v); setCsvResult(null) }}
            className="text-xs text-amber-700 underline hover:no-underline"
          >
            {showCsvPanel ? '▲ 閉じる' : '▼ 開く'}
          </button>
        </div>

        {showCsvPanel && (
          <div>
            <p className="text-xs text-amber-700 mb-3">
              スプレッドシートからコピーしたCSVを貼り付けると、月ごとのスナップショットを一括登録できます。<br/>
              ヘッダー行: <code className="bg-amber-100 px-1 rounded">項目名,平均,2026年02月,2026年03月,...</code>
            </p>

            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={"項目名,平均,2026年02月,2026年03月,...\n延長審査1回目_対象数,,60,28,...\n..."}
              className="w-full h-40 text-xs font-mono border border-amber-300 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"
            />

            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-xs text-amber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={csvOverwrite}
                  onChange={e => setCsvOverwrite(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                既存データを上書きする
              </label>

              <button
                onClick={handleCsvImport}
                disabled={csvImporting || !csvText.trim()}
                className={`px-5 py-2 rounded-lg font-semibold text-white text-sm transition ${
                  csvImporting || !csvText.trim()
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {csvImporting ? 'インポート中...' : '📥 インポート実行'}
              </button>
            </div>

            {/* インポート結果 */}
            {csvResult && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200 text-xs">
                <p className="font-semibold text-amber-800 mb-2">✅ {csvResult.message}</p>
                {csvResult.imported.length > 0 && (
                  <div className="mb-2">
                    <span className="text-green-700 font-medium">インポート済み: </span>
                    {csvResult.imported.map(r => r.monthLabel).join('、')}
                  </div>
                )}
                {csvResult.skipped.length > 0 && (
                  <div>
                    <span className="text-gray-500 font-medium">スキップ: </span>
                    {csvResult.skipped.map(r => `${r.monthLabel}（${r.reason}）`).join('、')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* 左: 一覧 */}
        <div className="w-48 flex-shrink-0">
          <h3 className="font-semibold text-gray-700 mb-3">保存済み月</h3>
          {loadingList ? (
            <p className="text-sm text-gray-500">読み込み中...</p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-gray-500">保存済みデータなし</p>
          ) : (
            <ul className="space-y-1">
              {snapshots.map(s => (
                <li key={s.year_month}>
                  <button
                    onClick={() => fetchDetail(s.year_month)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                      selected === s.year_month
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-white hover:bg-blue-50 border border-gray-200'
                    }`}
                  >
                    {s.month_label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 右: 詳細 */}
        <div className="flex-1 min-w-0">
          {!selected && (
            <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <p className="text-gray-400">← 左の月を選択してください</p>
            </div>
          )}
          {loadingDetail && (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
          {detail && !loadingDetail && s && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">{detail.monthLabel} のKPI</h3>
                <p className="text-xs text-gray-400">保存日時: {new Date(detail.createdAt).toLocaleString('ja-JP')}</p>
              </div>

              {/* 全体KPI */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-600 mb-3">📊 全体統計</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                  <KpiCard label="延長審査対象" value={s.exam1stTargetCount + s.exam2ndTargetCount + (s.exam3rdTargetCount ?? 0)} color="blue" />
                  <KpiCard label="延長数"       value={(s.exam1stExtensionCount ?? 0) + (s.exam2ndExtensionCount ?? 0) + (s.exam3rdExtensionCount ?? 0)} color="green" />
                  <KpiCard label="退会/永久会員" value={(s.exam1stWithdrawalCount ?? 0) + (s.exam2ndWithdrawalCount ?? 0) + (s.exam3rdLifetimeCount ?? 0)} color="red" />
                  <KpiCard label="延長率(全体)"  value={`${(s.overallExtensionRate ?? 0).toFixed(1)}%`} color="purple" />
                  <KpiCard label="Pro成約率"    value={`${(s.proPlanSuccessRate ?? 0).toFixed(1)}%`} color="yellow" />
                </div>
              </div>

              {/* 各回別 */}
              <div className="space-y-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <ExamSection title="📌 延長審査1回目（5ヶ月目）" cycle={1} data={{
                    targetCount:    s.exam1stTargetCount,
                    extensionCount: s.exam1stExtensionCount,
                    withdrawalCount: s.exam1stWithdrawalCount,
                    extensionRate:  s.exam1stExtensionRate,
                  }} />
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <ExamSection title="📌 延長審査2回目（11ヶ月目）" cycle={2} data={{
                    targetCount:    s.exam2ndTargetCount,
                    extensionCount: s.exam2ndExtensionCount,
                    withdrawalCount: s.exam2ndWithdrawalCount,
                    extensionRate:  s.exam2ndExtensionRate,
                  }} />
                </div>
                {s.exam3rdTargetCount != null && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <ExamSection title="📌 延長審査3回目・Pro（17ヶ月目）" cycle={3} data={{
                      targetCount:    s.exam3rdTargetCount,
                      extensionCount: s.exam3rdExtensionCount,
                      withdrawalCount: s.exam3rdLifetimeCount,
                      extensionRate:  s.exam3rdExtensionRate,
                    }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default KpiHistory
