"use client";

import { useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";
import { formatarDataHora } from "@/lib/datas";
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
}
interface Familia {
  id: string;
  nome: string;
  canal: "push" | "whatsapp" | "nenhum";
  pendencias: PendenciaFamilia[];
}
interface Dados {
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

function dataCurta(valor: string | null): string {
  return valor ? new Date(valor).toLocaleDateString("pt-BR") : "—";
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
      setAviso(proxima.ativos ? "Salvo. Os lembretes saem todo dia por volta das 10h (exceto domingo)." : "Salvo. O envio automático está desligado.");
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
                pagou depois dessa baixa. Mantenha as baixas em dia (de preferência antes das 10h, quando os lembretes saem) ou desmarque
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
              Mensalidade: só o 1º responsável vinculado recebe, e só até 45 dias após o vencimento. Antes de ligar, confira se os pagamentos recebidos fora do banco já foram baixados em Financeiro.
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
    <AdminGuard>
      <Conteudo />
    </AdminGuard>
  );
}
