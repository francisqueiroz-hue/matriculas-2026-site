import { AuthProvider, useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Shell from './components/Shell'
import { missingFirebaseConfig } from './lib/firebase'

function SetupNeeded() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
        <h1 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          Configuração necessária
        </h1>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Este app precisa de um projeto Firebase para sincronizar os dados entre o
          celular e o computador. Crie o arquivo <code>.env</code> na raiz do projeto
          com as credenciais do seu projeto Firebase — veja o passo a passo completo no{' '}
          <code>README.md</code>.
        </p>
        <p className="text-xs text-slate-400">
          Depois de preencher o <code>.env</code>, reinicie o app (<code>npm run dev</code>{' '}
          ou um novo build).
        </p>
      </div>
    </div>
  )
}

function Gate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm text-slate-400">Carregando…</p>
      </div>
    )
  }

  if (!user) return <Login />

  return <Shell />
}

export default function App() {
  if (missingFirebaseConfig) return <SetupNeeded />

  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
