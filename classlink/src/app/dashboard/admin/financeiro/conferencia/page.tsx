"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";
import { celulaCsv } from "@/lib/conferencia-baixas";

interface Alerta {
  codigo: string;
  texto: string;
}

interface Linha {
  id: string;
  aluno: string;
  turma: string;
  responsavel: string | null;
  mesReferencia: string;
  vencimento: string;
  valor: number;
  valorPago: number | null;
  mensalidadeCadastro: number | null;
  diferenca: number;
  pagoEm: string | null;
  manual: boolean;
  baixaPor: string | null;
  baixaEm: string | null;
  correcoes: number;
  ultimaCorrecao: { por: string; em: string; motivo: string | null } | null;
  alertas: Alerta[];
}

interface Resposta {
  de: string;
  ate: string;
  itens: Linha[];
  totais: { quantidade: number; valorBoletos: number; valorRecebido: number; comAlerta: number; semValorInformado: number };
  truncado: boolean;
}

const btn = "rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-60";
const btnPrimario = `${btn} bg-indigo-600 text-white hover:bg-indigo-700`;
const btnSecundario = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200`;
const campo = "mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800";

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Vencimento e data de pagamento são gravados ao meio-dia UTC: exibir em UTC mantém o dia.
const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const competencia = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const paraCampo = (v: number) => v.toFixed(2).replace(".", ",");

function Correcao({ linha, onFechar, onSalvo }: { linha: Linha; onFechar: () => void; onSalvo: () => void }) {
  const [valor, setValor] = useState(paraCampo(linha.valor));
  const [valorPago, setValorPago] = useState(paraCampo(linha.valorPago ?? linha.valor));
  const [data, setData] = useState(linha.pagoEm ? linha.pagoEm.slice(0, 10) : hojeISO());
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await apiJson(`/api/admin/billing/boletos/${linha.id}`, {
        method: "PATCH",
        body: JSON.stringify({ acao: "CORRIGIR", valor, valorPago, dataPagamento: data, motivo }),
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a correção");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="mt-2 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40">
      <p className="text-xs font-semibold">
        Corrigir baixa de {linha.aluno} — {competencia(linha.mesReferencia)}
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs">
          Valor do boleto (R$)
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${campo} w-28`} required />
        </label>
        <label className="text-xs">
          Valor recebido (R$)
          <input inputMode="decimal" value={valorPago} onChange={(e) => setValorPago(e.target.value)} className={`${campo} w-28`} required />
        </label>
        <label className="text-xs">
          Pago em
          <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} className={campo} required />
        </label>
      </div>
      <label className="block text-xs">
        Motivo da correção (fica no histórico)
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={300}
          minLength={3}
          required
          placeholder="Ex.: valor digitado errado; família pagou R$ 50 a menos"
          className={`${campo} w-full`}
        />
      </label>
      {linha.mensalidadeCadastro !== null && (
        <p className="text-xs text-slate-500">Mensalidade no cadastro do aluno: {reais(linha.mensalidadeCadastro)}.</p>
      )}
      {erro && <p className="text-xs text-red-600" role="alert">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className={btnPrimario}>
          {salvando ? "Salvando..." : "Salvar correção"}
        </button>
        <button type="button" onClick={onFechar} className={btnSecundario}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ConferenciaContent() {
  const [de, setDe] = useState(`${new Date().getFullYear()}-01`);
  const [ate, setAte] = useState(mesAtual());
  const [soAlertas, setSoAlertas] = useState(false);
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Sem setState síncrono aqui: o efeito só dispara a busca; os estados mudam na resposta.
  const carregar = useCallback(() => {
    apiJson<Resposta>(`/api/admin/billing/conferencia?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`)
      .then((d) => {
        setDados(d);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Não foi possível carregar"))
      .finally(() => setCarregando(false));
  }, [de, ate]);

  useEffect(carregar, [carregar]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return (dados?.itens ?? []).filter(
      (l) =>
        (!soAlertas || l.alertas.length > 0) &&
        (!termo || l.aluno.toLocaleLowerCase("pt-BR").includes(termo) || (l.responsavel ?? "").toLocaleLowerCase("pt-BR").includes(termo)),
    );
  }, [dados, soAlertas, busca]);

  async function desfazer(l: Linha) {
    if (!window.confirm(`Desfazer a baixa de ${l.aluno} (${competencia(l.mesReferencia)})? O boleto volta a ficar em aberto e entra de novo nos lembretes.`)) return;
    setDesfazendo(l.id);
    setAviso(null);
    try {
      await apiJson(`/api/admin/billing/boletos/${l.id}`, { method: "PATCH", body: JSON.stringify({ acao: "DESFAZER" }) });
      setAviso(`Baixa de ${l.aluno} desfeita. O boleto voltou para “em aberto”.`);
      carregar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Não foi possível desfazer");
    } finally {
      setDesfazendo(null);
    }
  }

  function baixarCsv() {
    const cab = [
      "Competência", "Aluno", "Turma", "Responsável", "Vencimento", "Valor do boleto", "Valor recebido",
      "Diferença", "Mensalidade no cadastro", "Pago em", "Baixa por", "Baixa lançada em", "Correções", "Alertas",
    ];
    const num = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));
    const corpo = linhas.map((l) => [
      competencia(l.mesReferencia),
      l.aluno,
      l.turma,
      l.responsavel ?? "",
      dia(l.vencimento),
      num(l.valor),
      l.valorPago === null ? "não informado" : num(l.valorPago),
      num(l.diferenca),
      num(l.mensalidadeCadastro),
      dia(l.pagoEm),
      l.baixaPor ?? "",
      l.baixaEm ? new Date(l.baixaEm).toLocaleString("pt-BR") : "",
      l.correcoes,
      l.alertas.map((a) => a.texto).join(" | "),
    ]);
    const csv = [cab, ...corpo].map((r) => r.map((c) => celulaCsv(c)).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `conferencia-boletos-pagos-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const t = dados?.totais;

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <Link href="/dashboard/admin/financeiro" className="text-xs text-indigo-600 hover:underline">
          ← Financeiro
        </Link>
        <h1 className="text-xl font-bold">Conferir boletos pagos</h1>
        <p className="text-sm text-slate-500">
          Todos os boletos marcados como pagos no período, com o valor do boleto, o valor recebido e o que merece conferência.
          Corrija aqui o valor ou a data de uma baixa lançada errada; cada correção fica registrada com quem fez, quando e o motivo.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-xs">
          De (competência)
          <input type="month" value={de} max={ate} onChange={(e) => {
              if (!e.target.value) return;
              setCarregando(true);
              setDe(e.target.value);
            }} className={campo} />
        </label>
        <label className="text-xs">
          Até
          <input type="month" value={ate} min={de} onChange={(e) => {
              if (!e.target.value) return;
              setCarregando(true);
              setAte(e.target.value);
            }} className={campo} />
        </label>
        <label className="text-xs">
          Buscar aluno ou responsável
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className={`${campo} w-56`} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={soAlertas} onChange={(e) => setSoAlertas(e.target.checked)} />
          Só os que precisam de conferência
        </label>
        <button type="button" onClick={baixarCsv} disabled={!linhas.length} className={`${btnSecundario} mb-1`}>
          Baixar planilha (CSV)
        </button>
      </div>

      {t && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500">Boletos pagos</p>
            <p className="text-xl font-bold">{t.quantidade}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500">Soma dos boletos</p>
            <p className="text-xl font-bold">{reais(t.valorBoletos)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500">Recebido</p>
            <p className="text-xl font-bold text-green-700 dark:text-green-400">{reais(t.valorRecebido)}</p>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="text-xs text-amber-800 dark:text-amber-300">Precisam de conferência</p>
            <p className="text-xl font-bold text-amber-800 dark:text-amber-300">{t.comAlerta}</p>
          </div>
        </div>
      )}
      {t && t.semValorInformado > 0 && (
        <p className="text-xs text-slate-500">
          {t.semValorInformado} baixa(s) foram lançadas antes de o app guardar o valor recebido: nelas o recebido é considerado
          igual ao valor do boleto. Se alguma família pagou valor diferente, use “Corrigir”.
        </p>
      )}
      {dados?.truncado && <p className="text-xs text-red-600">Período muito grande: mostrando só parte. Diminua o intervalo.</p>}
      {aviso && <p className="text-sm text-slate-700 dark:text-slate-200" role="status">{aviso}</p>}
      {erro && <p className="text-sm text-red-600" role="alert">{erro}</p>}
      {carregando && <p className="text-sm text-slate-500">Carregando...</p>}
      {!carregando && !erro && linhas.length === 0 && (
        <p className="text-sm text-slate-500">{soAlertas || busca ? "Nada encontrado com esses filtros." : "Nenhum boleto pago neste período."}</p>
      )}

      <ul className="space-y-2">
        {linhas.map((l) => (
          <li
            key={l.id}
            className={`rounded-xl border bg-white p-3 text-sm dark:bg-slate-900 ${
              l.alertas.length ? "border-amber-300 dark:border-amber-800" : "border-slate-200 dark:border-slate-800"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {l.aluno} <span className="font-normal text-slate-500">· {l.turma} · {competencia(l.mesReferencia)}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {l.responsavel ?? "Sem responsável"} · vence {dia(l.vencimento)} · pago em {dia(l.pagoEm)}
                  {l.baixaPor && ` · baixa por ${l.baixaPor}`}
                  {l.baixaEm && ` em ${new Date(l.baixaEm).toLocaleDateString("pt-BR")}`}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-x-4 text-right text-xs">
                <div>
                  <dt className="text-slate-500">Boleto</dt>
                  <dd className="font-semibold">{reais(l.valor)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Recebido</dt>
                  <dd className="font-semibold">{l.valorPago === null ? <span className="font-normal text-slate-400">não informado</span> : reais(l.valorPago)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Diferença</dt>
                  <dd className={`font-semibold ${l.diferenca < 0 ? "text-red-600" : l.diferenca > 0 ? "text-amber-700" : ""}`}>
                    {l.diferenca === 0 ? "—" : reais(l.diferenca)}
                  </dd>
                </div>
              </dl>
            </div>
            {l.alertas.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1">
                {l.alertas.map((a) => (
                  <li key={a.codigo} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                    {a.texto}
                  </li>
                ))}
              </ul>
            )}
            {l.ultimaCorrecao && (
              <p className="mt-1 text-xs text-slate-500">
                Corrigido {l.correcoes > 1 ? `${l.correcoes} vezes; a última` : ""} por {l.ultimaCorrecao.por} em{" "}
                {new Date(l.ultimaCorrecao.em).toLocaleDateString("pt-BR")}
                {l.ultimaCorrecao.motivo && `: “${l.ultimaCorrecao.motivo}”`}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {l.manual ? (
                <>
                  <button type="button" onClick={() => setCorrigindo(corrigindo === l.id ? null : l.id)} className={btnSecundario}>
                    Corrigir valor ou data
                  </button>
                  <button type="button" onClick={() => desfazer(l)} disabled={desfazendo === l.id} className={btnSecundario}>
                    {desfazendo === l.id ? "Desfazendo..." : "Não foi pago (desfazer)"}
                  </button>
                </>
              ) : (
                <span className="text-xs text-slate-400">Confirmado pelo banco: não se altera aqui</span>
              )}
            </div>
            {corrigindo === l.id && (
              <Correcao
                linha={l}
                onFechar={() => setCorrigindo(null)}
                onSalvo={() => {
                  setCorrigindo(null);
                  setAviso(`Correção de ${l.aluno} salva e registrada no histórico.`);
                  carregar();
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ConferenciaBaixasPage() {
  return (
    <AdminGuard>
      <ConferenciaContent />
    </AdminGuard>
  );
}
