"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { linkPedirAcesso } from "@/lib/whatsapp-escola";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiJson("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
      router.push(searchParams.get("next") ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-center gap-4">
          <img src="/logos/logo-espaco-kids.png" alt="Espaço Kids" className="h-16 w-auto object-contain" />
          <span className="h-12 w-px bg-slate-200 dark:bg-slate-800" />
          <img src="/logos/logo-instituto-fokus.png" alt="Instituto Fokus" className="h-16 w-auto object-contain" />
        </div>
        <p className="mb-6 text-center text-sm text-slate-500">Comunicação entre escola e família</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">E-mail ou telefone</label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              placeholder="voce@escola.com ou (21) 90000-0000"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
          <Link href="/esqueci-senha" className="block text-center text-sm text-indigo-600 hover:underline">
            Esqueci minha senha
          </Link>
          <a
            href={linkPedirAcesso()}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm font-medium text-emerald-700 hover:underline"
          >
            Primeiro acesso? Receba sua senha pelo WhatsApp
          </a>
        </form>

        <a
          href="/matriculas"
          className="mt-6 block rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          📣 Matrículas e rematrícula 2027 — saiba mais
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
