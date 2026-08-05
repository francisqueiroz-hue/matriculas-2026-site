import { useMemo, useState } from 'react'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { formatCurrency, formatDate } from '../lib/format'
import TransactionForm from '../components/TransactionForm'
import type { Scope, Transaction } from '../types/finance'

export default function Lancamentos() {
  const { transactions, loading, addTransaction, updateTransaction, removeTransaction } =
    useTransactions()
  const { categories } = useCategories()
  const [filter, setFilter] = useState<Scope | 'todos'>('todos')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const filtered = useMemo(
    () => (filter === 'todos' ? transactions : transactions.filter((t) => t.scope === filter)),
    [transactions, filter],
  )

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
          {(['todos', 'pessoal', 'empresa'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 font-medium capitalize ${
                filter === f
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
        >
          + Novo
        </button>
      </div>

      {loading && <p className="text-sm text-slate-400">Carregando…</p>}

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm dark:divide-slate-800 dark:bg-slate-900">
        {filtered.length === 0 && !loading && (
          <p className="p-4 text-sm text-slate-400">Nenhum lançamento.</p>
        )}
        {filtered.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setEditing(t)
              setFormOpen(true)
            }}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
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
          </button>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {editing ? 'Editar lançamento' : 'Novo lançamento'}
              </h2>
              {editing && (
                <button
                  onClick={async () => {
                    await removeTransaction(editing.id)
                    closeForm()
                  }}
                  className="text-xs font-medium text-red-600"
                >
                  Excluir
                </button>
              )}
            </div>
            <TransactionForm
              categories={categories}
              initial={editing ?? undefined}
              onCancel={closeForm}
              onSubmit={async (tx) => {
                if (editing) await updateTransaction(editing.id, tx)
                else await addTransaction(tx)
                closeForm()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
