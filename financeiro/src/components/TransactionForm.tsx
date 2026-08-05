import { useState, type FormEvent } from 'react'
import type { Category, NewTransaction, Scope, Kind } from '../types/finance'

interface Props {
  categories: Category[]
  initial?: Partial<NewTransaction>
  onSubmit: (tx: NewTransaction) => Promise<void>
  onCancel: () => void
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function TransactionForm({ categories, initial, onSubmit, onCancel }: Props) {
  const [scope, setScope] = useState<Scope>(initial?.scope ?? 'pessoal')
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'despesa')
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? todayIso())
  const [saving, setSaving] = useState(false)

  const options = categories
    .filter((c) => c.scope === scope && c.kind === kind)
    .sort((a, b) => a.order - b.order)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const cat = categories.find((c) => c.id === categoryId) ?? options[0]
    if (!cat) return
    setSaving(true)
    try {
      await onSubmit({
        scope,
        kind,
        amount: Number(amount.replace(',', '.')),
        categoryId: cat.id,
        categoryName: cat.name,
        description: description.trim(),
        date,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['despesa', 'receita'] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k)
                setCategoryId('')
              }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize ${
                kind === k
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['pessoal', 'empresa'] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setScope(s)
                setCategoryId('')
              }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize ${
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

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Valor (R$)</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Categoria</label>
        <select
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="" disabled>
            Selecione…
          </option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Descrição</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Opcional"
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Data</label>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || options.length === 0}
          className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      {options.length === 0 && (
        <p className="text-xs text-amber-600">
          Nenhuma categoria de {kind} para {scope}. Crie uma na aba Categorias.
        </p>
      )}
    </form>
  )
}
