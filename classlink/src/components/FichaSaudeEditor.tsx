"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { telefoneParaExibir } from "@/lib/busca-aluno";
import {
  CAMPOS_SAUDE,
  DICA_CAMPO_SAUDE,
  FICHA_VAZIA,
  LIMITE_AUTORIZADOS,
  ROTULO_CAMPO_SAUDE,
  ROTULO_HISTORICO_SAUDE,
  fichaTemDados,
  TERMO_SAUDE,
  type FichaSaudeDados,
} from "@/lib/ficha-saude";

export interface Autorizado {
  id?: string;
  nome: string;
  parentesco: string | null;
  telefone: string | null;
  documento: string | null;
  observacao: string | null;
}

export interface FichaSaudeResposta {
  papel: "ESCOLA" | "FAMILIA";
  aluno: { id: string; name: string; turma: string | null; responsaveis: { id: string; name: string; relation: string | null }[] };
  versaoTermo: string;
  consentimento: { id: string; versaoTexto: string; consentidoPorNome: string; consentidoEm: string } | null;
  saude: FichaSaudeDados | null;
  atualizadoEm: string | null;
  atualizadoPorNome: string | null;
  conferencia: { pendenteDesde: string | null; alteradoPelaFamiliaPor: string | null; conferidoEm: string | null; conferidoPorNome: string | null } | null;
  autorizados: Autorizado[];
  historico: { id: string; campo: string; valorAnterior: string | null; valorNovo: string | null; porNome: string; criadoEm: string }[] | null;
}

const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

const OUTRA_PESSOA = "__outra__";

const autorizadoVazio = (): Autorizado => ({ nome: "", parentesco: null, telefone: null, documento: null, observacao: null });

/**
 * Ficha de saúde e pessoas autorizadas de um aluno. A mesma tela serve a escola (direção e
 * coordenação) e a família; o servidor decide o que cada uma pode ver e salvar.
 */
