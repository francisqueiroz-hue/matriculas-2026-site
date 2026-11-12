"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { FINALIDADES, ROTULO_ETAPA, ROTULO_FINALIDADE, type Etapa, type Finalidade, type ItemChecklist, type TipoDocumento } from "@/lib/ficha-matricula";

interface AlunoResumo {
  id: string;
  name: string;
  class: { id: string; name: string } | null;
  etapa: Etapa;
  documentos: { entregues: number; exigidos: number; pendentes: number };
}

interface Consentimento {
  id: string;
  finalidade: Finalidade;
  versaoTexto: string;
  consentidoPorId: string | null;
  consentidoPorNome: string;
  consentidoEm: string;
  revogadoEm: string | null;
}

interface Ficha {
  aluno: { id: string; name: string; turma: string | null };
  responsaveis: { id: string; name: string; relation: string | null }[];
  anoLetivo: number;
  etapa: Etapa;
  papel: "ADMIN" | "STAFF";
  documentos: ItemChecklist[];
  consentimentos: Consentimento[];
}

const dataBR = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(iso)) : "";
/** "AAAA-MM-DD" para o <input type="date">, no fuso de Brasília. */
const paraInputData = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "";

const anoAtual = () => Number(new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));

export default function FichasPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Carregando...</p>}>
      <FichasConteudo />
    </Suspense>
  );
}

