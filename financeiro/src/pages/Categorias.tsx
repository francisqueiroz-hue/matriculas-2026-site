import { useState } from 'react'
import { useCategories } from '../hooks/useCategories'
import { useTransactions } from '../hooks/useTransactions'
import type { Scope, Kind } from '../types/finance'
import { august2026Import } from '../data/spreadsheetImport'

export default function Categorias() {
  const { categories, addCategory, removeCategory } = useCategories()
  const { transactions, addTransaction } = useTransactions()
  const [name, setName] = useState('')
  const [scope, setScope] = useState<Scope>('pessoal')
  const [kind, setKind] = useState<Kind>('despesa')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const alreadyImported = transactions.some((t) => t.description.includes('[planilha Ago/2026]'))

  const handleAdd = async () => {
    if (!name.trim()) return
    await addCategory({
      name: name.trim(),
      scope,
      kind,
      color: '#64748b',
      order: categories.length + 1,
    })
    setName('')
  }

  const handleImport = async () => {
    setImporting(true)
    setImportMsg(null)
    try {
      let count = 0
      for (const item of august2026Import) {
        const cat = categories.find(
          (c) => c.name === item.categoryName && c.scope === item.scope && c.kind === item.kind,
        )
        if (!cat) continue
        await addTransaction({
          scope: item.scope,
          kind: item.kind,
          amount: item.amount,
          categoryId: cat.id,
          categoryName: cat.name,
          description: `${item.description} [planilha Ago/2026]`,
          date: item.date,
        })
        count++
      }
      setImportMsg(`${count} lançamentos importados da planilha.`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Importar dados da planilha
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          Traz para o app os lançamentos de referência de Agosto/2026 já presentes na
          planilha original (folha de pagamento, contas da escola, casa etc). Pode ser
          feito uma vez; edite ou apague os lançamentos depois, se quiser.
        </p>
        <button
          onClick={handleImport}
          disabled={importing || alreadyImported}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {alreadyImported ? 'Já importado' : importing ? 'Importando…' : 'Importar Agosto/2026'}
        </button>
        {importMsg && <p className="mt-2 text-xs text-emerald-600">{importMsg}</p>}
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Nova categoria
        </h2>
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da categoria"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <div className="flex gap-2">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="pessoal">Pessoal</option>
              <option value="empresa">Empresa</option>
            </select>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
          >
            Adicionar categoria
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {(['pessoal', 'empresa'] as const).map((s) => (
          <div key={s} className="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <h3 className="mb-2 text-sm font-semibold capitalize text-slate-700 dark:text-slate-200">
              {s}
            </h3>
            <div className="space-y-1">
              {categories
                .filter((c) => c.scope === s)
                .map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                      <span className="text-xs text-slate-400">({c.kind})</span>
                    </span>
                    <button
                      onClick={() => removeCategory(c.id)}
                      className="text-xs text-slate-300 hover:text-red-500"
                    >
                      remover
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
