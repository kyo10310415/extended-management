import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

function KpiByTutor() {
  const [snapshots, setSnapshots]   = useState([])
  const [selected, setSelected]     = useState(null)  // yearMonth
  const [tutorData, setTutorData]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [viewMode, setViewMode]     = useState('table')  // table | chart
  const [sortKey, setSortKey]       = useState('overallExtensionRate')
  const [sortDir, setSortDir]       = useState('desc')

  useEffect(() => { fetchList() }, [])

  const fetchList = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/kpi-snapshots/list')
      const d = await res.json()
      if (d.success) {
        setSnapshots(d.data)
        // 最新月を自動選択
        if (d.data.length > 0) fetchDetail(d.data[0].year_month)
      }
    } finally {
      setLoading(false)
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

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...tutorData].sort((a, b) => {
    const va = a[sortKey] ?? 0
    const vb = b[sortKey] ?? 0
    return sortDir === 'desc' ? vb - va : va - vb
  })

  const SortIcon = ({ k }) => sortKey === k
    ? <span className="ml-1">{sortDir === 'desc' ? '▼' : '▲'}</span>
    : <span className="ml-1 text-gray-300">▼</span>

  const cols = [
    { key: 'tutor',                label: '担当Tutor',          align: 'left',  isRate: false },
    { key: 'exam1stTargetCount',   label: '1回目\n対象',         align: 'right', isRate: false },
    { key: 'exam1stExtensionCount',label: '1回目\n延長',         align: 'right', isRate: false },
    { key: 'exam1stWithdrawalCount',label:'1回目\n退会',         align: 'right', isRate: false },
    { key: 'exam1stExtensionRate', label: '1回目\n延長率',       align: 'right', isRate: true  },
    { key: 'exam2ndTargetCount',   label: '2回目\n対象',         align: 'right', isRate: false },
    { key: 'exam2ndExtensionCount',label: '2回目\n延長',         align: 'right', isRate: false },
    { key: 'exam2ndWithdrawalCount',label:'2回目\n退会',         align: 'right', isRate: false },
    { key: 'exam2ndExtensionRate', label: '2回目\n延長率',       align: 'right', isRate: true  },
    { key: 'exam3rdTargetCount',   label: '3回目\n対象',         align: 'right', isRate: false },
    { key: 'exam3rdExtensionCount',label: '3回目\n延長',         align: 'right', isRate: false },
    { key: 'exam3rdLifetimeCount', label: '3回目\n永久会員',     align: 'right', isRate: false },
    { key: 'exam3rdExtensionRate', label: '3回目\n延長率',       align: 'right', isRate: true  },
    { key: 'totalTargetCount',     label: '合計\n対象',          align: 'right', isRate: false },
    { key: 'totalExtensionCount',  label: '合計\n延長',          align: 'right', isRate: false },
    { key: 'overallExtensionRate', label: '全体\n延長率',        align: 'right', isRate: true  },
  ]

  // グラフデータ（Tutor別全体延長率）
  const chartData = sorted.map(t => ({
    name: t.tutor.length > 10 ? t.tutor.slice(0, 10) + '…' : t.tutor,
    '1回目延長率':    +(t.exam1stExtensionRate  ?? 0).toFixed(1),
    '2回目延長率':    +(t.exam2ndExtensionRate  ?? 0).toFixed(1),
    '3回目延長率':    +(t.exam3rdExtensionRate  ?? 0).toFixed(1),
    '全体延長率':     +(t.overallExtensionRate  ?? 0).toFixed(1),
  }))

  const selectedLabel = snapshots.find(s => s.year_month === selected)?.month_label ?? ''

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">👤 担当Tutor別 延長率</h2>
      <p className="text-sm text-gray-500 mb-6">
        スナップショット保存済みのデータからTutor別KPIを表示します。
      </p>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-400">スナップショットが保存されていません</p>
          <p className="text-sm text-gray-400 mt-1">「KPI履歴」タブで保存してください</p>
        </div>
      ) : (
        <>
          {/* 月選択 + 表示切替 */}
          <div className="flex flex-wrap items-center gap-4 mb-5">
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
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('table')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-blue-50'}`}
              >📋 テーブル</button>
              <button
                onClick={() => setViewMode('chart')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === 'chart' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-blue-50'}`}
              >📊 グラフ</button>
            </div>
          </div>

          {loadingDetail ? (
            <div className="flex justify-center h-32 items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : tutorData.length === 0 ? (
            <p className="text-gray-400 text-sm">この月のTutor別データがありません</p>
          ) : viewMode === 'chart' ? (
            /* グラフ表示 */
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-700 mb-4">{selectedLabel} — Tutor別延長率</h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, angle: -30, textAnchor: 'end' }} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend />
                  <Bar dataKey="1回目延長率"  fill="#3b82f6" />
                  <Bar dataKey="2回目延長率"  fill="#10b981" />
                  <Bar dataKey="3回目延長率"  fill="#8b5cf6" />
                  <Bar dataKey="全体延長率"   fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            /* テーブル表示 */
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <div className="px-4 py-3 border-b bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">{selectedLabel} — {tutorData.length}名のTutor</span>
              </div>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {cols.map(c => (
                      <th
                        key={c.key}
                        className={`px-3 py-2 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                        onClick={() => handleSort(c.key)}
                      >
                        <span className="whitespace-pre-line leading-tight">{c.label}</span>
                        <SortIcon k={c.key} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t, i) => (
                    <tr key={t.tutor} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {cols.map(c => {
                        const val = t[c.key]
                        const isHighlight = c.key === 'overallExtensionRate'
                        return (
                          <td
                            key={c.key}
                            className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'} ${
                              isHighlight ? 'font-bold text-blue-700' : 'text-gray-700'
                            } ${c.isRate && val >= 80 ? 'text-green-600' : ''} ${c.isRate && val < 50 && val > 0 ? 'text-red-500' : ''}`}
                          >
                            {c.isRate ? `${(val ?? 0).toFixed(1)}%` : (val ?? 0)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default KpiByTutor
