import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ========== テーブル列定義 ==========
const cols = [
  { key: 'tutor',                 label: '担当Tutor',      align: 'left',  isRate: false },
  { key: 'exam1stTargetCount',    label: '1回目\n対象',    align: 'right', isRate: false },
  { key: 'exam1stExtensionCount', label: '1回目\n延長',    align: 'right', isRate: false },
  { key: 'exam1stWithdrawalCount',label: '1回目\n退会',    align: 'right', isRate: false },
  { key: 'exam1stExtensionRate',  label: '1回目\n延長率',  align: 'right', isRate: true  },
  { key: 'exam2ndTargetCount',    label: '2回目\n対象',    align: 'right', isRate: false },
  { key: 'exam2ndExtensionCount', label: '2回目\n延長',    align: 'right', isRate: false },
  { key: 'exam2ndWithdrawalCount',label: '2回目\n退会',    align: 'right', isRate: false },
  { key: 'exam2ndExtensionRate',  label: '2回目\n延長率',  align: 'right', isRate: true  },
  { key: 'exam3rdTargetCount',    label: '3回目\n対象',    align: 'right', isRate: false },
  { key: 'exam3rdExtensionCount', label: '3回目\n延長',    align: 'right', isRate: false },
  { key: 'exam3rdLifetimeCount',  label: '3回目\n永久会員',align: 'right', isRate: false },
  { key: 'exam3rdExtensionRate',  label: '3回目\n延長率',  align: 'right', isRate: true  },
  { key: 'totalTargetCount',      label: '合計\n対象',     align: 'right', isRate: false },
  { key: 'totalExtensionCount',   label: '合計\n延長',     align: 'right', isRate: false },
  { key: 'overallExtensionRate',  label: '全体\n延長率',   align: 'right', isRate: true  },
]

// ========== ソート可能テーブル ==========
function TutorTable({ data }) {
  const [sortKey, setSortKey] = useState('overallExtensionRate')
  const [sortDir, setSortDir] = useState('desc')

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...data].sort((a, b) => {
    const va = a[sortKey] ?? 0
    const vb = b[sortKey] ?? 0
    return sortDir === 'desc' ? vb - va : va - vb
  })

  const SortIcon = ({ k }) => sortKey === k
    ? <span className="ml-1">{sortDir === 'desc' ? '▼' : '▲'}</span>
    : <span className="ml-1 text-gray-300">▼</span>

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="bg-gray-50 border-b">
            {cols.map(c => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                className={`px-3 py-2 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                <span className="whitespace-pre-line leading-tight">{c.label}</span>
                <SortIcon k={c.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="px-4 py-6 text-center text-gray-400">
                データがありません
              </td>
            </tr>
          ) : sorted.map((t, i) => (
            <tr key={t.tutor} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {cols.map(c => {
                const val = t[c.key]
                const isHighlight = c.key === 'overallExtensionRate'
                const numVal = typeof val === 'number' ? val : 0
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'}
                      ${isHighlight ? 'font-bold text-blue-700' : 'text-gray-700'}
                      ${c.isRate && numVal >= 80 ? 'text-green-600' : ''}
                      ${c.isRate && numVal < 50 && numVal > 0 ? 'text-red-500' : ''}`}
                  >
                    {c.isRate ? `${numVal.toFixed(1)}%` : (val ?? 0)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ========== 棒グラフ ==========
function TutorBarChart({ data }) {
  const chartData = data.map(t => ({
    name: t.tutor.length > 10 ? t.tutor.slice(0, 10) + '…' : t.tutor,
    '1回目延長率':  +(t.exam1stExtensionRate  ?? 0).toFixed(1),
    '2回目延長率':  +(t.exam2ndExtensionRate  ?? 0).toFixed(1),
    '3回目延長率':  +(t.exam3rdExtensionRate  ?? 0).toFixed(1),
    '全体延長率':   +(t.overallExtensionRate  ?? 0).toFixed(1),
  }))

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11, angle: -30, textAnchor: 'end' }} />
          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => `${v}%`} />
          <Legend />
          <Bar dataKey="1回目延長率" fill="#3b82f6" />
          <Bar dataKey="2回目延長率" fill="#10b981" />
          <Bar dataKey="3回目延長率" fill="#8b5cf6" />
          <Bar dataKey="全体延長率"  fill="#f59e0b" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ========== 今月タブ（リアルタイム） ==========
function CurrentMonthTab() {
  const [tutorData, setTutorData] = useState([])
  const [loading, setLoading]    = useState(false)
  const [loaded, setLoaded]      = useState(false)
  const [viewMode, setViewMode]  = useState('table')

  // 今月のラベル
  const now = new Date()
  const monthLabel = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月`

  const fetchCurrent = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/kpi-export/current-kpi?monthOffset=0')
      const d = await res.json()
      if (d.success && d.data.tutorKpi) {
        setTutorData(d.data.tutorKpi)
        setLoaded(true)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-blue-700">{monthLabel}</span> のリアルタイムデータ
          </p>
          <p className="text-xs text-gray-400 mt-0.5">取得ボタンを押すたびにNotionから最新データを読み込みます</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-blue-50'}`}
            >📋 テーブル</button>
            <button
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${viewMode === 'chart' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-blue-50'}`}
            >📊 グラフ</button>
          </div>
          <button
            onClick={fetchCurrent}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white inline-block"></span>
                取得中...
              </span>
            ) : '🔄 今月データを取得'}
          </button>
        </div>
      </div>

      {!loaded && !loading && (
        <div className="flex flex-col items-center justify-center h-36 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-400 text-sm">「今月データを取得」ボタンを押してください</p>
          <p className="text-gray-300 text-xs mt-1">Notionから現在のデータをリアルタイムで取得します（数秒かかります）</p>
        </div>
      )}

      {loaded && !loading && tutorData.length === 0 && (
        <p className="text-gray-400 text-sm">今月の審査対象データがありません</p>
      )}

      {loaded && !loading && tutorData.length > 0 && (
        viewMode === 'table'
          ? <TutorTable data={tutorData} />
          : <TutorBarChart data={tutorData} />
      )}
    </div>
  )
}

