"use client";

import { useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";

interface Summary {
  mesReferencia: string;
  total: number;
  resumo: Record<string, number>;
  valorPago: number;
  valorPendente: number;
}

interface Config {
  diaVencimentoPadrao: number | null;
  diaEmissaoBoletos: number | null;
}

interface ResultadoGeracao {
  mesReferencia: string;
  criados: number;
  emitidos: number;
  erros: number;
  ignorados: number;
}

interface Cobranca {
  id: string;
  aluno: string;
  responsavel: string | null;
  mesReferencia: string;
  valor: number;
  vencimento: string;
  vencido: boolean;
  whatsapp: string | null;
}

interface Pago {
  id: string;
  aluno: string;
  responsavel: string | null;
  mesReferencia: string;
  valor: number;
  pagoEm: string | null;
  desfazivel: boolean;
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function FinanceiroContent() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [dataPgto, setDataPgto] = useState(hojeISO());
  const [salvandoBaixa, setSalvandoBaixa] = useState<string | null>(null);
  const [erroBaixa, setErroBaixa] = useState<string | null>(null);
  const [cobrancas, setCobrancas] = useState<Cobranca[] | null>(null);
  const [erroCobrancas, setErroCobrancas] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [diaVencimento, setDiaVencimento] = useState("");
  const [diaEmissao, setDiaEmissao] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [resultadoGeracao, setResultadoGeracao] = useState<ResultadoGeracao | null>(null);
  const [erroGeracao, setErroGeracao] = useState<string | null>(null);

  function load() {
    apiJson<{ itens: Cobranca[]; pagos: Pago[] }>("/api/admin/billing/cobrancas")
      .then((d) => {
        setCobrancas(d.itens);
        setPagos(d.pagos);
      })
      .catch(() => setErroCobrancas(true));
    apiJson<Summary>("/api/admin/billing/summary").then(setSummary);
    apiJson<Config>("/api/admin/billing/config").then((data) => {
      setDiaVencimento(data.diaVencimentoPadrao ? String(data.diaVencimentoPadrao) : "");
      setDiaEmissao(data.diaEmissaoBoletos ? String(data.diaEmissaoBoletos) : "");
    });
  }

  useEffect(load, []);

  async function baixar(id: string, acao: "PAGO" | "DESFAZER") {
    setSalvandoBaixa(id);
    setErroBaixa(null);
    try {
      await apiJson(`/api/admin/billing/boletos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(acao === "PAGO" ? { acao, dataPagamento: dataPgto } : { acao }),
      });
      setConfirmando(null);
      load();
    } catch (err) {
      setErroBaixa(err instanceof Error ? err.message : "Não foi possível atualizar o boleto");
    } finally {
      setSalvandoBaixa(null);
    }
  }

  async function gerarBoletosDoMes() {
    setGerando(true);
    setErroGeracao(null);
    setResultadoGeracao(null);
    try {
      const resultado = await apiJson<ResultadoGeracao>("/api/admin/billing/gerar-mes", { method: "POST" });
      setResultadoGeracao(resultado);
      load();
    } catch (err) {
      setErroGeracao(err instanceof Error ? err.message : "Erro ao gerar boletos do mês");
    } finally {
      setGerando(false);
    }
  }

  async function salvarConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await apiJson("/api/admin/billing/config", {
        method: "PUT",
        body: JSON.stringify({
          diaVencimentoPadrao: diaVencimento ? Number(diaVencimento) : undefined,
          diaEmissaoBoletos: diaEmissao ? Number(diaEmissao) : undefined,
        }),
      });
      setFeedback("Configuração salva.");
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Financeiro</h1>

      <form onSubmit={salvarConfig} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-500">Configuração de cobrança</h2>
        <div className="flex flex-wrap gap-4">
          <label className="text-sm">
            Dia de vencimento padrão
            <input
              type="number"
              min={1}
              max={28}
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
              className="mt-1 block w-24 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="text-sm">
            Dia de emissão dos boletos
            <input
              type="number"
              min={1}
              max={28}
              value={diaEmissao}
              onChange={(e) => setDiaEmissao(e.target.value)}
              className="mt-1 block w-24 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        </div>
        {feedback && <p className="text-xs text-green-600">{feedback}</p>}
        <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "Salvando..." : "Salvar configuração"}
        </button>
        <p className="text-xs text-slate-500">
          O valor de mensalidade de cada aluno é definido na tela de Alunos. A geração mensal roda automaticamente via job
          agendado (veja README), no dia de emissão configurado acima.
        </p>
      </form>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-500">Gerar valores deste mês agora</h2>
        <p className="text-xs text-slate-500">
          Cria já o registro de valor e vencimento (mês corrente) para os alunos com mensalidade configurada que ainda não
          têm um boleto neste mês, sem esperar o dia de emissão automática. Se o Banco Inter ainda não estiver configurado,
          o responsável já passa a ver o valor em “Financeiro” — só a emissão real (boleto/PIX pagável) fica pendente.
        </p>
        <button
          type="button"
          onClick={gerarBoletosDoMes}
          disabled={gerando}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {gerando ? "Gerando..." : "Gerar valores deste mês"}
        </button>
        {erroGeracao && <p className="text-xs text-red-600">{erroGeracao}</p>}
        {resultadoGeracao && (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {resultadoGeracao.mesReferencia}: {resultadoGeracao.criados} valor(es) criado(s)
            {resultadoGeracao.emitidos > 0 && `, ${resultadoGeracao.emitidos} emitido(s) de verdade no Banco Inter`}
            {resultadoGeracao.erros > 0 && `, ${resultadoGeracao.erros} com erro na emissão`}
            {resultadoGeracao.ignorados > 0 && ` (${resultadoGeracao.ignorados} já existiam)`}.
          </p>
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-500">Cobrar por WhatsApp (boletos em aberto)</h2>
        <p className="text-xs text-slate-500">
          Abre o WhatsApp com a mensagem pronta para o responsável financeiro; você revisa e envia. Nada é enviado sozinho.
        </p>
        {erroCobrancas && <p className="text-xs text-red-600">Não foi possível carregar os boletos em aberto.</p>}
        {cobrancas === null && !erroCobrancas && <p className="text-xs text-slate-500">Carregando...</p>}
        {cobrancas?.length === 0 && <p className="text-xs text-slate-500">Nenhum boleto em aberto.</p>}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {cobrancas?.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {c.aluno} — {c.mesReferencia}
                </p>
                <p className="text-xs text-slate-500">
                  {c.responsavel ?? "Sem responsável"} · R$ {c.valor.toFixed(2)} · vence {new Date(c.vencimento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  {c.vencido && <span className="ml-1 font-semibold text-red-600">· vencido</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {confirmando === c.id ? (
                  <>
                    <label className="text-xs text-slate-500">
                      Pago em{" "}
                      <input
                        type="date"
                        value={dataPgto}
                        max={hojeISO()}
                        onChange={(e) => setDataPgto(e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={salvandoBaixa === c.id || !dataPgto}
                      onClick={() => baixar(c.id, "PAGO")}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {salvandoBaixa === c.id ? "Salvando..." : "Confirmar pagamento"}
                    </button>
                    <button type="button" onClick={() => setConfirmando(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700">
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    {c.whatsapp ? (
                      <a href={c.whatsapp} target="_blank" rel="noreferrer" className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                        Cobrar por WhatsApp
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">Sem telefone válido</span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmando(c.id);
                        setDataPgto(hojeISO());
                        setErroBaixa(null);
                      }}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Marcar como pago
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {erroBaixa && <p className="text-xs text-red-600">{erroBaixa}</p>}
        {pagos.length > 0 && (
          <details className="pt-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500">Marcados como pagos (últimos {pagos.length}) — desfazer se foi engano</summary>
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {pagos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium">
                      {p.aluno} — {p.mesReferencia}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.responsavel ?? "Sem responsável"} · R$ {p.valor.toFixed(2)}
                      {p.pagoEm && ` · pago em ${new Date(p.pagoEm).toLocaleDateString("pt-BR")}`}
                    </p>
                  </div>
                  {p.desfazivel ? (
                    <button
                      type="button"
                      disabled={salvandoBaixa === p.id}
                      onClick={() => baixar(p.id, "DESFAZER")}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Desfazer
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Confirmado pelo banco</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {summary && (
        <div>
          <h2 className="mb-2 font-semibold">Mês corrente ({summary.mesReferencia})</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500">Pagos</p>
              <p className="text-2xl font-bold text-green-600">{summary.resumo.PAGO ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500">Pendentes</p>
              <p className="text-2xl font-bold text-amber-600">{summary.resumo.PENDENTE ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500">Vencidos</p>
              <p className="text-2xl font-bold text-red-600">{summary.resumo.VENCIDO ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500">Falha na emissão</p>
              <p className="text-2xl font-bold text-slate-500">{summary.resumo.ERRO ?? 0}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Recebido: <strong>R$ {summary.valorPago.toFixed(2)}</strong> · Pendente: <strong>R$ {summary.valorPendente.toFixed(2)}</strong>
          </p>
        </div>
      )}
    </div>
  );
}

export default function FinanceiroAdminPage() {
  return (
    <AdminGuard>
      <FinanceiroContent />
    </AdminGuard>
  );
}