export function FichaSaudeEditor({ alunoId }: { alunoId: string }) {
  const [dados, setDados] = useState<FichaSaudeResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ficha, setFicha] = useState<FichaSaudeDados>(FICHA_VAZIA);
  const [autorizados, setAutorizados] = useState<Autorizado[]>([]);
  const [aceite, setAceite] = useState(false);
  const [quemAssinou, setQuemAssinou] = useState("");
  /** Escola: nome digitado de quem assinou, quando não é um responsável com conta no app. */
  const [nomeAssinou, setNomeAssinou] = useState("");
  const [destacarTermo, setDestacarTermo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const idBase = useId();

  const carregar = useCallback(() => {
    apiJson<FichaSaudeResposta>(`/api/alunos/${alunoId}/saude`)
      .then((d) => {
        setErro(null);
        setDados(d);
        setFicha(d.saude ?? FICHA_VAZIA);
        setAutorizados(d.autorizados);
        setAceite(false);
        setQuemAssinou("");
        setNomeAssinou("");
        setDestacarTermo(false);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar a ficha"));
  }, [alunoId]);
  useEffect(carregar, [carregar]);

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (!dados) return <p className="text-sm text-slate-500">Carregando ficha...</p>;

  const escola = dados.papel === "ESCOLA";
  const temConsentimento = !!dados.consentimento;
  const outraPessoa = quemAssinou === OUTRA_PESSOA;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!dados) return;
    // Os campos de saúde ficam sempre abertos; o que se exige é a autorização antes de salvar.
    if (fichaTemDados(ficha) && !temConsentimento && !aceite) {
      setDestacarTermo(true);
      setAviso({
        tipo: "erro",
        texto: escola
          ? "Para salvar as informações de saúde, marque no quadro de autorização quem assinou o termo."
          : "Para salvar as informações de saúde, marque \"Li e autorizo\" no quadro de autorização.",
      });
      document.getElementById(`${idBase}-termo`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (aceite && escola && (!quemAssinou || (outraPessoa && nomeAssinou.trim().length < 3))) {
      setDestacarTermo(true);
      setAviso({ tipo: "erro", texto: outraPessoa ? "Digite o nome de quem assinou o termo." : "Escolha quem assinou o termo." });
      return;
    }
    setSalvando(true);
    setAviso(null);
    try {
      const corpo = {
        ficha,
        autorizados: autorizados.filter((a) => a.id || a.nome.trim() || a.telefone),
        ...(aceite && { consentimento: { aceito: true, versaoTexto: dados.versaoTermo, ...(escola && (outraPessoa ? { consentidoPorNome: nomeAssinou.trim() } : { consentidoPorId: quemAssinou })) } }),
      };
      const r = await apiJson<{ alterado: boolean }>(`/api/alunos/${alunoId}/saude`, { method: "PUT", body: JSON.stringify(corpo) });
      setAviso({
        tipo: "ok",
        texto: !r.alterado ? "Nada mudou." : escola ? "Ficha salva." : "Ficha salva. A escola foi avisada para atualizar os cuidados com a criança.",
      });
      carregar();
    } catch (err) {
      setAviso({ tipo: "erro", texto: err instanceof Error ? err.message : "Não foi possível salvar" });
    } finally {
      setSalvando(false);
    }
  }

  async function conferir() {
    try {
      await apiJson(`/api/alunos/${alunoId}/saude/conferir`, { method: "POST" });
      carregar();
    } catch (err) {
      setAviso({ tipo: "erro", texto: err instanceof Error ? err.message : "Não foi possível registrar a conferência" });
    }
  }

  async function retirarConsentimento() {
    if (!window.confirm("Retirar a autorização? As informações de saúde serão apagadas do app e a escola será avisada.")) return;
    try {
      await apiJson(`/api/alunos/${alunoId}/saude/consentimento`, { method: "DELETE" });
      setAviso({ tipo: "ok", texto: "Autorização retirada. As informações de saúde foram apagadas." });
      carregar();
    } catch (err) {
      setAviso({ tipo: "erro", texto: err instanceof Error ? err.message : "Não foi possível retirar a autorização" });
    }
  }

  const pendente = dados.conferencia?.pendenteDesde;

  return (
    <form onSubmit={salvar} className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{dados.aluno.name}</h2>
        <p className="text-sm text-slate-500">
          {dados.aluno.turma ?? "Sem turma"}
          {dados.atualizadoEm && ` · última alteração em ${dataHora(dados.atualizadoEm)}${dados.atualizadoPorNome ? ` por ${dados.atualizadoPorNome}` : ""}`}
        </p>
      </div>

      {escola && pendente && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">A família alterou esta ficha ({dados.conferencia?.alteradoPelaFamiliaPor ?? "responsável"}, desde {dataHora(pendente)}).</p>
          <p className="mt-1">Veja o histórico abaixo, avise cozinha, sala e portaria, e depois confirme.</p>
          <button type="button" onClick={conferir} className="mt-2 rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800">
            Conferi e atualizei os protocolos
          </button>
        </div>
      )}
      {escola && !pendente && dados.conferencia?.conferidoEm && (
        <p className="text-xs text-slate-500">
          Última conferência: {dataHora(dados.conferencia.conferidoEm)} por {dados.conferencia.conferidoPorNome}.
        </p>
      )}

      {/* ─── Consentimento ─── */}
      <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700" aria-labelledby={`${idBase}-termo`}>
        <h3 id={`${idBase}-termo`} className="font-semibold">
          Consentimento para dados de saúde
        </h3>
        {temConsentimento ? (
          <div className="mt-1 text-sm">
            <p className="text-emerald-800 dark:text-emerald-300">
              ✓ Autorizado por {dados.consentimento!.consentidoPorNome} em {dataHora(dados.consentimento!.consentidoEm)}.
            </p>
            {!escola && (
              <button type="button" onClick={retirarConsentimento} className="mt-1 text-xs font-medium text-red-700 underline dark:text-red-300">
                Retirar autorização e apagar as informações de saúde
              </button>
            )}
          </div>
        ) : (
          <div
            className={`mt-2 rounded-lg border-2 p-3 text-sm ${destacarTermo && !aceite ? "border-red-500 bg-red-50 dark:bg-red-950" : "border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950"}`}
          >
            <p className="mb-2 font-semibold">
              {escola
                ? "Para guardar informações de saúde, registre a autorização assinada pela família:"
                : "Para guardar informações de saúde, leia e marque a autorização:"}
            </p>
            {TERMO_SAUDE.map((p) => (
              <p key={p} className="mb-2 last:mb-0">
                {p}
              </p>
            ))}
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Base legal: Lei 13.709/2018 (LGPD), arts. 11, I, e 14, § 1º. Versão do termo: {dados.versaoTermo}.</p>
            {escola && (
              <label className="mt-3 block text-sm">
                Quem assinou o termo em papel
                <select
                  value={quemAssinou}
                  onChange={(e) => setQuemAssinou(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Escolha...</option>
                  {dados.aluno.responsaveis.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.relation ? ` (${r.relation})` : ""}
                    </option>
                  ))}
                  <option value={OUTRA_PESSOA}>Outra pessoa responsável (digitar o nome)</option>
                </select>
                {outraPessoa && (
                  <input
                    value={nomeAssinou}
                    onChange={(e) => setNomeAssinou(e.target.value)}
                    maxLength={120}
                    placeholder="Nome completo de quem assinou"
                    aria-label="Nome completo de quem assinou o termo"
                    className="mt-2 block w-full rounded-md border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-800"
                  />
                )}
              </label>
            )}
            <label className="mt-3 flex items-start gap-2 font-medium">
              <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-1 h-4 w-4" />
              {escola ? "Confirmo que a pessoa acima assinou este termo em papel (guardar a via assinada)." : "Li e autorizo, como responsável pela criança."}
            </label>
          </div>
        )}
      </section>

      {/* ─── Saúde ─── */}
      <fieldset className="space-y-3 rounded-xl border border-rose-200 p-3 dark:border-rose-900">
        <legend className="px-1 font-semibold text-rose-800 dark:text-rose-300">Saúde</legend>
        {!temConsentimento && !aceite && (
          <p className="text-xs text-slate-500">Pode preencher; ao salvar, é preciso ter a autorização marcada acima.</p>
        )}
        {CAMPOS_SAUDE.map((c) => (
          <label key={c} className="block text-sm">
            <span className="font-medium">{ROTULO_CAMPO_SAUDE[c]}</span>
            <span className="block text-xs text-slate-500">{DICA_CAMPO_SAUDE[c]}</span>
            <textarea
              value={ficha[c] ?? ""}
              onChange={(e) => setFicha((f) => ({ ...f, [c]: e.target.value }))}
              maxLength={1000}
              rows={2}
              placeholder={c === "alergias" ? "Nenhuma alergia conhecida? Deixe em branco." : ""}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        ))}
      </fieldset>

      {/* ─── Pessoas autorizadas ─── */}
      <fieldset className="space-y-3 rounded-xl border border-sky-200 p-3 dark:border-sky-900">
        <legend className="px-1 font-semibold text-sky-800 dark:text-sky-300">Pessoas autorizadas a buscar</legend>
        <p className="text-xs text-slate-500">
          Os responsáveis cadastrados já podem buscar. Inclua aqui avós, tios, transporte escolar etc. A escola confere o documento na saída.
        </p>
        {autorizados.length === 0 && <p className="text-sm text-slate-500">Nenhuma pessoa além dos responsáveis.</p>}
        {autorizados.map((a, i) => (
          <div key={a.id ?? `novo-${i}`} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-2 dark:bg-slate-800">
            {(["nome", "parentesco", "telefone", "documento", "observacao"] as const).map((campo) => (
              <label key={campo} className={`text-xs ${campo === "nome" || campo === "observacao" ? "sm:col-span-2" : ""}`}>
                {{ nome: "Nome completo", parentesco: "Parentesco", telefone: "Telefone com DDD", documento: "RG ou CPF", observacao: "Observação" }[campo]}
                <input
                  value={campo === "telefone" && a.telefone && /^\d+$/.test(a.telefone) ? telefoneParaExibir(a.telefone) : (a[campo] ?? "")}
                  onChange={(e) => setAutorizados((lista) => lista.map((x, j) => (j === i ? { ...x, [campo]: e.target.value || null } : x)))}
                  inputMode={campo === "telefone" ? "tel" : undefined}
                  required={campo === "nome"}
                  className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() => setAutorizados((lista) => lista.filter((_, j) => j !== i))}
              className="justify-self-start text-xs font-medium text-red-700 underline dark:text-red-300"
            >
              Remover esta pessoa
            </button>
          </div>
        ))}
        {autorizados.length < LIMITE_AUTORIZADOS && (
          <button
            type="button"
            onClick={() => setAutorizados((lista) => [...lista, autorizadoVazio()])}
            className="rounded-md border border-sky-600 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
          >
            + Incluir pessoa
          </button>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={salvando} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        {aviso && (
          <p role={aviso.tipo === "erro" ? "alert" : "status"} className={`text-sm ${aviso.tipo === "erro" ? "text-red-600" : "text-emerald-700 dark:text-emerald-300"}`}>
            {aviso.texto}
          </p>
        )}
      </div>
      {!escola && <p className="text-xs text-slate-500">Quando você salva, a direção e a coordenação recebem um aviso para atualizar os cuidados com a criança.</p>}

      {escola && dados.historico && dados.historico.length > 0 && (
        <details className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
          <summary className="cursor-pointer font-semibold">Histórico de alterações ({dados.historico.length})</summary>
          <ul className="mt-2 space-y-2">
            {dados.historico.map((h) => (
              <li key={h.id} className="border-t border-slate-100 pt-2 dark:border-slate-800">
                <p className="text-xs text-slate-500">
                  {dataHora(h.criadoEm)} · {h.porNome}
                </p>
                <p className="font-medium">{ROTULO_HISTORICO_SAUDE[h.campo] ?? h.campo}</p>
                <p>
                  <span className="text-slate-500">Antes:</span> {h.valorAnterior ?? "(vazio)"}
                </p>
                <p>
                  <span className="text-slate-500">Depois:</span> {h.valorNovo ?? "(vazio)"}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </form>
  );
}
