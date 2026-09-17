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

function FinanceiroContent() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [diaVencimento, setDiaVencimento] = useState("");
  const [diaEmissao, setDiaEmissao] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [resultadoGeracao, setResultadoGeracao] = useState<ResultadoGeracao | null>(null);
  const [erroGeracao, setErroGeracao] = useState<string | null>(null);

  function load() {
    apiJson<Summary>("/api/admin/billing/summary").then(setSummary);
    apiJson<Config>("/api/admin/billing/config").then((data) => {
      setDiaVencimento(data.diaVencimentoPadrao ? String(data.diaVencimentoPadrao) : "");
      setDiaEmissao(data.diaEmissaoBoletos ? String(data.diaEmissaoBoletos) : "");
    });
  }

  useEffect(load, []);

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
