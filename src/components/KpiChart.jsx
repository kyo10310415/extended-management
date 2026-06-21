import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

const COLORS = {
  exam1st: '#3b82f6',
  exam2nd: '#10b981',
  exam3rd: '#8b5cf6',
  overall: '#f59e0b',
}

function KpiChart() {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [activeTab, setActiveTab] = useState('extensionRate') // extensionRate | targetCount | extensionCount | withdrawalCount

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/kpi-snapshots')
      const d = await res.json()
      if (d.success) setSnapshots(d.data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // グラフ用データ変換
  const chartData = snapshots.map(s => {
    const d = s.snapshotData
    return {
      month: s.monthLabel.replace('年', '/').replace('月', ''),
      exam1stExtensionRate:  +(d.exam1stExtensionRate  ?? 0).toFixed(1),
      exam2ndExtensionRate:  +(d.exam2ndExtensionRate  ?? 0).toFixed(1),
      exam3rdExtensionRate:  +(d.exam3rdExtensionRate  ?? 0).toFixed(1),
      overallExtensionRate:  +(d.overallExtensionRate  ?? 0).toFixed(1),

      exam1stTargetCount:    d.exam1stTargetCount    ?? 0,
      exam2ndTargetCount:    d.exam2ndTargetCount    ?? 0,
      exam3rdTargetCount:    d.exam3rdTargetCount    ?? 0,

      exam1stExtensionCount: d.exam1stExtensionCount ?? 0,
      exam2ndExtensionCount: d.exam2ndExtensionCount ?? 0,
      exam3rdExtensionCount: d.exam3rdExtensionCount ?? 0,

      exam1stWithdrawalCount: d.exam1stWithdrawalCount ?? 0,
      exam2ndWithdrawalCount: d.exam2ndWithdrawalCount ?? 0,
      exam3rdLifetimeCount:   d.exam3rdLifetimeCount   ?? 0,
    }
  })

  const tabs = [
    { id: 'extensionRate',    label: '延長率(%)' },
    { id: 'targetCount',      label: '対象数' },
    { id: 'extensionCount',   label: '延長数' },
    { id: 'withdrawalCount',  label: '退会/永久会員数' },
  ]

  const seriesMap = {
    extensionRate: [
      { key: 'exam1stExtensionRate',  name: '1回目 延長率', color: COLORS.exam1st },
      { key: 'exam2ndExtensionRate',  name: '2回目 延長率', color: COLORS.exam2nd },
      { key: 'exam3rdExtensionRate',  name: '3回目(Pro) 延長率', color: COLORS.exam3rd },
      { key: 'overallExtensionRate',  name: '全体 延長率', color: COLORS.overall },
    ],
    targetCount: [
      { key: 'exam1stTargetCount', name: '1回目 対象数', color: COLORS.exam1st },
      { key: 'exam2ndTargetCount', name: '2回目 対象数', color: COLORS.exam2nd },
      { key: 'exam3rdTargetCount', name: '3回目(Pro) 対象数', color: COLORS.exam3rd },
    ],
    extensionCount: [
      { key: 'exam1stExtensionCount', name: '1回目 延長数', color: COLORS.exam1st },
      { key: 'exam2ndExtensionCount', name: '2回目 延長数', color: COLORS.exam2nd },
      { key: 'exam3rdExtensionCount', name: '3回目(Pro) 延長数', color: COLORS.exam3rd },
    ],
    withdrawalCount: [
      { key: 'exam1stWithdrawalCount', name: '1回目 退会数',   color: COLORS.exam1st },
      { key: 'exam2ndWithdrawalCount', name: '2回目 退会数',   color: COLORS.exam2nd },
      { key: 'exam3rdLifetimeCount',   name: '3回目 永久会員数', color: COLORS.exam3rd },
    ],
  }

  const isPercent = activeTab === 'extensionRate'
  const series    = seriesMap[activeTab]
  const ChartComp = isPercent ? LineChart : BarChart

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">📈 KPI推移グラフ</h2>
      <p className="text-sm text-gray-500 mb-6">
        スナップショット保存済みの月のデータを時系列で表示します。
        （「KPI履歴」タブで保存してください）
      </p>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && snapshots.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-400 mb-2">まだスナップショットが保存されていません</p>
          <p className="text-sm text-gray-400">「KPI履歴」タブでスナップショットを保存してください</p>
        </div>
      )}

      {!loading && snapshots.length > 0 && (
        <>
          {/* タブ */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === t.id
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-white border border-gray-200 hover:bg-blue-50 text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* グラフ */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-base font-semibold text-gray-700 mb-4">
              {tabs.find(t => t.id === activeTab)?.label} の推移
            </h3>
            <ResponsiveContainer width="100%" height={360}>
              <ChartComp data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis
                  domain={isPercent ? [0, 100] : ['auto', 'auto']}
                  unit={isPercent ? '%' : ''}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip formatter={(v) => isPercent ? `${v}%` : `${v}人`} />
                <Legend />
                {series.map(s =>
                  isPercent ? (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  ) : (
                    <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} />
                  )
                )}
              </ChartComp>
            </ResponsiveContainer>
          </div>

          {/* 数値テーブル */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b">月</th>
                  {series.map(s => (
                    <th key={s.key} className="text-right px-3 py-3 font-semibold text-gray-700 border-b whitespace-nowrap">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...chartData].reverse().map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2 font-medium text-gray-800">{row.month}</td>
                    {series.map(s => (
                      <td key={s.key} className="text-right px-3 py-2 text-gray-700">
                        {isPercent ? `${row[s.key]}%` : `${row[s.key]}人`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default KpiChart
