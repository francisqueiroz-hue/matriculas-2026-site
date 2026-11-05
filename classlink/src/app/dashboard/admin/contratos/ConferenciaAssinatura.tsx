"use client";

import { useState } from "react";
import { apiJson } from "@/lib/api-client";
import { LINK_VALIDAR_ITI, formatarDataHora } from "@/lib/contratos";
import { PdfErro, obterPdf, salvarArquivo } from "@/lib/pdf-client";

interface Assinatura {
  signatario: string | null;
  cpfMascarado: string | null;
  emissor: string | null;
  emissorGovBr: boolean;
  dataAssinatura: string | null;
  integridade: "INTEGRA" | "ALTERADA" | "NAO_CONFERIDA";
  detalhe: string | null;
  cobreArquivoInteiro: boolean;
  certificadoNoPrazo: boolean | null;
  responsavelCadastrado: string | null;
}

interface Resultado {
  assinaturas: Assinatura[];
  carimbosDeTempo: number;
  conteudoDepoisDaUltima: boolean;
}

interface Props {
  contratoId: string;
  arquivoId: string;
  /** Rota autenticada do PDF assinado. */
  urlPdf: string;
  nomePdf: string;
  metodoGovBr: boolean;
  classeBotao: string;
}

/**
 * "Conferir assinatura": lê o PDF assinado no próprio app e mostra quem assinou e se o arquivo
 * está íntegro. Para a validação oficial, abre o validador do ITI e já baixa o PDF para enviar lá
 * (o site do ITI não aceita receber o arquivo por link).
 */
export function ConferenciaAssinatura({ contratoId, arquivoId, urlPdf, nomePdf, metodoGovBr, classeBotao }: Props) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<{ arquivoId: string; dados: Resultado } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoIti, setAvisoIti] = useState<string | null>(null);
  const dados = resultado?.arquivoId === arquivoId ? resultado.dados : null;

  async function conferir() {
    setAberto(true);
    if (dados) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await apiJson<Resultado>(`/api/admin/contratos/${contratoId}/assinatura?arquivoId=${encodeURIComponent(arquivoId)}`);
      setResultado({ arquivoId, dados: r });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível conferir a assinatura.");
    } finally {
      setCarregando(false);
    }
  }

  async function validarNoIti() {
    // A aba precisa abrir no mesmo toque (senão o navegador bloqueia); o PDF baixa em seguida.
    window.open(LINK_VALIDAR_ITI, "_blank", "noopener,noreferrer");
    setAvisoIti("Baixando o PDF…");
    try {
      salvarArquivo(await obterPdf(urlPdf, nomePdf));
      setAvisoIti(
        `O PDF "${nomePdf}" foi salvo na pasta de downloads. No site do ITI que abriu ao lado, clique em "Escolher arquivo", selecione esse PDF e confirme. O relatório oficial mostra se a assinatura é aprovada.`,
      );
    } catch (e) {
      setAvisoIti(null);
      setErro(e instanceof PdfErro ? e.message : "Não foi possível baixar o PDF para o validador.");
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={aberto ? () => setAberto(false) : conferir} className={classeBotao} aria-expanded={aberto}>
          {aberto ? "Fechar conferência" : "Conferir assinatura"}
        </button>
        <button type="button" onClick={validarNoIti} className={classeBotao}>
          Validar no ITI (baixa o PDF) ↗
        </button>
      </div>

      {avisoIti && (
        <p role="status" className="mt-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
          {avisoIti}
        </p>
      )}

      {aberto && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-sm" aria-live="polite">
          {carregando && <p className="text-slate-600">Lendo a assinatura do PDF…</p>}
          {erro && (
            <p role="alert" className="text-red-800">
              {erro}
            </p>
          )}
          {dados && <Detalhes dados={dados} metodoGovBr={metodoGovBr} />}
        </div>
      )}
    </div>
  );
}

function Detalhes({ dados, metodoGovBr }: { dados: Resultado; metodoGovBr: boolean }) {
  if (dados.assinaturas.length === 0) {
    return metodoGovBr ? (
      <div role="alert" className="text-amber-900">
        <p className="font-semibold">Nenhuma assinatura digital encontrada neste PDF.</p>
        <p className="mt-1">
          A família marcou &quot;gov.br&quot;, mas o arquivo enviado não tem assinatura digital (pode ser o contrato sem assinar, uma
          foto ou uma impressão em PDF). Se for o caso, devolva pedindo o arquivo que o Assinador gov.br gera depois de assinar.
        </p>
      </div>
    ) : (
      <p className="text-slate-700">
        Sem assinatura digital: é o esperado para contrato assinado à mão. Confira a assinatura olhando o PDF (&quot;Ver assinado&quot;).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Pré-conferência feita pelo app: lê o certificado e confere se o PDF não foi alterado depois de assinado. A validação
        oficial (cadeia gov.br/ICP-Brasil e revogação do certificado) é a do botão &quot;Validar no ITI&quot;.
      </p>
      <ul className="space-y-2">
        {dados.assinaturas.map((a, i) => (
          <li key={i} className="rounded-md bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">
              {a.integridade === "INTEGRA" ? "✓ " : a.integridade === "ALTERADA" ? "✗ " : "? "}
              Assinado por {a.signatario ?? "(nome não informado no certificado)"}
              {a.cpfMascarado && <span className="font-normal text-slate-600"> · CPF {a.cpfMascarado}</span>}
            </p>
            <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-slate-700 sm:grid-cols-[auto_1fr]">
              <dt className="text-slate-500">Data</dt>
              <dd>{a.dataAssinatura ? formatarDataHora(a.dataAssinatura) : "não informada"}</dd>
              <dt className="text-slate-500">Emissor</dt>
              <dd>
                {a.emissor ?? "não informado"}
                {a.emissorGovBr && " (gov.br)"}
              </dd>
              <dt className="text-slate-500">Documento</dt>
              <dd className={a.integridade === "INTEGRA" ? "text-emerald-800" : a.integridade === "ALTERADA" ? "text-red-800" : "text-amber-900"}>
                {a.integridade === "INTEGRA"
                  ? "Íntegro: não foi alterado depois desta assinatura"
                  : a.integridade === "ALTERADA"
                    ? (a.detalhe ?? "Alterado depois da assinatura")
                    : (a.detalhe ?? "Não foi possível conferir")}
              </dd>
              <dt className="text-slate-500">Responsável</dt>
              <dd className={a.responsavelCadastrado ? "text-emerald-800" : "text-amber-900"}>
                {a.responsavelCadastrado
                  ? `Nome confere com ${a.responsavelCadastrado}, responsável cadastrado`
                  : "Nome diferente dos responsáveis cadastrados do aluno: confira"}
              </dd>
              {a.certificadoNoPrazo === false && (
                <>
                  <dt className="text-slate-500">Certificado</dt>
                  <dd className="text-red-800">Fora do prazo de validade na data da assinatura</dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>
      {dados.conteudoDepoisDaUltima && (
        <p className="text-amber-900">
          Há conteúdo acrescentado ao PDF depois da última assinatura. Pode ser só informação de validação, mas confira no ITI.
        </p>
      )}
    </div>
  );
}
