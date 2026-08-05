import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, currentMonthKey, monthLabel } from '../lib/format'
import type { Scope } from '../types/finance'

export default function Relatorios() {
  const { transactions } = useTransactions()
  const [scope, setScope] = useState<Scope | 'todos'>('todos')

  const months = useMemo(() => {
    const set = new Set(transactions.map((t) => t.date.slice(0, 7)))
    set.add(currentMonthKey())
    return Array.from(set).sort().reverse()
  }, [transactions])

  const [monthKey, setMonthKey] = useState(currentMonthKey())

  const monthTx = useMemo(
    () =>
      transactions.filter(
        (t) => t.date.startsWith(monthKey) && (scope === 'todos' || t.scope === scope),
      ),
    [transactions, monthKey, scope],
  )

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of monthTx) {
      if (t.kind !== 'despesa') continue
      map.set(t.categoryName, (map.get(t.categoryName) ?? 0) + t.amount)
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [monthTx])

  const receitaTotal = monthTx.filter((t) => t.kind === 'receita').reduce((s, t) => s + t.amount, 0)
  const despesaTotal = monthTx.filter((t) => t.kind === 'despesa').reduce((s, t) => s + t.amount, 0)

  const COLORS = [
    '#059669', '#dc2626', '#2563eb', '#d97706', '#7c3aed',
    '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
  ]

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm capitalize dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          {months.map((m) => (
            <option key={m} value={m} className="capitalize">
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
          {(['todos', 'pessoal', 'empresa'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1 font-medium capitalize ${
                scope === s
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-xs text-slate-400">Receitas</p>
          <p className="text-lg font-semibold text-emerald-600">{formatCurrency(receitaTotal)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <p className="text-xs text-slate-400">Despesas</p>
          <p className="text-lg font-semibold text-red-600">{formatCurrency(despesaTotal)}</p>
        </div>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Despesas por categoria
        </h2>
        {byCategory.length === 0 ? (
          <p className="text-sm text-slate-400">Sem despesas no período.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {byCategory.length > 0 && (
        <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Distribuição
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={80}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  )
}