// ========== 過去タブ（スナップショット） ==========
function PastMonthTab() {
  const [snapshots, setSnapshots]       = useState([])
  const [selected, setSelected]         = useState(null)
  const [tutorData, setTutorData]       = useState([])
  const [loadingList, setLoadingList]   = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [viewMode, setViewMode]         = useState('table')

  useEffect(() => { fetchList() }, [])

  const fetchList = async () => {
    try {
      setLoadingList(true)
      const res = await fetch('/api/kpi-snapshots/list')
      const d = await res.json()
      if (d.success) {
        setSnapshots(d.data)
        if (d.data.length > 0) fetchDetail(d.data[0].year_month)
      }
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
      if (d.success) setTutorData(d.data.tutorKpi || [])
    } finally {
      setLoadingDetail(false)
    }
  }

  const selectedLabel = snapshots.find(s => s.year_month === selected)?.month_label ?? ''

  if (loadingList) {
    return (
      <div className="flex justify-center h-32 items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <p className="text-gray-400">スナップショットが保存されていません</p>
        <p className="text-sm text-gray-400 mt-1">「KPI履歴」タブでスナップショットを保存してください</p>
        <p className="text-xs text-gray-300 mt-1">毎月1日 AM2:00 に前月分が自動保存されます</p>
      </div>
    )
  }

  return (
    <div>
      {/* 月選択 + 表示切替 */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 font-medium">月選択:</span>
          <select
            value={selected ?? ''}
            onChange={e => fetchDetail(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
          >
            {snapshots.map(s => (
              <option key={s.year_month} value={s.year_month}>{s.month_label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-blue-50'}`}
          >📋 テーブル</button>
          <button
            onClick={() => setViewMode('chart')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition ${viewMode === 'chart' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-blue-50'}`}
          >📊 グラフ</button>
        </div>
        {selectedLabel && (
          <span className="text-sm font-semibold text-gray-700">{selectedLabel}</span>
        )}
      </div>

      {loadingDetail ? (
        <div className="flex justify-center h-32 items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : tutorData.length === 0 ? (
        <p className="text-gray-400 text-sm">この月のTutor別データがありません</p>
      ) : viewMode === 'table' ? (
        <TutorTable data={tutorData} />
      ) : (
        <TutorBarChart data={tutorData} />
      )}
    </div>
  )
}

// ========== メインコンポーネント ==========
function KpiByTutor() {
  const [mainTab, setMainTab] = useState('current') // current | past

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">👤 担当Tutor別 延長率</h2>
      <p className="text-sm text-gray-500 mb-5">
        今月分はリアルタイムデータ、過去分はスナップショット保存データを表示します。
      </p>

      {/* 今月 / 過去 タブ */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setMainTab('current')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition -mb-px ${
            mainTab === 'current'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📅 今月
        </button>
        <button
          onClick={() => setMainTab('past')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition -mb-px ${
            mainTab === 'past'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🗂️ 過去（スナップショット）
        </button>
      </div>

      {mainTab === 'current' ? <CurrentMonthTab /> : <PastMonthTab />}
    </div>
  )
}

export default KpiByTutor
