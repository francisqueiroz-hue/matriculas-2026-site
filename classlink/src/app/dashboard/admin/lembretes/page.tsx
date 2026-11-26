"use client";

import { useEffect, useState } from "react";
import { DirecaoGuard } from "@/components/DirecaoGuard";
import { apiJson } from "@/lib/api-client";
import { formatarDataHora } from "@/lib/datas";
import { ROTULO_ENTREGA, type SituacaoEntrega } from "@/lib/lembrete-entrega";
import { listaAlunos, preencherModelo, type SituacaoAvisoTurmas } from "@/lib/aviso-turmas";
import { LIMITES, ROTULO_TIPO_LEMBRETE, TIPOS_LEMBRETE, type ConfigLembretes, type LembreteTipo, type SituacaoPendencia } from "@/lib/lembretes";

interface PendenciaFamilia {
  tipo: LembreteTipo;
  aluno: string;
  descricao: string;
  diasPendente: number;
  envios: number;
  ultimoEnvioEm: string | null;
  situacao: SituacaoPendencia;
  proximoEm: string | null;
  entrega: SituacaoEntrega | null;
}
interface Familia {
  id: string;
  nome: string;
  canal: "push" | "whatsapp" | "nenhum";
  pendencias: PendenciaFamilia[];
}
interface AvisoTurmasDados {
  ativo: boolean;
  titulo: string | null;
  texto: string | null;
  padrao: { titulo: string; texto: string };
  limites: { titulo: number; texto: number };
  ano: number;
  familias: { responsavelId: string; nome: string; alunos: string[]; envios: number; situacao: SituacaoAvisoTurmas; proximoEm: string | null }[];
  ultimos: Record<string, { automatico: boolean; titulo: string; texto: string; canal: string | null; status: string | null; falha: string | null; enviadoEm: string }>;
}
interface Dados {
  avisoTurmas: AvisoTurmasDados;
  entregas: { total: number; pessoas: number; motivo: string | null; cobrancaPendente: boolean; ultimas: { nome: string; codigo: number | null; em: string }[] };
  config: ConfigLembretes;
  domingo: boolean;
  totalPendencias: number;
  familiasNoProximoEnvio: number;
  familias: Familia[];
  escola: {
    contratos: { id: string; status: string; anoLetivo: number; updatedAt: string; student: { name: string } }[];
    solicitacoes: { id: string; tipo: string; alunoNome: string; responsavelNome: string; createdAt: string }[];
  };
}

const ROTULO_SITUACAO: Record<SituacaoPendencia, string> = {
  AGUARDANDO_PRAZO: "Aguardando os dias iniciais",
  PRONTA: "Entra no próximo envio",
  AGUARDANDO_INTERVALO: "Família lembrada há pouco",
  LIMITE_ATINGIDO: "Limite atingido: cobrar pessoalmente",
};
const COR_SITUACAO: Record<SituacaoPendencia, string> = {
  AGUARDANDO_PRAZO: "bg-slate-100 text-slate-700",
  PRONTA: "bg-sky-100 text-sky-900",
  AGUARDANDO_INTERVALO: "bg-emerald-100 text-emerald-900",
  LIMITE_ATINGIDO: "bg-amber-100 text-amber-900",
};
const ROTULO_CANAL = { push: "Notificação no app", whatsapp: "WhatsApp da escola", nenhum: "Sem canal (não instalou o app nem tem WhatsApp)" };

const COR_ENTREGA: Record<SituacaoEntrega["status"], string> = {
  ENVIADO: "text-slate-600",
  ENTREGUE: "text-emerald-700",
  LIDO: "text-emerald-800 font-semibold",
  FALHOU: "text-red-700 font-semibold",
};

function Entrega({ e }: { e: SituacaoEntrega }) {
  const quando = e.em ? ` em ${formatarDataHora(e.em)}` : "";
  if (e.semConfirmacao) {
    return (
      <span className="block text-xs font-semibold text-amber-800">
        ⚠ WhatsApp enviado{quando} e sem confirmação de entrega há mais de 24 h: confirme com a família por outro meio.
      </span>
    );
  }
  return (
    <span className={`block text-xs ${COR_ENTREGA[e.status]}`}>
      {e.status === "FALHOU" ? "⚠ " : e.status === "ENVIADO" ? "" : "✓ "}
      {ROTULO_ENTREGA[e.status]}
      {quando}
      {e.status === "FALHOU" && e.motivo ? `: ${e.motivo} Sai de novo no próximo envio.` : ""}
    </span>
  );
}

