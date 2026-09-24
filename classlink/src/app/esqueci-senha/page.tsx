"use client";

import { useState } from "react";
import Link from "next/link";
import { apiJson } from "@/lib/api-client";

export default function EsqueciSenhaPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiJson("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ identifier }) });
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex items-center justify-center gap-4">
          <img src="/logos/logo-espaco-kids.png" alt="Espaço Kids" className="h-16 w-auto object-contain" />
          <span className="h-12 w-px bg-slate-200" />
          <img src="/logos/logo-instituto-fokus.png" alt="Instituto Fokus" className="h-16 w-auto object-contain" />
        </div>

        <h1 className="mb-1 text-center text-lg font-bold">Esqueci minha senha</h1>

        {sent ? (
          <div className="mt-4 space-y-4 text-center text-sm text-slate-600">
            <p>
              Se encontrarmos uma conta com esse e-mail ou telefone, enviamos agora uma nova senha por WhatsApp ou
              e-mail. Confira suas mensagens.
            </p>
            <p className="text-xs text-slate-400">
              Se depois de alguns minutos você não receber nada, procure a secretaria da escola.
            </p>
            <Link href="/login" className="block font-medium text-indigo-600 hover:underline">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-6 text-center text-sm text-slate-500">
              Informe o e-mail ou telefone cadastrado. Vamos gerar uma senha nova e enviar por lá.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">E-mail ou telefone</label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="voce@escola.com ou (21) 90000-0000"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading ? "Enviando..." : "Enviar nova senha"}
              </button>
              <Link href="/login" className="block text-center text-sm text-slate-500 hover:underline">
                Voltar para o login
              </Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
