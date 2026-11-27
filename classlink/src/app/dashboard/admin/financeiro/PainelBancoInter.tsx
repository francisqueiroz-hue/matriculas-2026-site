"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

interface EstadoInter {
  configurado: boolean;
  ambiente: "sandbox" | "producao";
  segredoDefinido: boolean;
  webhook: { cadastrado: boolean; endereco: string | null; apontaParaEsteApp: boolean } | null;
  erro?: string;
}

interface ResultadoEmissao {
  emitidos: number;
  erros: number;
  vencidos: number;
}

/**
 * Banco Inter na tela Financeiro (só direção): mostra se a integração está ligada, cadastra
 * o webhook de pagamento e emite no banco os boletos em aberto que ainda não foram emitidos.
 */
export function PainelBancoInter({ aoMudar }: { aoMudar: () => void }) {
  const [estado, setEstado] = useState<EstadoInter | null>(null);
  const [ocupado, setOcupado] = useState<null | "webhook" | "emitir">(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    return apiJson<EstadoInter>("/api/admin/billing/inter")
      .then(setEstado)
      .catch((err) => setErro(err instanceof Error ? err.message : "Não foi possível consultar o Banco Inter"));
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function agir(acao: "REGISTRAR_WEBHOOK" | "EMITIR_PENDENTES") {
    if (acao === "EMITIR_PENDENTES" && !window.confirm("Emitir no Banco Inter os boletos em aberto (vencimento de hoje em diante) que ainda não foram emitidos?")) return;
    setOcupado(acao === "REGISTRAR_WEBHOOK" ? "webhook" : "emitir");
    setErro(null);
    setMensagem(null);
    try {
      if (acao === "REGISTRAR_WEBHOOK") {
        await apiJson("/api/admin/billing/inter", { method: "POST", body: JSON.stringify({ acao }) });
        setMensagem("Webhook cadastrado no Banco Inter. Pagamentos passam a dar baixa sozinhos.");
        await carregar();
      } else {
        const r = await apiJson<ResultadoEmissao>("/api/admin/billing/inter", { method: "POST", body: JSON.stringify({ acao }) });
        setMensagem(
          `${r.emitidos} boleto(s) emitido(s) no Banco Inter` +
            (r.erros > 0 ? `, ${r.erros} com erro (veja o motivo na lista)` : "") +
            (r.vencidos > 0 ? `, ${r.vencidos} já vencido(s) não emitido(s)` : "") +
            ".",
        );
        aoMudar();
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao falar com o Banco Inter");
    } finally {
      setOcupado(null);
    }
  }

  const botao =
    "rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60";

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-500">Banco Inter (boleto com Pix)</h2>
      {!estado && !erro && <p className="text-xs text-slate-500">Consultando…</p>}
      {estado && !estado.configurado && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Desligado: as credenciais do Inter ainda não estão na Vercel. Os valores continuam visíveis às famílias e a baixa
          segue manual.
        </p>
      )}
      {estado?.configurado && (
        <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <li>
            Ambiente:{" "}
            <strong className={estado.ambiente === "producao" ? "text-green-700" : "text-amber-700"}>
              {estado.ambiente === "producao" ? "Produção (boletos reais)" : "Sandbox (teste, sem valor real)"}
            </strong>
          </li>
          <li>
            Webhook de pagamento:{" "}
            {estado.webhook?.apontaParaEsteApp ? (
              <strong className="text-green-700">cadastrado e apontando para este app</strong>
            ) : estado.webhook?.cadastrado ? (
              <strong className="text-amber-700">cadastrado em outro endereço ({estado.webhook.endereco ?? "?"})</strong>
            ) : estado.webhook ? (
              <strong className="text-amber-700">não cadastrado</strong>
            ) : (
              <span>não consultado</span>
            )}
          </li>
          {!estado.segredoDefinido && <li className="text-red-600">Falta BANCO_INTER_WEBHOOK_SECRET na Vercel.</li>}
          {estado.erro && <li className="text-red-600">Erro do Inter: {estado.erro}</li>}
        </ul>
      )}
      {estado?.configurado && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={botao} disabled={ocupado !== null || !estado.segredoDefinido} onClick={() => agir("REGISTRAR_WEBHOOK")}>
            {ocupado === "webhook" ? "Cadastrando..." : estado.webhook?.apontaParaEsteApp ? "Cadastrar webhook de novo" : "Cadastrar webhook"}
          </button>
          <button type="button" className={botao} disabled={ocupado !== null} onClick={() => agir("EMITIR_PENDENTES")}>
            {ocupado === "emitir" ? "Emitindo..." : "Emitir no Inter os boletos em aberto"}
          </button>
        </div>
      )}
      {mensagem && <p className="text-xs text-green-600">{mensagem}</p>}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