function dataCurta(valor: string | null): string {
  return valor ? new Date(valor).toLocaleDateString("pt-BR") : "—";
}

const ROTULO_SITUACAO_AVISO: Record<SituacaoAvisoTurmas, string> = {
  EM_LEMBRETES: "Ainda nos lembretes",
  PRONTO: "Sai no próximo envio",
  AGUARDANDO_INTERVALO: "Aguardando o intervalo",
  ENVIADO: "Aviso enviado",
};
const COR_SITUACAO_AVISO: Record<SituacaoAvisoTurmas, string> = {
  EM_LEMBRETES: "bg-slate-100 text-slate-600",
  PRONTO: "bg-sky-100 text-sky-900",
  AGUARDANDO_INTERVALO: "bg-slate-100 text-slate-700",
  ENVIADO: "bg-emerald-100 text-emerald-900",
};

function ResumoUltimoAviso({ u }: { u: AvisoTurmasDados["ultimos"][string] | undefined }) {
  if (!u) return null;
  const canal = u.canal === "whatsapp" ? "WhatsApp" : u.canal === "push" ? "notificação no app" : "enviando";
  const status = u.status === "FALHOU" ? ` · ⚠ não entregue${u.falha ? `: ${u.falha}` : ""}` : u.status === "LIDO" ? " · lido" : u.status === "ENTREGUE" ? " · entregue" : "";
  return (
    <span className={`block text-xs ${u.status === "FALHOU" ? "text-red-700" : "text-slate-500"}`}>
      {u.automatico ? "Automático" : "Enviado pela direção"} em {formatarDataHora(u.enviadoEm)} ({canal}){status}
    </span>
  );
}

