import { notifyUsers } from "@/lib/push";
import { formatarDataISO } from "@/lib/billing";
import { janelaWhatsApp } from "@/lib/canal-envio";
import { parametrosModeloAviso } from "@/lib/avisos-equipe";
import { isWhatsAppConfigured, normalizePhoneBR, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from "@/lib/whatsapp";
import { modeloDisponivel } from "@/lib/whatsapp-modelos";

/** "2026-10-10" → "10/10/2026" (a data de vencimento é gravada ao meio-dia, sem risco de fuso). */
export function dataBR(data: Date): string {
  const [a, m, d] = formatarDataISO(data).split("-");
  return `${d}/${m}/${a}`;
}

export function valorBR(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Trecho curto do aviso de novo boleto (push e WhatsApp). */
export function textoNovoBoleto(alunoNome: string, valor: number, vencimento: Date): string {
  return `Mensalidade de ${alunoNome} — ${valorBR(valor)}, vencimento em ${dataBR(vencimento)}. Veja em Financeiro.`;
}

/** Mensagem de cobrança manual (a equipe envia pelo WhatsApp). Não promete desconto nem multa. */
export function mensagemCobrancaBoleto(input: {
  responsavel: string;
  aluno: string;
  valor: number;
  vencimento: Date;
  vencido: boolean;
}): string {
  const primeiro = input.responsavel.trim().split(/\s+/)[0] || "";
  const saudacao = primeiro ? `Olá, ${primeiro}! ` : "Olá! ";
  const situacao = input.vencido
    ? `consta em aberto a mensalidade de ${input.aluno} (${valorBR(input.valor)}), vencida em ${dataBR(input.vencimento)}`
    : `lembramos que a mensalidade de ${input.aluno} (${valorBR(input.valor)}) vence em ${dataBR(input.vencimento)}`;
  return (
    `${saudacao}Aqui é da secretaria da escola: ${situacao}. ` +
    `O boleto está disponível no ClassLink, em Financeiro. Se já pagou, pode desconsiderar esta mensagem.`
  );
}

/** Link wa.me com a mensagem pronta; null se o telefone não for válido. */
export function linkWhatsAppCobranca(telefone: string | null | undefined, texto: string): string | null {
  const numero = telefone ? normalizePhoneBR(telefone) : null;
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null;
}

export interface DestinatarioAviso {
  id: string;
  phone: string | null;
  whatsappUltimaMensagemEm: Date | null;
}

export interface ResultadoAvisoBoleto {
  push: boolean;
  whatsapp: "texto" | "modelo" | "indisponivel" | "falhou";
}

/**
 * Avisa o responsável que o boleto foi gerado: push no app e, se a escola tem WhatsApp
 * configurado, mensagem no WhatsApp (texto livre se a janela de 24h está aberta; senão o
 * modelo "aviso" aprovado). Nunca lança: cobrança não pode quebrar por falha de aviso.
 */
export async function avisarNovoBoleto(input: {
  responsavel: DestinatarioAviso;
  alunoNome: string;
  valor: number;
  vencimento: Date;
  origem: string | null;
}): Promise<ResultadoAvisoBoleto> {
  const { responsavel } = input;
  const texto = textoNovoBoleto(input.alunoNome, input.valor, input.vencimento);
  const link = `${input.origem ?? ""}/dashboard/financeiro`;
  const resultado: ResultadoAvisoBoleto = { push: false, whatsapp: "indisponivel" };

  try {
    await notifyUsers([responsavel.id], { title: "Novo boleto disponível", body: texto, url: "/dashboard/financeiro" });
    resultado.push = true;
  } catch (err) {
    console.error("boleto: falha no push", err);
  }

  try {
    const telefone = responsavel.phone ? normalizePhoneBR(responsavel.phone) : null;
    if (!telefone || !isWhatsAppConfigured()) return resultado;

    if (janelaWhatsApp(responsavel.whatsappUltimaMensagemEm).aberta) {
      await sendWhatsAppTextMessage(telefone, `${texto}\n${link}`);
      resultado.whatsapp = "texto";
      return resultado;
    }
    const modelo = await modeloDisponivel("aviso");
    if (!modelo) return resultado;
    await sendWhatsAppTemplateMessage(telefone, modelo, parametrosModeloAviso("Secretaria", texto, link));
    resultado.whatsapp = "modelo";
  } catch (err) {
    console.error("boleto: falha no aviso por WhatsApp", err);
    resultado.whatsapp = "falhou";
  }
  return resultado;
}
