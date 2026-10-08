// Regras do módulo de contratos de matrícula. Arquivo sem dependências de servidor:
// é usado tanto pelas rotas de API quanto pelas telas (validação antes do envio).

export type ContratoStatus = "AGUARDANDO_ASSINATURA" | "EM_CONFERENCIA" | "AGUARDANDO_ORIGINAL" | "COMPLETO" | "DEVOLVIDO";
export type ContratoMetodo = "GOVBR" | "MANUSCRITA";
export type ContratoAcao = "PREENCHER_DADOS" | "ENVIAR_ASSINADO" | "APROVAR" | "DEVOLVER" | "ORIGINAL_RECEBIDO";

/**
 * Limite de 4 MB por PDF: abaixo do teto de 4,5 MB por requisição das funções da Vercel
 * e mais que suficiente para um contrato assinado no gov.br (normalmente < 1 MB).
 */
export const CONTRATO_MAX_BYTES = 4 * 1024 * 1024;

/** Assinador gratuito do governo federal (assinatura eletrônica avançada, Lei 14.063/2020). */
export const LINK_ASSINADOR_GOVBR = "https://assinador.iti.br";
/** Verificador oficial do ITI: confere a assinatura gov.br de um PDF. */
export const LINK_VALIDAR_ITI = "https://validar.iti.gov.br";

export const STATUS_CONTRATO_LABEL: Record<ContratoStatus, string> = {
  AGUARDANDO_ASSINATURA: "Aguardando assinatura",
  EM_CONFERENCIA: "Em conferência",
  AGUARDANDO_ORIGINAL: "Aguardando via original",
  COMPLETO: "Completo",
  DEVOLVIDO: "Devolvido para correção",
};

export const METODO_LABEL: Record<ContratoMetodo, string> = {
  GOVBR: "Assinatura gov.br",
  MANUSCRITA: "Assinatura à mão (digitalizada)",
};

export class ContratoErro extends Error {}

const TRANSICOES: Record<Exclude<ContratoAcao, "APROVAR">, { de: ContratoStatus[]; para: ContratoStatus }> = {
  // Contrato do modelo do app: a família confere os dados e o app gera o PDF. Pode corrigir
  // os dados (gerando um PDF novo) enquanto ainda não enviou o contrato assinado.
  PREENCHER_DADOS: { de: ["AGUARDANDO_ASSINATURA", "DEVOLVIDO"], para: "AGUARDANDO_ASSINATURA" },
  ENVIAR_ASSINADO: { de: ["AGUARDANDO_ASSINATURA", "DEVOLVIDO"], para: "EM_CONFERENCIA" },
  DEVOLVER: { de: ["EM_CONFERENCIA"], para: "DEVOLVIDO" },
  ORIGINAL_RECEBIDO: { de: ["AGUARDANDO_ORIGINAL"], para: "COMPLETO" },
};

const MENSAGEM_TRANSICAO_INVALIDA: Record<ContratoAcao, string> = {
  PREENCHER_DADOS: "Os dados deste contrato não podem mais ser alterados — o contrato assinado já foi enviado.",
  ENVIAR_ASSINADO: "Este contrato não está aguardando envio da família.",
  APROVAR: "Só é possível aprovar um contrato que está em conferência.",
  DEVOLVER: "Só é possível devolver um contrato que está em conferência.",
  ORIGINAL_RECEBIDO: "Este contrato não está aguardando a via original.",
};

export function podeEnviarAssinado(status: ContratoStatus): boolean {
  return TRANSICOES.ENVIAR_ASSINADO.de.includes(status);
}

/**
 * Próximo status do contrato para uma ação. Assinatura gov.br aprovada já fica completa;
 * assinatura à mão aprovada ainda depende da via original em papel na secretaria (sem ela,
 * a escola só tem uma cópia digitalizada — prova mais fraca numa eventual cobrança).
 */
export function proximoStatus(status: ContratoStatus, acao: ContratoAcao, metodo?: ContratoMetodo | null): ContratoStatus {
  if (acao === "APROVAR") {
    if (status !== "EM_CONFERENCIA") throw new ContratoErro(MENSAGEM_TRANSICAO_INVALIDA.APROVAR);
    if (!metodo) throw new ContratoErro("O envio não informa como o contrato foi assinado.");
    return metodo === "GOVBR" ? "COMPLETO" : "AGUARDANDO_ORIGINAL";
  }
  const regra = TRANSICOES[acao];
  if (!regra.de.includes(status)) throw new ContratoErro(MENSAGEM_TRANSICAO_INVALIDA[acao]);
  return regra.para;
}

/** Excluir só é permitido antes de qualquer envio da família — depois disso o histórico é prova. */
export function podeExcluirContrato(status: ContratoStatus, totalEnviosFamilia: number): boolean {
  return status === "AGUARDANDO_ASSINATURA" && totalEnviosFamilia === 0;
}

/**
 * Confere tamanho e assinatura de bytes do PDF ("%PDF-" nos primeiros 1024 bytes, como
 * permite a especificação). Não confia no tipo informado pelo navegador.
 */
export function validarPdf(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new ContratoErro("O arquivo está vazio.");
  if (bytes.byteLength > CONTRATO_MAX_BYTES) {
    throw new ContratoErro("O arquivo passa de 4 MB. Gere o PDF novamente ou digitalize em resolução menor.");
  }
  const inicio = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!inicio.includes("%PDF-")) {
    throw new ContratoErro("O arquivo não é um PDF. Envie o contrato em PDF (fotos precisam ser convertidas em PDF).");
  }
}

/** Nome de arquivo seguro para o cabeçalho Content-Disposition: sem caminho, aspas ou quebras de linha. */
export function nomeArquivoPdfSeguro(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? "";
  let limpo = base
    .replace(/[\r\n"]/g, " ")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo || limpo === ".pdf") limpo = "contrato";
  if (!limpo.toLowerCase().endsWith(".pdf")) limpo = `${limpo}.pdf`;
  if (limpo.length > 120) limpo = `${limpo.slice(0, 116).trim()}.pdf`;
  return limpo;
}

/** "08/10/2026 às 10:42" — sem segundos, no fuso de quem está vendo. */
export function formatarDataHora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}
