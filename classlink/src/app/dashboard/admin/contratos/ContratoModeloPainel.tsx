"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";
import {
  calcularValores,
  etapaPelaTurma,
  formatarDinheiro,
  type ConfigContrato,
  type Etapa,
  type PeriodoChave,
} from "@/lib/contrato-modelo/tipos";

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50";
const btnPrimario = `${btn} bg-indigo-600 text-white hover:bg-indigo-700`;
const btnSecundario = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
const campo = "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";
const rotulo = "mb-1 block text-xs font-medium text-slate-600";

interface AlunoOpcao {
  id: string;
  name: string;
  class: { id: string; name: string };
}

interface RespostaConfig {
  anoLetivo: number;
  config: ConfigContrato;
  salva?: boolean;
  atualizadaEm?: string | null;
  pendencias: string[];
}

const CAMPOS_ESCOLA: { k: keyof ConfigContrato["escola"]; label: string; dica?: string }[] = [
  { k: "endereco", label: "Endereço da escola", dica: "Confira: o contrato original tinha duas grafias diferentes." },
  { k: "cep", label: "CEP" },
  { k: "telefones", label: "Telefones" },
  { k: "email", label: "E-mail da secretaria" },
  { k: "representanteLegal", label: "Representante legal da escola (nome e cargo)" },
  { k: "canalPrivacidade", label: "Canal de privacidade (e-mail do encarregado/LGPD)" },
  { k: "avisoPrivacidade", label: "Onde fica o aviso de privacidade (link ou local)" },
  { k: "portalAluno", label: "Portal do aluno" },
  { k: "siteEscola", label: "Site da escola" },
  { k: "redesSociais", label: "Redes sociais (perfis)" },
];

/** "3.150,00" / "3150,5" / "3150.50" / "3150" → número. Ponto só é decimal se não houver vírgula e vier com 1–2 casas no fim. */
function numero(v: string) {
  const t = v.trim().replace(/[^\d.,]/g, "");
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /\.\d{1,2}$/.test(t) ? t.replace(/\.(?=.*\.)/g, "") : t.replace(/\./g, "");
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

/** Campo de dinheiro que aceita "1.234,56" ou "1234.56" sem brigar com o cursor. */
function CampoValor({ id, label, valor, onChange }: { id: string; label: string; valor: number; onChange: (n: number) => void }) {
  const [texto, setTexto] = useState(valor ? formatarDinheiro(valor) : "");
  return (
    <div>
      <label htmlFor={id} className={rotulo}>
        {label}
      </label>
      <div className="flex items-center rounded-md border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-indigo-500">
        <span className="pl-3 text-sm text-slate-500">R$</span>
        <input
          id={id}
          inputMode="decimal"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            onChange(numero(e.target.value));
          }}
          onBlur={() => setTexto(valor ? formatarDinheiro(valor) : "")}
          className="min-h-11 w-full rounded-md px-2 text-sm outline-none"
          placeholder="0,00"
        />
      </div>
    </div>
  );
}

