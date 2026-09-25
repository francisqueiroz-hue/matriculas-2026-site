"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";

interface Responsavel {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  jaEntrou: boolean;
  alunos: string[];
  funcao: string | null;
  turmas: string[];
}

interface Dados {
  numeroEscola: string;
  linkPedirAcesso: string;
  whatsappConfigurado: boolean;
  conviteAprovado: boolean;
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
  const [publico, setPublico] = useState<"familias" | "equipe">("familias");
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<Record<string, { texto: string; ok: boolean }>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [enviandoTodos, setEnviandoTodos] = useState(false);
  const [resultadoLote, setResultadoLote] = useState<string | null>(null);

  const carregar = useCallback(() => {
    const params = new URLSearchParams({ ...(todos && { todos: "1" }), ...(publico === "equipe" && { publico: "equipe" }) });
    apiJson<Dados>(`/api/admin/acessos?${params}`)
      .then((d) => {
        setDados(d);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar"));
  }, [todos, publico]);

  useEffect(carregar, [carregar]);

  async function enviarAcesso(r: Responsavel) {
    setEnviando(r.id);
    try {
      const res = await apiJson<{ resultados: { id: string; enviado: boolean; mensagem: string }[] }>("/api/admin/acessos/enviar", {
        method: "POST",
        body: JSON.stringify({ ids: [r.id] }),
      });
      const item = res.resultados[0];
      setAvisos((prev) => ({ ...prev, [r.id]: item ? { texto: item.mensagem, ok: item.enviado } : { texto: "Pessoa não encontrada.", ok: false } }));
    } catch (err) {
      setAvisos((prev) => ({ ...prev, [r.id]: { texto: err instanceof Error ? err.message : "Erro no envio", ok: false } }));
    } finally {
      setEnviando(null);
    }
  }

  async function gerarSenha(r: Responsavel) {
    if (!confirm(`Gerar uma nova senha provisória para ${r.name}? A senha atual deixará de funcionar.`)) return;
    try {
      const res = await apiJson<{ temporaryPassword?: string; envio?: { enviado: boolean; mensagem: string } }>(`/api/admin/users/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ resetPassword: true }),
      });
      const texto = res.envio?.enviado
        ? res.envio.mensagem
        : `${res.envio?.mensagem ?? ""} Nova senha provisória: ${res.temporaryPassword} — entregue pessoalmente.`.trim();
      setAvisos((prev) => ({ ...prev, [r.id]: { texto, ok: Boolean(res.envio?.enviado) } }));
    } catch (err) {
      setAvisos((prev) => ({ ...prev, [r.id]: { texto: err instanceof Error ? err.message : "Erro", ok: false } }));
    }
  }

  async function excluir(r: Responsavel) {
    if (
      !confirm(
        `Excluir ${r.name}? A pessoa perde o acesso ao ClassLink e sai das listas; e-mail e celular são apagados do cadastro. Use para quem saiu da escola.`,
      )
    ) {
      return;
    }
    try {
      await apiJson(`/api/admin/users/${r.id}`, { method: "DELETE" });
      carregar();
    } catch (err) {
      setAvisos((prev) => ({ ...prev, [r.id]: { texto: err instanceof Error ? err.message : "Erro ao excluir", ok: false } }));
    }
  }

  async function enviarTodos() {
    if (!dados) return;
    const pendentes = dados.responsaveis.filter((r) => !r.jaEntrou && r.phone);
    if (pendentes.length === 0) return;
    if (!confirm(`Enviar o acesso pelo WhatsApp da escola para ${pendentes.length} pessoa(s) que nunca entraram?`)) return;
    setEnviandoTodos(true);
    setResultadoLote(null);
    try {
      const res = await apiJson<{
        enviados: number;
        falhas: { nome: string; motivo: string }[];
        resultados: { id: string; enviado: boolean; mensagem: string }[];
      }>("/api/admin/acessos/enviar", {
        method: "POST",
        body: JSON.stringify({ ids: pendentes.map((r) => r.id) }),
      });
      setAvisos((prev) => ({
        ...prev,
        ...Object.fromEntries(res.resultados.map((item) => [item.id, { texto: item.mensagem, ok: item.enviado }])),
      }));
      setResultadoLote(
        `${res.enviados} enviado(s) pelo WhatsApp da escola.` + (res.falhas.length ? ` ${res.falhas.length} não enviado(s) — veja o motivo em cada nome.` : ""),
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
        <h1 className="text-xl font-bold">Acessos ao ClassLink</h1>
        <p className="text-sm text-slate-500">
          Famílias e equipe que ainda não entraram no ClassLink e como enviar o acesso para elas.
        </p>
      </div>

      {dados && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">📲 O acesso sai pelo WhatsApp da escola, direto do ClassLink</p>
          <p className="mt-1">
            O ClassLink envia o acesso pelo WhatsApp da escola <strong>{formatarTelefone(dados.numeroEscola)}</strong> — nada sai do seu
            WhatsApp pessoal. A pessoa recebe um convite com o botão <strong>ACESSO</strong>; ao tocar, recebe o link, o login e uma
            senha provisória na hora. Quem já mandou <strong>ACESSO</strong> para a escola também recebe automaticamente.
          </p>
          {!dados.whatsappConfigurado && (
            <p className="mt-2 rounded-md bg-amber-100 p-2 text-xs text-amber-950">
              A API do WhatsApp da escola não está configurada na Vercel — o envio pelo aplicativo fica indisponível.
            </p>
          )}
          {dados.whatsappConfigurado && !dados.conviteAprovado && (
            <p className="mt-2 rounded-md bg-amber-100 p-2 text-xs text-amber-950">
              O modelo de convite ainda não está aprovado pela Meta. Até lá, o envio só chega a quem escreveu para a escola nas últimas
              24 horas. Cadastre o modelo em Painel → Configuração dos avisos → “Cadastrar modelos na Meta”, ou divulgue o link abaixo
              nos grupos.
            </p>
          )}
          <button
            type="button"
            onClick={copiarLink}
            className="mt-3 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            {copiado ? "✓ Mensagem com o link copiada" : "Copiar mensagem com o link para os grupos"}
          </button>
        </div>
      )}

      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm" role="tablist" aria-label="Público">
        {(["familias", "equipe"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={publico === p}
            onClick={() => setPublico(p)}
            className={`rounded-md px-4 py-1.5 font-semibold ${publico === p ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {p === "familias" ? "Famílias" : "Equipe"}
          </button>
        ))}
      </div>

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
          {publico === "equipe" ? "Toda a equipe" : "Todos os responsáveis"}
        </button>
        {dados?.whatsappConfigurado && pendentes > 0 && (
          <button
            type="button"
            disabled={enviandoTodos}
            onClick={enviarTodos}
            className="ml-auto rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {enviandoTodos ? "Enviando..." : `Enviar acesso para quem nunca entrou (${pendentes})`}
          </button>
        )}
      </div>
      {resultadoLote && <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">{resultadoLote}</p>}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-slate-500">Carregando...</p>}
      {dados?.responsaveis.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {publico === "equipe"
            ? todos
              ? "Ninguém da equipe cadastrado."
              : "🎉 Toda a equipe já entrou no ClassLink."
            : todos
              ? "Nenhum responsável cadastrado."
              : "🎉 Todos os responsáveis já entraram no ClassLink."}
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
                {r.funcao && (
                  <p className="text-xs text-slate-500">
                    {r.funcao}
                    {r.turmas.length > 0 && ` · ${r.turmas.join(", ")}`}
                  </p>
                )}
                {r.alunos.length > 0 && <p className="text-xs text-slate-500">Aluno(s): {r.alunos.join(", ")}</p>}
                {publico === "familias" && r.alunos.length === 0 && (
                  <p className="text-xs text-amber-700">Sem aluno ativo na escola — se a família saiu, use Excluir.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {dados?.whatsappConfigurado && r.phone && (
                  <button
                    type="button"
                    disabled={enviando === r.id || enviandoTodos}
                    onClick={() => enviarAcesso(r)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {enviando === r.id ? "Enviando..." : avisos[r.id]?.ok ? "✓ Enviado — enviar de novo" : "Enviar acesso pelo WhatsApp da escola"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => gerarSenha(r)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Gerar nova senha
                </button>
                <button
                  type="button"
                  onClick={() => excluir(r)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  Excluir
                </button>
              </div>
            </div>
            {!r.phone && (
              <p className="mt-1 text-xs text-red-600">Sem telefone: cadastre o celular em {publico === "equipe" ? "Equipe" : "Alunos"} → Editar para poder enviar o acesso.</p>
            )}
            {avisos[r.id] && (
              <p className={`mt-2 text-xs ${avisos[r.id].ok ? "text-emerald-700" : "text-red-600"}`}>{avisos[r.id].texto}</p>
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
