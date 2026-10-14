/**
 * Funil da rematrícula por aluno, calculado a partir do que já existe (confirmação da família e
 * contrato do ano). Regra da escola: confirmar a rematrícula JÁ conta como matrícula; o contrato
 * assinado é o passo seguinte, não uma condição.
 */
export type EtapaRematricula =
  | "NAO_CONFIRMOU"
  | "CONFIRMOU"
  | "CONTRATO_ENVIADO"
  | "CONTRATO_EM_CONFERENCIA"
  | "CONTRATO_ASSINADO";

export const ORDEM_ETAPAS: EtapaRematricula[] = ["NAO_CONFIRMOU", "CONFIRMOU", "CONTRATO_ENVIADO", "CONTRATO_EM_CONFERENCIA", "CONTRATO_ASSINADO"];

export const ROTULO_ETAPA: Record<EtapaRematricula, string> = {
  NAO_CONFIRMOU: "Ainda não confirmou",
  CONFIRMOU: "Confirmou (já conta)",
  CONTRATO_ENVIADO: "Contrato aguardando assinatura",
  CONTRATO_EM_CONFERENCIA: "Contrato em conferência",
  CONTRATO_ASSINADO: "Contrato assinado",
};

export type StatusContrato = "AGUARDANDO_ASSINATURA" | "EM_CONFERENCIA" | "AGUARDANDO_ORIGINAL" | "COMPLETO" | "DEVOLVIDO";

export function etapaDoAluno(entrada: { confirmou: boolean; contratoStatus: StatusContrato | null }): EtapaRematricula {
  switch (entrada.contratoStatus) {
    case "COMPLETO":
      return "CONTRATO_ASSINADO";
    case "EM_CONFERENCIA":
    case "AGUARDANDO_ORIGINAL":
      return "CONTRATO_EM_CONFERENCIA";
    case "AGUARDANDO_ASSINATURA":
    case "DEVOLVIDO":
      return "CONTRATO_ENVIADO";
    default:
      return entrada.confirmou ? "CONFIRMOU" : "NAO_CONFIRMOU";
  }
}

/** Já conta como matriculado no ano: confirmou ou já está em alguma fase do contrato. */
export function contaComoRematriculado(etapa: EtapaRematricula): boolean {
  return etapa !== "NAO_CONFIRMOU";
}

export function resumirFunil(etapas: EtapaRematricula[]) {
  const porEtapa = Object.fromEntries(ORDEM_ETAPAS.map((e) => [e, 0])) as Record<EtapaRematricula, number>;
  for (const e of etapas) porEtapa[e]++;
  const total = etapas.length;
  const rematriculados = etapas.filter(contaComoRematriculado).length;
  return { total, rematriculados, faltam: total - rematriculados, porEtapa };
}

/** Texto da cobrança manual por WhatsApp; null quando não há nada a cobrar da família. */
export function mensagemCobranca(responsavel: string, aluno: string, ano: number, etapa: EtapaRematricula): string | null {
  const nome = responsavel.trim().split(/\s+/)[0] || "tudo bem";
  switch (etapa) {
    case "NAO_CONFIRMOU":
      return `Olá, ${nome}! Aqui é da secretaria do Espaço Kids / Instituto Fokus. Ainda não recebemos a confirmação da rematrícula ${ano} de ${aluno}. Você pode confirmar pelo ClassLink (aviso na tela inicial) ou respondendo esta mensagem. Qualquer dúvida, estamos à disposição!`;
    case "CONFIRMOU":
      return `Olá, ${nome}! Recebemos a confirmação da rematrícula ${ano} de ${aluno}. Em breve enviaremos o contrato para assinatura pelo ClassLink. Obrigado pela confiança!`;
    case "CONTRATO_ENVIADO":
      return `Olá, ${nome}! O contrato ${ano} de ${aluno} está aguardando a sua assinatura no ClassLink (menu Contratos). Se precisar de ajuda para assinar, é só responder aqui.`;
    default:
      return null;
  }
}

/** Link do WhatsApp com texto pronto; null se o telefone não tem DDD + número. */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  const semDdi = digitos.replace(/^55(?=\d{10,11}$)/, "");
  if (semDdi.length < 10 || semDdi.length > 11) return null;
  return `https://wa.me/55${semDdi}?text=${encodeURIComponent(texto)}`;
}