function FichasConteudo() {
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const alunoId = params.get("aluno");
  const [ano, setAno] = useState<number>(() => Number(params.get("ano")) || anoAtual());

  const abrir = useCallback(
    (id: string | null) => {
      const q = new URLSearchParams();
      if (id) q.set("aluno", id);
      q.set("ano", String(ano));
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [ano, pathname, router],
  );

  if (user.role !== "ADMIN" && user.role !== "STAFF") {
    return <p className="text-sm text-slate-500">Área restrita à equipe da escola.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Fichas de matrícula</h1>
        <p className="mt-1 text-sm text-slate-500">
          Checklist de documentos e consentimentos LGPD de cada aluno. Documento pendente nunca impede aula, prova ou a
          emissão de outros documentos.
        </p>
      </div>

      <div>
        <label htmlFor="ficha-ano" className="mb-1 block text-xs font-medium">
          Ano letivo
        </label>
        <select
          id="ficha-ano"
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {[anoAtual() - 1, anoAtual(), anoAtual() + 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {alunoId ? (
        <FichaAluno key={`${alunoId}-${ano}`} alunoId={alunoId} ano={ano} voltar={() => abrir(null)} />
      ) : (
        <ListaAlunos ano={ano} abrir={abrir} />
      )}
    </div>
  );
}

function ListaAlunos({ ano, abrir }: { ano: number; abrir: (id: string) => void }) {
  const [alunos, setAlunos] = useState<AlunoResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);

  useEffect(() => {
    let ativo = true;
    apiJson<{ alunos: AlunoResumo[] }>(`/api/fichas-matricula?ano=${ano}`)
      .then((d) => ativo && setAlunos(d.alunos))
      .catch((err) => ativo && setErro(err instanceof Error ? err.message : "Erro ao carregar os alunos"));
    return () => {
      ativo = false;
    };
  }, [ano]);

  const filtrados = useMemo(() => {
    const termo = busca
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    return (alunos ?? []).filter((a) => {
      if (soPendentes && a.documentos.pendentes === 0) return false;
      if (!termo) return true;
      const alvo = `${a.name} ${a.class?.name ?? ""}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      return alvo.includes(termo);
    });
  }, [alunos, busca, soPendentes]);

  if (erro) return <p className="text-sm text-red-600" role="alert">{erro}</p>;
  if (!alunos) return <p className="text-sm text-slate-500">Carregando alunos...</p>;
  if (alunos.length === 0) return <p className="text-sm text-slate-500">Nenhum aluno cadastrado.</p>;

  return (
    <section aria-labelledby="ficha-lista-titulo" className="space-y-3">
      <h2 id="ficha-lista-titulo" className="sr-only">
        Alunos
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="ficha-busca" className="mb-1 block text-xs font-medium">
            Buscar aluno ou turma
          </label>
          <input
            id="ficha-busca"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome do aluno ou turma"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} className="h-4 w-4" />
          Só com documentos pendentes
        </label>
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum aluno encontrado.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {filtrados.map((a) => {
            const completo = a.documentos.pendentes === 0;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => abrir(a.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block text-xs text-slate-500">
                      {a.class?.name ?? "Sem turma"} · {ROTULO_ETAPA[a.etapa]}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      completo ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {completo ? "Documentos completos" : `${a.documentos.entregues}/${a.documentos.exigidos} entregues`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FichaAluno({ alunoId, ano, voltar }: { alunoId: string; ano: number; voltar: () => void }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    apiJson<Ficha>(`/api/fichas-matricula/${alunoId}?ano=${ano}`)
      .then((d) => {
        setFicha(d);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar a ficha"));
  }, [alunoId, ano]);

  useEffect(carregar, [carregar]);

  return (
    <div className="space-y-4">
      <button type="button" onClick={voltar} className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
        ← Voltar para a lista
      </button>
      {erro && (
        <p className="text-sm text-red-600" role="alert">
          {erro}
        </p>
      )}
      {!ficha && !erro && <p className="text-sm text-slate-500">Carregando ficha...</p>}
      {ficha && (
        <>
          <div>
            <h2 className="text-lg font-semibold">{ficha.aluno.name}</h2>
            <p className="text-sm text-slate-500">
              {ficha.aluno.turma ?? "Sem turma"} · Ano letivo {ficha.anoLetivo} · {ROTULO_ETAPA[ficha.etapa]}
            </p>
          </div>
          <ChecklistDocumentos alunoId={alunoId} ano={ficha.anoLetivo} itens={ficha.documentos} temResponsavel={ficha.responsaveis.length > 0} />
          <Consentimentos alunoId={alunoId} ficha={ficha} recarregar={carregar} />
        </>
      )}
    </div>
  );
}

function ChecklistDocumentos({
  alunoId,
  ano,
  itens: iniciais,
  temResponsavel,
}: {
  alunoId: string;
  ano: number;
  itens: ItemChecklist[];
  temResponsavel: boolean;
}) {
  const [itens, setItens] = useState(iniciais);
  const [salvando, setSalvando] = useState<TipoDocumento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pendentes = itens.filter((i) => !i.voluntario && !i.recebido).length;

  async function salvar(tipo: TipoDocumento, mudanca: { recebido?: boolean; prazo?: string | null; observacao?: string | null }) {
    setSalvando(tipo);
    setErro(null);
    try {
      const { documento } = await apiJson<{ documento: ItemChecklist }>(`/api/fichas-matricula/${alunoId}/documentos`, {
        method: "PUT",
        body: JSON.stringify({ anoLetivo: ano, tipo, ...mudanca }),
      });
      setItens((atual) => atual.map((i) => (i.tipo === tipo ? documento : i)));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setSalvando(null);
    }
  }

  return (
    <section aria-labelledby="ficha-docs-titulo" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="ficha-docs-titulo" className="font-semibold">
          Documentos
        </h3>
        <span className="text-xs text-slate-500" aria-live="polite">
          {pendentes === 0 ? "Todos os documentos exigidos foram entregues." : `${pendentes} pendente(s)`}
        </span>
      </div>
      {erro && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {erro}
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {itens.map((item) => {
          const idBase = `doc-${item.tipo}`;
          return (
            <li key={item.tipo} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label htmlFor={`${idBase}-recebido`} className="flex items-center gap-2 text-sm font-medium">
                  <input
                    id={`${idBase}-recebido`}
                    type="checkbox"
                    checked={item.recebido}
                    disabled={salvando === item.tipo}
                    onChange={(e) => salvar(item.tipo, { recebido: e.target.checked })}
                    className="h-5 w-5"
                  />
                  {item.rotulo}
                </label>
                <span className="flex flex-wrap gap-1 text-xs">
                  {item.voluntario && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Voluntário · só a direção</span>}
                  {item.recebido && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Entregue em {dataBR(item.recebidoEm)}</span>}
                  {item.atrasado && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Prazo vencido</span>}
                </span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr]">
                <div>
                  <label htmlFor={`${idBase}-prazo`} className="mb-1 block text-xs text-slate-500">
                    Prazo de entrega
                  </label>
                  <input
                    id={`${idBase}-prazo`}
                    type="date"
                    defaultValue={paraInputData(item.prazo)}
                    disabled={salvando === item.tipo}
                    onBlur={(e) => {
                      if (e.target.value !== paraInputData(item.prazo)) salvar(item.tipo, { prazo: e.target.value || null });
                    }}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor={`${idBase}-obs`} className="mb-1 block text-xs text-slate-500">
                    Observação
                  </label>
                  <input
                    id={`${idBase}-obs`}
                    type="text"
                    maxLength={500}
                    defaultValue={item.observacao ?? ""}
                    disabled={salvando === item.tipo}
                    onBlur={(e) => {
                      const valor = e.target.value.trim();
                      if (valor !== (item.observacao ?? "")) salvar(item.tipo, { observacao: valor || null });
                    }}
                    placeholder={item.voluntario ? "Sem detalhes clínicos: só o necessário para o atendimento" : "Ex.: entregue cópia, falta autenticar"}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {pendentes > 0 && (
        // A chave muda quando a equipe marca um documento: a prévia fecha e é montada de novo.
        <AvisoFamilia
          key={itens.map((i) => `${i.tipo}:${i.recebido}`).join(",")}
          alunoId={alunoId}
          ano={ano}
          temResponsavel={temResponsavel}
        />
      )}
    </section>
  );
}

interface MensagemAviso {
  titulo: string;
  texto: string;
  whatsapp: string;
}

/** Aviso dos documentos que faltam: prévia, cópia para o WhatsApp e envio no app (sempre pela equipe). */
function AvisoFamilia({ alunoId, ano, temResponsavel }: { alunoId: string; ano: number; temResponsavel: boolean }) {
  const [mensagem, setMensagem] = useState<MensagemAviso | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function chamar(enviar: boolean) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await apiJson<{ mensagem: MensagemAviso; responsaveis: number; responsaveisComApp?: number; enviados?: number }>(
        `/api/fichas-matricula/${alunoId}/aviso`,
        { method: "POST", body: JSON.stringify({ anoLetivo: ano, enviar }) },
      );
      setMensagem(r.mensagem);
      if (enviar) {
        setStatus(
          r.responsaveisComApp
            ? `Notificação enviada a ${r.responsaveisComApp} de ${r.responsaveis} responsável(is) com o app. Para quem não tem o app, copie a mensagem para o WhatsApp.`
            : "Nenhum responsável tem notificação ativa no app. Copie a mensagem e envie pelo WhatsApp.",
        );
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível montar o aviso");
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    if (!mensagem) return;
    try {
      await navigator.clipboard.writeText(mensagem.whatsapp);
      setStatus("Mensagem copiada. Cole no WhatsApp da família.");
    } catch {
      setErro("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  const botao =
    "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
      <p className="font-medium">Avisar a família dos documentos que faltam</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        Nada é enviado automaticamente. Veja a mensagem antes; ela lista só os documentos não marcados como entregues.
      </p>
      {erro && (
        <p className="mt-2 text-red-600" role="alert">
          {erro}
        </p>
      )}
      {!mensagem ? (
        <button type="button" onClick={() => chamar(false)} disabled={ocupado} className={`mt-2 ${botao}`}>
          Ver mensagem
        </button>
      ) : (
        <>
          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-white p-2 font-sans text-sm dark:bg-slate-900">{mensagem.whatsapp}</pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={copiar} className={botao}>
              Copiar para o WhatsApp
            </button>
            {temResponsavel && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  if (confirm("Enviar a notificação no app para os responsáveis deste aluno?")) chamar(true);
                }}
                className={botao}
              >
                Enviar notificação no app
              </button>
            )}
          </div>
        </>
      )}
      {status && (
        <p className="mt-2 text-xs text-slate-700 dark:text-slate-300" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}

function Consentimentos({ alunoId, ficha, recarregar }: { alunoId: string; ficha: Ficha; recarregar: () => void }) {
  const [finalidade, setFinalidade] = useState<Finalidade>("DADOS_DA_CRIANCA");
  const [versaoTexto, setVersaoTexto] = useState("");
  const [responsavelId, setResponsavelId] = useState(ficha.responsaveis[0]?.id ?? "outro");
  const [nomeOutro, setNomeOutro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const ativoPor = (f: Finalidade) => ficha.consentimentos.find((c) => c.finalidade === f && !c.revogadoEm) ?? null;
  const ultimoRevogado = (f: Finalidade) => ficha.consentimentos.find((c) => c.finalidade === f && c.revogadoEm) ?? null;

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await apiJson(`/api/fichas-matricula/${alunoId}/consentimentos`, {
        method: "POST",
        body: JSON.stringify({
          finalidade,
          versaoTexto,
          ...(responsavelId === "outro" ? { consentidoPorNome: nomeOutro } : { consentidoPorId: responsavelId }),
        }),
      });
      setVersaoTexto("");
      setNomeOutro("");
      recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível registrar");
    } finally {
      setEnviando(false);
    }
  }

  async function revogar(c: Consentimento) {
    if (!confirm(`Revogar o consentimento de "${ROTULO_FINALIDADE[c.finalidade]}"? O registro fica guardado no histórico.`)) return;
    setErro(null);
    try {
      await apiJson(`/api/fichas-matricula/${alunoId}/consentimentos/${c.id}`, { method: "DELETE" });
      recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível revogar");
    }
  }

  return (
    <section aria-labelledby="ficha-lgpd-titulo" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 id="ficha-lgpd-titulo" className="font-semibold">
        Consentimentos LGPD
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Cada finalidade tem seu consentimento. Revogar não apaga: o histórico mostra quando e por quem foi dado e retirado.
      </p>
      {erro && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {erro}
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {FINALIDADES.map((f) => {
          const ativo = ativoPor(f);
          const revogado = ultimoRevogado(f);
          return (
            <li key={f} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="min-w-0">
                <p className="font-medium">{ROTULO_FINALIDADE[f]}</p>
                <p className="text-xs text-slate-500">
                  {ativo
                    ? `✅ Consentido por ${ativo.consentidoPorNome} em ${dataBR(ativo.consentidoEm)} · versão ${ativo.versaoTexto}`
                    : revogado
                      ? `Revogado em ${dataBR(revogado.revogadoEm)} · sem consentimento ativo`
                      : "Sem consentimento registrado"}
                </p>
              </div>
              {ativo && (
                <button type="button" onClick={() => revogar(ativo)} className="text-xs font-medium text-red-700 hover:underline">
                  Revogar
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={registrar} className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
        <p className="text-sm font-medium">Registrar consentimento</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="lgpd-finalidade" className="mb-1 block text-xs font-medium">
              Finalidade
            </label>
            <select
              id="lgpd-finalidade"
              value={finalidade}
              onChange={(e) => setFinalidade(e.target.value as Finalidade)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {FINALIDADES.map((f) => (
                <option key={f} value={f}>
                  {ROTULO_FINALIDADE[f]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="lgpd-versao" className="mb-1 block text-xs font-medium">
              Versão do termo
            </label>
            <input
              id="lgpd-versao"
              required
              maxLength={40}
              value={versaoTexto}
              onChange={(e) => setVersaoTexto(e.target.value)}
              placeholder="Ex.: 2027-v1"
              className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label htmlFor="lgpd-quem" className="mb-1 block text-xs font-medium">
              Quem consentiu
            </label>
            <select
              id="lgpd-quem"
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {ficha.responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.relation ? ` (${r.relation})` : ""}
                </option>
              ))}
              <option value="outro">Outra pessoa (sem cadastro)</option>
            </select>
          </div>
          {responsavelId === "outro" && (
            <div>
              <label htmlFor="lgpd-nome" className="mb-1 block text-xs font-medium">
                Nome de quem consentiu
              </label>
              <input
                id="lgpd-nome"
                required
                minLength={3}
                maxLength={120}
                value={nomeOutro}
                onChange={(e) => setNomeOutro(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          )}
        </div>
        {ativoPor(finalidade) && (
          <p className="text-xs text-amber-800">O consentimento atual desta finalidade será encerrado e substituído por este.</p>
        )}
        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {enviando ? "Registrando..." : "Registrar consentimento"}
        </button>
      </form>

      {ficha.consentimentos.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setMostrarHistorico((v) => !v)}
            aria-expanded={mostrarHistorico}
            className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            {mostrarHistorico ? "Esconder histórico" : `Ver histórico (${ficha.consentimentos.length})`}
          </button>
          {mostrarHistorico && (
            <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              {ficha.consentimentos.map((c) => (
                <li key={c.id}>
                  {dataBR(c.consentidoEm)} · {ROTULO_FINALIDADE[c.finalidade]} · versão {c.versaoTexto} · {c.consentidoPorNome}
                  {c.revogadoEm ? ` · revogado em ${dataBR(c.revogadoEm)}` : " · ativo"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
