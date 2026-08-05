import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import Dashboard from '../pages/Dashboard'
import Lancamentos from '../pages/Lancamentos'
import Categorias from '../pages/Categorias'
import Relatorios from '../pages/Relatorios'

const TABS = [
  { id: 'dashboard', label: 'Início', icon: '🏠' },
  { id: 'lancamentos', label: 'Lançamentos', icon: '💸' },
  { id: 'relatorios', label: 'Relatórios', icon: '📊' },
  { id: 'categorias', label: 'Categorias', icon: '🏷️' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function Shell() {
  const [tab, setTab] = useState<TabId>('dashboard')
  const { user, logout } = useAuth()
  const online = useOnlineStatus()

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div>
          <h1 className="text-sm font-semibold text-slate-900 dark:text-white">
            Controle Financeiro
          </h1>
          <p className="text-xs text-slate-400">{user?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            title={online ? 'Sincronizado' : 'Offline — será sincronizado ao reconectar'}
            className="flex items-center gap-1 text-xs text-slate-400"
          >
            <span
              className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
            {online ? 'Online' : 'Offline'}
          </span>
          <button
            onClick={() => logout()}
            className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'lancamentos' && <Lancamentos />}
        {tab === 'relatorios' && <Relatorios />}
        {tab === 'categorias' && <Categorias />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-950">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
              tab === t.id
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
