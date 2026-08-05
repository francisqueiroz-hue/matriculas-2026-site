import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { missingFirebaseConfig } from '../lib/firebase'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
    } catch {
      setError('Não foi possível entrar. Confira o e-mail e a senha.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
        <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-white">
          Controle Financeiro
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Entre para acessar seus lançamentos, sincronizados entre celular e computador.
        </p>

        {missingFirebaseConfig && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Firebase ainda não configurado. Preencha o arquivo <code>.env</code> com as
            credenciais do seu projeto (veja o README) antes de entrar.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <input
            type="password"
            required
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-400">
          O usuário é criado no console do Firebase (Authentication → Users) — veja o
          README para o passo a passo.
        </p>
      </div>
    </div>
  )
}
