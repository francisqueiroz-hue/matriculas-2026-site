"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { EnviarAcessoWhatsApp } from "@/components/EnviarAcessoWhatsApp";
import { apiJson } from "@/lib/api-client";

interface Responsavel {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  jaEntrou: boolean;
  alunos: string[];
  linkConvite: string | null;
}

interface Dados {
  numeroEscola: string;
  linkPedirAcesso: string;
  envioAutomaticoDisponivel: boolean;
  responsaveis: Responsavel[];
}

function formatarTelefone(telefone: string | null) {
  if (!telefone) return "sem telefone";
  const d = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

function AcessosContent() {
  const [todos, setTodos] = useState(false);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [convidados, setConvidados] = useState<Record<string, boolean>>({});
  const [senhas, setSenhas] = useState<Record<string, { texto: string; link: string | null }>>({});
  const [copiado, setCopiado] = useState(false);
  const [enviandoTodos, setEnviandoTodos] = useState(false);
  const [resultadoLote, setResultadoLote] = useState<string | null>(null);

  const carregar = useCallback(() => {
    apiJson<Dados>(`/api/admin/acessos${todos ? "?todos=1" : ""}`)
      .then((d) => {
        setDados(d);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar"));
  }, [todos]);

  useEffect(carregar, [carregar]);

  async function gerarSenha(r: Responsavel) {
    if (!confirm(`Gerar uma nova senha provisória para ${r.name}? A senha atual deixará de funcionar.`)) return;
    try {
      const res = await apiJson<{ temporaryPassword?: string; notificadoPorWhatsApp?: boolean; whatsappManual?: string | null }>(
        `/api/admin/users/${r.id}`,
        { method: "PATCH", body: JSON.stringify({ resetPassword: true }) },
      );
      setSenhas((prev) => ({
        ...prev,
        [r.id]: {
          texto: res.notificadoPorWhatsApp
            ? `Nova senha ${res.temporaryPassword} enviada pelo WhatsApp da escola.`
            : `Nova senha: ${res.temporaryPassword}. Envie pelo botão ao lado.`,
          link: res.whatsappManual ?? null,
        },
      }));
    } catch (err) {
      setSenhas((prev) => ({ ...prev, [r.id]: { texto: err instanceof Error ? err.message : "Erro", link: null } }));
    }
  }

  async function enviarTodos() {
    if (!dados) return;
    const pendentes = dados.responsaveis.filter((r) => !r.jaEntrou && r.phone);
    if (pendentes.length === 0) return;
    if (!confirm(`Enviar o acesso (com nova senha provisória) pelo WhatsApp da escola para ${pendentes.length} responsável(is)?`)) return;
    setEnviandoTodos(true);
    setResultadoLote(null);
    try {
      const res = await apiJson<{ enviados: number; falhas: { nome: string; motivo: string }[] }>("/api/admin/acessos/reenviar", {
        method: "POST",
        body: JSON.stringify({ ids: pendentes.map((r) => r.id) }),
      });
      setResultadoLote(
        `${res.enviados} enviado(s).` +
          (res.falhas.length ? ` Falharam: ${res.falhas.map((f) => `${f.nome} (${f.motivo})`).join("; ")}.` : ""),
      );
    } catch (err) {
      setResultadoLote(err instanceof Error ? err.message : "Erro no envio");
    } finally {
      setEnviandoTodos(false);
    }
  }

  async function copiarLink() {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(
        `Para receber seu acesso ao ClassLink, toque no link e envie a mensagem ACESSO: ${dados.linkPedirAcesso}`,
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      prompt("Copie o link:", dados.linkPedirAcesso);
    }
  }

  // Só conta quem pode receber (tem celular); os sem telefone aparecem destacados na lista.
  const pendentes = dados?.responsaveis.filter((r) => !r.jaEntrou && r.phone).length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Acessos das famílias</h1>
        <p className="text-sm text-slate-500">
          Responsáveis que ainda não entraram no ClassLink e como enviar o acesso para eles.
        </p>
      </div>

      {dados && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">📲 A família pede o acesso e recebe na hora</p>
          <p className="mt-1">
            Quem enviar <strong>ACESSO</strong> para o WhatsApp da escola <strong>{formatarTelefone(dados.numeroEscola)}</strong> recebe
            automaticamente o link e uma senha provisória — desde que o número dela esteja cadastrado aqui. Use o botão
            <strong> Enviar convite</strong> de cada família ou divulgue o link nos grupos da escola.
          </p>
          <button
            type="button"
            onClick={copiarLink}
            className="mt-3 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            {copiado ? "✓ Mensagem com o link copiada" : "Copiar mensagem com o link para os grupos"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTodos(false)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${!todos ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Nunca entraram
        </button>
        <button
          type="button"
          onClick={() => setTodos(true)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${todos ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Todos os responsáveis
        </button>
        {dados?.envioAutomaticoDisponivel && pendentes > 0 && (
          <button
            type="button"
            disabled={enviandoTodos}
            onClick={enviarTodos}
            className="ml-auto rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {enviandoTodos ? "Enviando..." : `Enviar acesso automático para quem nunca entrou (${pendentes})`}
          </button>
        )}
      </div>
      {resultadoLote && <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">{resultadoLote}</p>}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-slate-500">Carregando...</p>}
      {dados?.responsaveis.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {todos ? "Nenhum responsável cadastrado." : "🎉 Todos os responsáveis já entraram no ClassLink."}
        </p>
      )}

      <ul className="space-y-2">
        {dados?.responsaveis.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">
                  {r.name}{" "}
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      r.jaEntrou ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {r.jaEntrou ? "Já entrou" : "Nunca entrou"}
                  </span>
                </p>
                <p className="text-slate-600">
                  {formatarTelefone(r.phone)}
                  {r.email && ` · ${r.email}`}
                </p>
                {r.alunos.length > 0 && <p className="text-xs text-slate-500">Aluno(s): {r.alunos.join(", ")}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {r.linkConvite && (
                  <a
                    href={r.linkConvite}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setConvidados((prev) => ({ ...prev, [r.id]: true }))}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    {convidados[r.id] ? "✓ Convite aberto — enviar de novo" : "Enviar convite pelo meu WhatsApp"}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => gerarSenha(r)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Gerar nova senha
                </button>
              </div>
            </div>
            {!r.phone && (
              <p className="mt-1 text-xs text-red-600">Sem telefone: cadastre o celular em Alunos → Editar para poder enviar o acesso.</p>
            )}
            {senhas[r.id] && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-xs text-slate-600">{senhas[r.id].texto}</p>
                <EnviarAcessoWhatsApp href={senhas[r.id].link} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AcessosPage() {
  return (
    <AdminGuard>
      <AcessosContent />
    </AdminGuard>
  );
}