/** Envio manual (caso excepcional): texto salvo ou ajustado só para esta família. */
function EnvioManualAviso({
  familia,
  aviso,
  onFechar,
  onEnviado,
}: {
  familia: { id: string; nome: string; alunos: string[] };
  aviso: AvisoTurmasDados;
  onFechar: () => void;
  onEnviado: (msg: string) => void;
}) {
  // Já enviado: abre com o texto que a família recebeu, para editar e reenviar. Senão, o texto salvo.
  const ultimo = aviso.ultimos[familia.id];
  const [titulo, setTitulo] = useState(ultimo?.titulo ?? aviso.titulo ?? aviso.padrao.titulo);
  const [texto, setTexto] = useState(ultimo?.texto ?? aviso.texto ?? aviso.padrao.texto);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const jaRecebeu = Boolean(ultimo && ultimo.status !== "FALHOU");
  const previa = preencherModelo(texto, { alunos: familia.alunos, ano: aviso.ano });

  async function enviar() {
    if (jaRecebeu && !window.confirm(`${familia.nome} já recebeu o aviso. Enviar de novo?`)) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await apiJson<{ canal: string }>("/api/admin/aviso-turmas/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavelId: familia.id, titulo, texto, repetir: jaRecebeu }),
      });
      onEnviado(`Aviso enviado a ${familia.nome} (${r.canal === "whatsapp" ? "WhatsApp" : "notificação no app"}).`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
      <p className="font-medium">Enviar aviso a {familia.nome}</p>
      <p className="text-xs text-slate-600">
        {ultimo ? "Abaixo, a mensagem que a família recebeu. Edite e reenvie se precisar. " : ""}O texto vale só para este envio; o texto salvo para o envio automático não muda.
      </p>
      <input
        aria-label="Título do aviso para esta família"
        value={titulo}
        maxLength={aviso.limites.titulo}
        onChange={(e) => setTitulo(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5"
      />
      <textarea
        aria-label="Texto do aviso para esta família"
        value={texto}
        maxLength={aviso.limites.texto}
        rows={4}
        onChange={(e) => setTexto(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5"
      />
      <p className="text-xs text-slate-600">
        <strong>Como a família vai ler:</strong> {previa}
      </p>
      {erro && <p role="alert" className="text-xs text-red-700">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={enviando || !texto.trim() || !titulo.trim()} onClick={enviar} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
          {enviando ? "Enviando..." : jaRecebeu ? "Enviar de novo" : "Enviar agora"}
        </button>
        <button type="button" onClick={onFechar} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Configuração e acompanhamento do aviso único de definição das turmas. */
function SecaoAvisoTurmas({
  aviso,
  lembretesAtivos,
  lembretesMax,
  onMudou,
}: {
  aviso: AvisoTurmasDados;
  lembretesAtivos: boolean;
  lembretesMax: number;
  onMudou: () => void;
}) {
  const [ativo, setAtivo] = useState(aviso.ativo);
  const [titulo, setTitulo] = useState(aviso.titulo ?? aviso.padrao.titulo);
  const [texto, setTexto] = useState(aviso.texto ?? aviso.padrao.texto);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [abertoPara, setAbertoPara] = useState<string | null>(null);

  const exemplo = preencherModelo(texto, { alunos: ["Ana"], ano: aviso.ano });

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      // Igual ao padrão = guarda vazio (se o padrão mudar numa versão futura, acompanha).
      const t = titulo.trim() === aviso.padrao.titulo ? null : titulo;
      const x = texto.trim() === aviso.padrao.texto ? null : texto;
      await apiJson("/api/admin/aviso-turmas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo, titulo: t, texto: x }) });
      setMsg(ativo ? "Salvo. O aviso sai uma única vez para cada família que chegar ao limite de lembretes." : "Salvo. O aviso automático está desligado.");
      onMudou();
    } catch {
      setMsg("Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-violet-200 bg-white p-4">
      <div>
        <h2 className="font-semibold">Aviso de definição das turmas</h2>
        <p className="text-xs text-slate-500">
          A lista abaixo mostra os alunos com contrato não assinado. Quando o contrato chega ao máximo de lembretes e continua sem assinatura, o ClassLink manda uma
          única mensagem avisando que a escola está definindo as turmas do próximo ano. Não repete. A direção pode enviar à mão, editar e reenviar a qualquer momento. Pelo mesmo caminho dos lembretes (app; sem app, WhatsApp), depois do intervalo e nunca aos domingos.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        Enviar o aviso automaticamente
      </label>
      {ativo && !lembretesAtivos && (
        <p role="note" className="text-xs text-amber-800">O aviso automático só sai com os lembretes ligados (Configuração acima).</p>
      )}
      <label className="block text-sm">
        <span className="font-medium">Título</span>
        <input value={titulo} maxLength={aviso.limites.titulo} onChange={(e) => setTitulo(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Texto</span>
        <textarea value={texto} maxLength={aviso.limites.texto} rows={4} onChange={(e) => setTexto(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5" />
        <span className="mt-1 block text-xs text-slate-500">
          {texto.length}/{aviso.limites.texto} caracteres. Use {"{alunos}"} para o primeiro nome dos alunos e {"{ano}"} para {aviso.ano}.
        </span>
      </label>
      <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
        <strong>Exemplo:</strong> {preencherModelo(titulo, { alunos: ["Ana"], ano: aviso.ano })} — {exemplo}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={salvando || !texto.trim() || !titulo.trim()} onClick={salvar} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {salvando ? "Salvando..." : "Salvar aviso"}
        </button>
        <button
          type="button"
          onClick={() => {
            setTitulo(aviso.padrao.titulo);
            setTexto(aviso.padrao.texto);
          }}
          className="text-xs text-indigo-700 underline"
        >
          Voltar ao texto padrão
        </button>
        {msg && <p role="status" className="text-sm text-slate-600">{msg}</p>}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Contratos não assinados ({aviso.familias.length} {aviso.familias.length === 1 ? "família" : "famílias"})</h3>
        {aviso.familias.length === 0 && <p className="text-xs text-slate-500">Nenhum contrato aguardando assinatura.</p>}
        <ul className="space-y-1.5">
          {aviso.familias.map((f) => (
            <li key={f.responsavelId} className="rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{f.nome}</span> · {listaAlunos(f.alunos)}
                  <span className="block text-xs text-slate-500">
                    {f.envios} de {lembretesMax} lembretes do contrato
                  </span>
                  <ResumoUltimoAviso u={aviso.ultimos[f.responsavelId]} />
                  {f.situacao === "AGUARDANDO_INTERVALO" && f.proximoEm && (
                    <span className="block text-xs text-slate-500">por volta de {dataCurta(f.proximoEm)}{aviso.ativo ? "" : " (se ligar)"}</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${COR_SITUACAO_AVISO[f.situacao]}`}>{ROTULO_SITUACAO_AVISO[f.situacao]}</span>
                  <button type="button" onClick={() => setAbertoPara(abertoPara === f.responsavelId ? null : f.responsavelId)} className="text-xs text-indigo-700 underline">
                    {aviso.ultimos[f.responsavelId] ? "Ver, editar e reenviar" : "Enviar à mão"}
                  </button>
                </span>
              </div>
              {abertoPara === f.responsavelId && (
                <EnvioManualAviso
                  familia={{ id: f.responsavelId, nome: f.nome, alunos: f.alunos }}
                  aviso={aviso}
                  onFechar={() => setAbertoPara(null)}
                  onEnviado={(m) => {
                    setAbertoPara(null);
                    setMsg(m);
                    onMudou();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Numero({ campo, valor, rotulo, ajuda, onChange }: { campo: keyof typeof LIMITES; valor: number; rotulo: string; ajuda: string; onChange: (v: number) => void }) {
  const { min, max } = LIMITES[campo];
  return (
    <label className="block text-sm">
      <span className="font-medium">{rotulo}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5"
      />
      <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>
    </label>
  );
}

function Conteudo() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [config, setConfig] = useState<ConfigLembretes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function carregar() {
    apiJson<Dados>("/api/admin/lembretes")
      .then((d) => {
        setDados(d);
        setConfig(d.config);
      })
      .catch(() => setErro("Não foi possível carregar os lembretes. Atualize a página para tentar de novo."));
  }
  useEffect(carregar, []);

  async function salvar(proxima: ConfigLembretes) {
    setSalvando(true);
    setAviso(null);
    try {
      await apiJson("/api/admin/lembretes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proxima) });
      setAviso(proxima.ativos ? "Salvo. Os lembretes saem todo dia depois das 12h (exceto domingo)." : "Salvo. O envio automático está desligado.");
      carregar();
    } catch {
      setAviso("Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  function alternarTipo(tipo: LembreteTipo) {
    if (!config) return;
    const tipos = config.tipos.includes(tipo) ? config.tipos.filter((t) => t !== tipo) : [...config.tipos, tipo];
    setConfig({ ...config, tipos });
  }

  const pendenciasEscola = dados ? dados.escola.contratos.length + dados.escola.solicitacoes.length : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Lembretes de pendências</h1>
        <p className="text-sm text-slate-500">
          O ClassLink lembra as famílias do que ainda está pendente: uma única mensagem por família, com tudo junto, e para sozinho quando a pendência é resolvida.
        </p>
      </div>

      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-slate-500">Carregando...</p>}

      {dados && config && (
        <>
          {dados.entregas.total > 0 && (
            <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-semibold">
                O WhatsApp não entregou {dados.entregas.total} {dados.entregas.total === 1 ? "mensagem" : "mensagens"} nas últimas 48 horas
                {dados.entregas.pessoas > 0 && ` (${dados.entregas.pessoas} ${dados.entregas.pessoas === 1 ? "pessoa" : "pessoas"})`}.
              </p>
              {dados.entregas.motivo && <p className="mt-1">{dados.entregas.motivo}</p>}
              <p className="mt-1">
                Esses lembretes não foram gastos: o ClassLink tenta de novo no próximo envio. Enquanto isso, avise as famílias abaixo por telefone ou pelo app.
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {dados.entregas.ultimas.map((u, i) => (
                  <li key={i}>
                    {u.nome} — {formatarDataHora(new Date(u.em))}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className={`rounded-xl border p-3 ${dados.config.ativos ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
              <p className="text-lg font-bold">{dados.config.ativos ? "Ligado" : "Desligado"}</p>
              <p className="text-xs text-slate-600">envio automático às famílias</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-2xl font-bold">{dados.totalPendencias}</p>
              <p className="text-xs text-slate-500">pendências das famílias</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-2xl font-bold">{dados.familiasNoProximoEnvio}</p>
              <p className="text-xs text-slate-500">
                famílias no próximo envio{dados.config.ativos ? "" : " (se ligar)"}
                {dados.domingo ? " · hoje é domingo, sai amanhã" : ""}
              </p>
            </div>
          </div>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Configuração</h2>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={config.ativos} onChange={(e) => setConfig({ ...config, ativos: e.target.checked })} />
              Enviar lembretes automáticos às famílias
            </label>
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">O que lembrar</legend>
              {TIPOS_LEMBRETE.map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input type="checkbox" checked={config.tipos.includes(t)} onChange={() => alternarTipo(t)} />
                  {ROTULO_TIPO_LEMBRETE[t]}
                </label>
              ))}
            </fieldset>
            {config.tipos.includes("BOLETO") && (
              <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>Atenção — mensalidades:</strong> a baixa dos boletos pagos é feita à mão em Financeiro. O lembrete só sabe que a família
                pagou depois dessa baixa. Mantenha as baixas em dia (até o meio-dia, antes de os lembretes saírem) ou desmarque
                &quot;{ROTULO_TIPO_LEMBRETE.BOLETO}&quot; para não lembrar quem já pagou.
              </p>
            )}
            <div className="flex flex-wrap gap-4">
              <Numero campo="diasInicio" rotulo="1º lembrete após (dias)" ajuda="dias corridos de pendência" valor={config.diasInicio} onChange={(v) => setConfig({ ...config, diasInicio: v })} />
              <Numero campo="intervaloDias" rotulo="Intervalo (dias)" ajuda="entre duas mensagens à mesma família" valor={config.intervaloDias} onChange={(v) => setConfig({ ...config, intervaloDias: v })} />
              <Numero campo="maxEnvios" rotulo="Máximo por pendência" ajuda="depois disso, só aparece aqui" valor={config.maxEnvios} onChange={(v) => setConfig({ ...config, maxEnvios: v })} />
            </div>
            <p className="text-xs text-slate-500">
              Canal: notificação no app; quem não tem o app com notificação ativa recebe pelo WhatsApp da escola. Sem envio aos domingos. A mensagem não informa valores.
              Mensalidade: lembrete na véspera do vencimento (com a data) e, se não for paga, no dia seguinte ao vencimento e depois a cada intervalo, até o máximo. Só o 1º responsável vinculado recebe, e só até 45 dias após o vencimento. Antes de ligar, confira se os pagamentos recebidos fora do banco já foram baixados em Financeiro.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={salvando}
                onClick={() => salvar(config)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
              {aviso && <p role="status" className="text-sm text-slate-600">{aviso}</p>}
            </div>
          </section>

          <SecaoAvisoTurmas key={JSON.stringify(dados.avisoTurmas.ultimos) + dados.avisoTurmas.ativo} aviso={dados.avisoTurmas} lembretesAtivos={dados.config.ativos} lembretesMax={dados.config.maxEnvios} onMudou={carregar} />

          {pendenciasEscola > 0 && (
            <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <h2 className="font-semibold text-amber-900">Dependem da escola ({pendenciasEscola})</h2>
              <ul className="space-y-1 text-sm text-amber-900">
                {dados.escola.contratos.map((c) => (
                  <li key={c.id}>
                    Contrato {c.anoLetivo} de {c.student.name}: {c.status === "EM_CONFERENCIA" ? "conferir o PDF assinado" : "receber a via original"} (desde {dataCurta(c.updatedAt)})
                  </li>
                ))}
                {dados.escola.solicitacoes.map((s) => (
                  <li key={s.id}>
                    {s.tipo === "REMATRICULA" ? "Rematrícula" : "Pré-matrícula"} de {s.alunoNome} ({s.responsavelNome}) sem atendimento desde {dataCurta(s.createdAt)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="font-semibold">Pendências das famílias</h2>
            {dados.familias.length === 0 && <p className="text-sm text-slate-500">Nenhuma pendência nos tipos marcados.</p>}
            <ul className="space-y-2">
              {dados.familias.map((f) => (
                <li key={f.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{f.nome}</p>
                    <span className={`text-xs ${f.canal === "nenhum" ? "text-red-700" : "text-slate-500"}`}>{ROTULO_CANAL[f.canal]}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {f.pendencias.map((p, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                        <span>
                          {p.descricao.charAt(0).toUpperCase() + p.descricao.slice(1)}
                          <span className="block text-xs text-slate-500">
                            pendente há {p.diasPendente} {p.diasPendente === 1 ? "dia" : "dias"} · {p.envios} de {dados.config.maxEnvios} lembretes
                            {p.ultimoEnvioEm ? ` · último em ${formatarDataHora(p.ultimoEnvioEm)}` : ""}
                            {p.proximoEm && p.situacao !== "PRONTA" ? ` · próximo por volta de ${dataCurta(p.proximoEm)}` : ""}
                          </span>
                          {p.entrega && <Entrega e={p.entrega} />}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${COR_SITUACAO[p.situacao]}`}>{ROTULO_SITUACAO[p.situacao]}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default function LembretesPage() {
  return (
    <DirecaoGuard>
      <Conteudo />
    </DirecaoGuard>
  );
}
