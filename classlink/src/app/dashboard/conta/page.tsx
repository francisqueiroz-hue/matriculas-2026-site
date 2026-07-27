"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";

export default function ContaPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiJson("/api/account/delete", { method: "POST", body: JSON.stringify({ password }) });
      router.push("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">Minha conta</h1>
        <p className="mt-1 text-sm text-slate-500">{user.name} · {user.email}</p>
        <p className="text-sm text-slate-500">{user.schoolName}</p>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Excluir minha conta</h2>
        <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
          Conforme a LGPD, você pode solicitar a exclusão dos seus dados a qualquer momento. Seus dados de
          identificação serão anonimizados e o acesso ao app será encerrado. Mensagens e avisos já publicados são
          mantidos de forma anonimizada para preservar o histórico da turma.
        </p>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="mt-3 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:text-red-300"
          >
            Quero excluir minha conta
          </button>
        ) : (
          <form onSubmit={handleDelete} className="mt-3 space-y-2">
            <input
              type="password"
              required
              placeholder="Confirme sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-800 dark:bg-slate-900"
            />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {loading ? "Excluindo..." : "Confirmar exclusão"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