function Configuracao({ ano, onPendencias }: { ano: number; onPendencias: (p: string[]) => void }) {
  const [cfg, setCfg] = useState<ConfigContrato | null>(null);
  const [info, setInfo] = useState<{ salva: boolean; atualizadaEm: string | null }>({ salva: false, atualizadaEm: null });
  const [pendencias, setPendencias] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [versao, setVersao] = useState(0); // remonta os campos de valor ao recarregar

  useEffect(() => {
    apiJson<RespostaConfig>(`/api/admin/contratos/config?ano=${ano}`)
      .then((r) => {
        setCfg(r.config);
        setPendencias(r.pendencias);
        onPendencias(r.pendencias);
        setInfo({ salva: Boolean(r.salva), atualizadaEm: r.atualizadaEm ?? null });
        setVersao((v) => v + 1);
      })
      .catch((e) => setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao carregar a configuração" }));
  }, [ano, onPendencias]);

  if (!cfg) return msg ? <p role="alert" className="text-sm text-red-700">{msg.texto}</p> : <p className="text-sm text-slate-500">Carregando configuração…</p>;

  const setEscola = (k: keyof ConfigContrato["escola"], v: string) => setCfg({ ...cfg, escola: { ...cfg.escola, [k]: v } });
  const setPeriodo = (i: number, patch: Partial<ConfigContrato["periodos"][number]>) =>
    setCfg({ ...cfg, periodos: cfg.periodos.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    try {
      const r = await apiJson<RespostaConfig>(`/api/admin/contratos/config?ano=${ano}`, { method: "PUT", body: JSON.stringify(cfg) });
      setCfg(r.config);
      setPendencias(r.pendencias);
      onPendencias(r.pendencias);
      setInfo({ salva: true, atualizadaEm: new Date().toISOString() });
      setMsg({ tipo: "ok", texto: r.pendencias.length ? "Salvo. Ainda faltam itens para liberar o envio." : "Salvo. Configuração completa — envio liberado." });
    } catch (err) {
      setMsg({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <p className="text-sm text-slate-600">
        Estes valores entram no contrato de cada aluno no momento do envio. Mudar depois não altera contratos já enviados.
        {info.salva && info.atualizadaEm && ` Última alteração: ${new Date(info.atualizadaEm).toLocaleString("pt-BR")}.`}
      </p>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Valores por período</legend>
        {cfg.periodos.map((p, i) => {
          const v = calcularValores({ parcelaBruta: p.parcelaBruta, parcelaLiquida: p.parcelaLiquida, quantidade: cfg.parcelas.quantidade });
          return (
            <div key={`${p.chave}-${versao}`} className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 font-medium text-slate-900">{p.nome}</p>
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                <div>
                  <label htmlFor={`hor-${p.chave}`} className={rotulo}>
                    Horário
                  </label>
                  <input id={`hor-${p.chave}`} value={p.horario} onChange={(e) => setPeriodo(i, { horario: e.target.value })} className={campo} />
                </div>
                <CampoValor id={`bruta-${p.chave}`} label="Parcela cheia" valor={p.parcelaBruta} onChange={(n) => setPeriodo(i, { parcelaBruta: n })} />
                <CampoValor id={`liq-${p.chave}`} label="Parcela até o vencimento" valor={p.parcelaLiquida} onChange={(n) => setPeriodo(i, { parcelaLiquida: n })} />
              </div>
              {p.parcelaBruta > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Anuidade R$ {formatarDinheiro(v.anuidade)} · desconto de pontualidade R$ {formatarDinheiro(v.descontoValor)} ({formatarDinheiro(v.descontoPct)}%)
                </p>
              )}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Parcelas</legend>
        <div>
          <label htmlFor="parc-qtd" className={rotulo}>
            Número de parcelas
          </label>
          <input
            id="parc-qtd"
            type="number"
            min={1}
            max={24}
            value={cfg.parcelas.quantidade}
            onChange={(e) => setCfg({ ...cfg, parcelas: { ...cfg.parcelas, quantidade: Number(e.target.value) } })}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="parc-dia" className={rotulo}>
            Dia do vencimento
          </label>
          <input
            id="parc-dia"
            type="number"
            min={1}
            max={31}
            value={cfg.parcelas.vencimentoDia}
            onChange={(e) => setCfg({ ...cfg, parcelas: { ...cfg.parcelas, vencimentoDia: Number(e.target.value) } })}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="parc-pu" className={rotulo}>
            Primeiro e último vencimento
          </label>
          <input
            id="parc-pu"
            placeholder="10/01/2027 a 10/12/2027"
            value={cfg.parcelas.primeiroUltimo}
            onChange={(e) => setCfg({ ...cfg, parcelas: { ...cfg.parcelas, primeiroUltimo: e.target.value } })}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="parc-per" className={rotulo}>
            Período da anuidade
          </label>
          <input
            id="parc-per"
            placeholder="janeiro a dezembro de 2027"
            value={cfg.parcelas.periodoAnuidade}
            onChange={(e) => setCfg({ ...cfg, parcelas: { ...cfg.parcelas, periodoAnuidade: e.target.value } })}
            className={campo}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Hora excedente (Cláusula 7ª)</legend>
        <CampoValor
          key={`he-${versao}`}
          id="he-valor"
          label="Valor"
          valor={cfg.horaExcedente.valor}
          onChange={(n) => setCfg({ ...cfg, horaExcedente: { ...cfg.horaExcedente, valor: n } })}
        />
        <div>
          <label htmlFor="he-unid" className={rotulo}>
            Cobrado por
          </label>
          <input
            id="he-unid"
            placeholder="hora"
            value={cfg.horaExcedente.unidade}
            onChange={(e) => setCfg({ ...cfg, horaExcedente: { ...cfg.horaExcedente, unidade: e.target.value } })}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="he-frac" className={rotulo}>
            Fracionamento
          </label>
          <input
            id="he-frac"
            placeholder="frações de 30 minutos"
            value={cfg.horaExcedente.fracionamento}
            onChange={(e) => setCfg({ ...cfg, horaExcedente: { ...cfg.horaExcedente, fracionamento: e.target.value } })}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="he-tol" className={rotulo}>
            Tolerância
          </label>
          <input
            id="he-tol"
            placeholder="15 minutos"
            value={cfg.horaExcedente.tolerancia}
            onChange={(e) => setCfg({ ...cfg, horaExcedente: { ...cfg.horaExcedente, tolerancia: e.target.value } })}
            className={campo}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Dados da escola no contrato</legend>
        {CAMPOS_ESCOLA.map((f) => (
          <div key={f.k} className={f.k === "endereco" ? "sm:col-span-2" : ""}>
            <label htmlFor={`esc-${f.k}`} className={rotulo}>
              {f.label}
            </label>
            <input id={`esc-${f.k}`} value={cfg.escola[f.k]} onChange={(e) => setEscola(f.k, e.target.value)} className={campo} />
            {f.dica && <p className="mt-1 text-xs text-amber-800">{f.dica}</p>}
          </div>
        ))}
      </fieldset>

      {pendencias.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Falta preencher para liberar o envio ({pendencias.length}):</p>
          <p className="mt-1">{pendencias.join(" · ")}</p>
        </div>
      )}
      {msg && (
        <p role={msg.tipo === "erro" ? "alert" : "status"} className={`text-sm ${msg.tipo === "erro" ? "text-red-700" : "font-medium text-emerald-800"}`}>
          {msg.texto}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={salvando} className={btnPrimario}>
          {salvando ? "Salvando…" : "Salvar configuração"}
        </button>
        <a href={`/api/admin/contratos/previa?ano=${ano}`} target="_blank" rel="noopener noreferrer" className={btnSecundario}>
          Ver prévia do contrato (PDF) ↗
        </a>
      </div>
      <p className="text-xs text-slate-500">A prévia usa a configuração salva e dados de exemplo; campos vazios aparecem como linha em branco.</p>
    </form>
  );
}

interface Linha {
  marcado: boolean;
  periodo: PeriodoChave;
  etapa: Etapa;
}

function EnvioLote({
  ano,
  bloqueado,
  jaTemModelo,
  onEnviado,
}: {
  ano: number;
  bloqueado: boolean;
  jaTemModelo: Set<string>;
  onEnviado: () => void;
}) {
  const [alunos, setAlunos] = useState<AlunoOpcao[]>([]);
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [periodoPadrao, setPeriodoPadrao] = useState<PeriodoChave>("INTEGRAL");
  const [titulo, setTitulo] = useState(`Contrato de prestação de serviços educacionais ${ano}`);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ criados: { nome: string }[]; ignorados: { nome: string; motivo: string }[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ students: AlunoOpcao[] }>("/api/admin/students")
      .then((d) => setAlunos(d.students))
      .catch(() => setAlunos([]));
  }, []);

  const linha = useCallback(
    (a: AlunoOpcao): Linha => linhas[a.id] ?? { marcado: false, periodo: periodoPadrao, etapa: etapaPelaTurma(a.class.name) },
    [linhas, periodoPadrao],
  );
  const atualizar = (a: AlunoOpcao, patch: Partial<Linha>) => setLinhas((l) => ({ ...l, [a.id]: { ...linha(a), ...patch } }));

  const porTurma = useMemo(() => {
    const grupos = new Map<string, AlunoOpcao[]>();
    for (const a of alunos) grupos.set(a.class.name, [...(grupos.get(a.class.name) ?? []), a]);
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [alunos]);

  const disponiveis = alunos.filter((a) => !jaTemModelo.has(a.id));
  const marcados = disponiveis.filter((a) => linha(a).marcado);

  function marcarTurma(lista: AlunoOpcao[], valor: boolean) {
    setLinhas((l) => {
      const novo = { ...l };
      for (const a of lista) if (!jaTemModelo.has(a.id)) novo[a.id] = { ...linha(a), marcado: valor };
      return novo;
    });
  }

  async function enviar() {
    if (marcados.length === 0) return;
    if (!confirm(`Enviar o contrato ${ano} para ${marcados.length} aluno(s)? As famílias recebem aviso no app.`)) return;
    setEnviando(true);
    setErro(null);
    setResultado(null);
    try {
      const r = await apiJson<{ criados: { nome: string }[]; ignorados: { nome: string; motivo: string }[] }>("/api/admin/contratos/lote", {
        method: "POST",
        body: JSON.stringify({
          anoLetivo: ano,
          titulo,
          itens: marcados.map((a) => ({ studentId: a.id, periodo: linha(a).periodo, etapa: linha(a).etapa })),
        }),
      });
      setResultado(r);
      setLinhas({});
      onEnviado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  if (ano !== 2027) return <p className="text-sm text-slate-600">O modelo guardado no app é o contrato 2027. Para outros anos, use o envio de PDF abaixo.</p>;

  return (
    <div className="space-y-3">
      {bloqueado && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Complete e salve a configuração (aba ao lado) para liberar o envio.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div>
          <label htmlFor="lote-titulo" className={rotulo}>
            Título (aparece para a família)
          </label>
          <input id="lote-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={150} className={campo} />
        </div>
        <div>
          <label htmlFor="lote-periodo" className={rotulo}>
            Período padrão dos novos marcados
          </label>
          <select id="lote-periodo" value={periodoPadrao} onChange={(e) => setPeriodoPadrao(e.target.value as PeriodoChave)} className={campo}>
            <option value="INTEGRAL">Integral</option>
            <option value="SEMI_INTEGRAL">Semi-integral</option>
            <option value="PARCIAL">Parcial</option>
            <option value="ESCOLAR">Escolar</option>
          </select>
        </div>
      </div>

      {alunos.length === 0 && <p className="text-sm text-slate-500">Carregando alunos…</p>}
      <div className="space-y-3">
        {porTurma.map(([turma, lista]) => {
          const livres = lista.filter((a) => !jaTemModelo.has(a.id));
          const todos = livres.length > 0 && livres.every((a) => linha(a).marcado);
          return (
            <div key={turma} className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <span className="text-sm font-semibold text-slate-800">{turma}</span>
                {livres.length > 0 && (
                  <button type="button" onClick={() => marcarTurma(lista, !todos)} className="min-h-11 px-2 text-sm text-indigo-700 hover:underline">
                    {todos ? "Desmarcar turma" : "Marcar turma"}
                  </button>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {lista.map((a) => {
                  const l = linha(a);
                  const enviado = jaTemModelo.has(a.id);
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <label className="flex min-h-11 flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={enviado}
                          checked={!enviado && l.marcado}
                          onChange={(e) => atualizar(a, { marcado: e.target.checked })}
                          className="h-5 w-5"
                        />
                        <span className={enviado ? "text-slate-400" : "text-slate-900"}>
                          {a.name}
                          {enviado && " — já enviado"}
                        </span>
                      </label>
                      {!enviado && l.marcado && (
                        <>
                          <label className="sr-only" htmlFor={`per-${a.id}`}>
                            Período de {a.name}
                          </label>
                          <select
                            id={`per-${a.id}`}
                            value={l.periodo}
                            onChange={(e) => atualizar(a, { periodo: e.target.value as PeriodoChave })}
                            className="min-h-11 rounded-md border border-slate-300 bg-white px-2 text-sm"
                          >
                            <option value="INTEGRAL">Integral</option>
                            <option value="SEMI_INTEGRAL">Semi-integral</option>
                            <option value="PARCIAL">Parcial</option>
                            <option value="ESCOLAR">Escolar</option>
                          </select>
                          <label className="sr-only" htmlFor={`eta-${a.id}`}>
                            Etapa de {a.name}
                          </label>
                          <select
                            id={`eta-${a.id}`}
                            value={l.etapa}
                            onChange={(e) => atualizar(a, { etapa: e.target.value as Etapa })}
                            className="min-h-11 rounded-md border border-slate-300 bg-white px-2 text-sm"
                          >
                            <option value="EI">Ed. Infantil</option>
                            <option value="EF1">Fundamental I</option>
                          </select>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {erro && (
        <p role="alert" className="text-sm text-red-700">
          {erro}
        </p>
      )}
      {resultado && (
        <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-semibold">✓ {resultado.criados.length} contrato(s) enviado(s). As famílias foram avisadas no app.</p>
          {resultado.ignorados.length > 0 && (
            <p className="mt-1 text-amber-900">
              Não enviados: {resultado.ignorados.map((i) => `${i.nome} (${i.motivo})`).join("; ")}
            </p>
          )}
        </div>
      )}
      <button type="button" disabled={bloqueado || enviando || marcados.length === 0 || titulo.trim().length < 3} onClick={enviar} className={btnPrimario}>
        {enviando ? "Enviando…" : `Enviar para ${marcados.length} aluno(s)`}
      </button>
    </div>
  );
}

/**
 * Contrato guardado no app: a direção configura valores uma vez e envia para os alunos;
 * cada família confere os próprios dados e o app gera o PDF preenchido para assinar.
 */
export function ContratoModeloPainel({ ano, jaTemModelo, onEnviado }: { ano: number; jaTemModelo: Set<string>; onEnviado: () => void }) {
  const [aba, setAba] = useState<"enviar" | "config">("enviar");
  const [pendencias, setPendencias] = useState<string[] | null>(null);
  const aoCarregarPendencias = useCallback((p: string[]) => setPendencias(p), []);

  // Carrega as pendências mesmo com a aba "Enviar" aberta, para saber se o envio está liberado.
  useEffect(() => {
    if (ano !== 2027) return;
    apiJson<RespostaConfig>(`/api/admin/contratos/config?ano=${ano}`)
      .then((r) => setPendencias(r.pendencias))
      .catch(() => setPendencias(null));
  }, [ano]);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="font-semibold text-slate-900">Contrato {ano} guardado no app</h2>
        <p className="text-sm text-slate-600">
          A família confere os próprios dados (CPF, RG, endereço, autorização de imagem) e o app gera o contrato preenchido para assinar pelo gov.br ou à mão.
        </p>
      </div>
      {ano === 2027 && (
        <div role="tablist" aria-label="Contrato do app" className="flex gap-2">
          {(
            [
              ["enviar", "Enviar para alunos"],
              ["config", `Valores e dados${pendencias && pendencias.length ? ` (${pendencias.length} pendentes)` : ""}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={aba === k}
              onClick={() => setAba(k)}
              className={`${btn} ${aba === k ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {aba === "config" && ano === 2027 ? (
        <Configuracao ano={ano} onPendencias={aoCarregarPendencias} />
      ) : (
        <EnvioLote key={ano} ano={ano} bloqueado={pendencias === null || pendencias.length > 0} jaTemModelo={jaTemModelo} onEnviado={onEnviado} />
      )}
    </section>
  );
}
