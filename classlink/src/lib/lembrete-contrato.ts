/**
 * Lembrete manual do contrato pelo ClassLink (botão "Lembrar no ClassLink" na tela de contratos
 * da direção). Regras puras aqui; o envio fica em src/app/api/admin/contratos/[id]/lembrete.
 */
import { diaNoFuso } from "@/lib/lembretes";

export type StatusAguardandoFamilia = "AGUARDANDO_ASSINATURA" | "DEVOLVIDO";

export function aguardaFamilia(status: string): status is StatusAguardandoFamilia {
  return status === "AGUARDANDO_ASSINATURA" || status === "DEVOLVIDO";
}

function primeiro(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Mesmo tom do lembrete pelo WhatsApp, ajustado para quem já está no app. */
export function textoLembreteContrato(responsavel: string, aluno: string, anoLetivo: number, status: StatusAguardandoFamilia): string {
  const r = primeiro(responsavel);
  const a = primeiro(aluno);
  if (status === "DEVOLVIDO") {
    return (
      `Olá, ${r}! Aqui é da secretaria. O contrato de matrícula ${anoLetivo} de ${a} voltou para correção. ` +
      `O motivo está no menu Contratos, onde você também envia o contrato corrigido. Qualquer dúvida, é só responder esta mensagem.`
    );
  }
  return (
    `Olá, ${r}! Aqui é da secretaria. O contrato de matrícula ${anoLetivo} de ${a} está aguardando a sua assinatura no menu Contratos. ` +
    `Dá para assinar grátis pelo gov.br e enviar por lá mesmo. Qualquer dúvida, é só responder esta mensagem.`
  );
}

/** A família já recebeu lembrete deste contrato hoje (calendário de Brasília)? */
export function jaLembradoHoje(ultimoEnvioEm: Date | null | undefined, agora: Date): boolean {
  return !!ultimoEnvioEm && diaNoFuso(ultimoEnvioEm) === diaNoFuso(agora);
}
