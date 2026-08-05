import { useMemo } from 'react'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, currentMonthKey, monthLabel, formatDate } from '../lib/format'

export default function Dashboard() {
  const { transactions, loading } = useTransactions()
  const monthKey = currentMonthKey()

  const monthTx = useMemo(
    () => transactions.filter((t) => t.date.startsWith(monthKey)),
    [transactions, monthKey],
  )

  const totals = useMemo(() => {
    const acc = {
      pessoal: { receita: 0, despesa: 0 },
      empresa: { receita: 0, despesa: 0 },
    }
    for (const t of monthTx) acc[t.scope][t.kind] += t.amount
    return acc
  }, [monthTx])

  const saldoGeral = useMemo(
    () =>
      transactions.reduce((s, t) => s + (t.kind === 'receita' ? t.amount : -t.amount), 0),
    [transactions],
  )

  const recent = transactions.slice(0, 8)

  if (loading) {
    return <p className="p-4 text-sm text-slate-400">Carregando…</p>
  }

  return (
    <div className="space-y-4 p-4">
      <section className="rounded-2xl bg-slate-900 p-5 text-white dark:bg-white dark:text-slate-900">
        <p className="text-xs opacity-70">Saldo geral</p>
        <p className="mt-1 text-3xl font-semibold">{formatCurrency(saldoGeral)}</p>
        <p className="mt-1 text-xs capitalize opacity-70">{monthLabel(monthKey)}</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {(['pessoal', 'empresa'] as const).map((scope) => {
          const t = totals[scope]
          const saldo = t.receita - t.despesa
          return (
            <div
              key={scope}
              className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900"
            >
              <p className="text-xs font-medium capitalize text-slate-400">{scope}</p>
              <p
                className={`mt-1 text-lg font-semibold ${
                  saldo >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {formatCurrency(saldo)}
              </p>
              <div className="mt-2 space-y-0.5 text-xs text-slate-400">
                <p>Receitas: {formatCurrency(t.receita)}</p>
                <p>Despesas: {formatCurrency(t.despesa)}</p>
              </div>
            </div>
          )
        })}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Últimos lançamentos
        </h2>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm dark:divide-slate-800 dark:bg-slate-900">
          {recent.length === 0 && (
            <p className="p-4 text-sm text-slate-400">Nenhum lançamento ainda.</p>
          )}
          {recent.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {t.categoryName}
                </p>
                <p className="text-xs text-slate-400">
                  {formatDate(t.date)} · {t.scope}
                  {t.description ? ` · ${t.description}` : ''}
                </p>
              </div>
              <p
                className={`text-sm font-semibold ${
                  t.kind === 'receita' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {t.kind === 'receita' ? '+' : '-'}
                {formatCurrency(t.amount)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
