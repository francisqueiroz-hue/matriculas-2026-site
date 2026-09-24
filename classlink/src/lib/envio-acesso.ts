import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import {
  getAccessTemplate,
  isWhatsAppConfigured,
  normalizePhoneBR,
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage,
} from "@/lib/whatsapp";
import { mensagemAcesso, parametrosModeloAcesso, PALAVRA_PEDIDO_ACESSO } from "@/lib/acesso";
import { modeloDisponivel } from "@/lib/whatsapp-modelos";

/** Margem de segurança sobre as 24h da Meta, para não enviar texto livre no limite. */
export const JANELA_CONVERSA_MS = 23 * 60 * 60 * 1000;

export function conversaAberta(ultimaMensagemEm: Date | null | undefined, agora = Date.now()): boolean {
  return Boolean(ultimaMensagemEm && agora - ultimaMensagemEm.getTime() < JANELA_CONVERSA_MS);
}

export type ResultadoEnvioAcesso =
  | { enviado: true; via: "senha"; senha: string }
  | { enviado: true; via: "convite" }
  | { enviado: false; motivo: string };

/**
 * Envia o acesso de um usuário pelo WhatsApp da escola — sempre pelo próprio ClassLink:
 *  1. conversa aberta (a pessoa escreveu nas últimas 24h): manda login e senha direto;
 *  2. modelo de acesso com senha configurado (opcional): manda por ele;
 *  3. senão: manda o convite (modelo aprovado, sem senha) com o botão ACESSO — ao tocar,
 *     a pessoa recebe login e senha na hora (webhook).
 * `senhaDefinida`: senha que o chamador já gravou (cadastro/redefinição). Sem ela, uma
 * senha nova é gerada e só gravada se a entrega for aceita pela Meta.
 */
export async function enviarAcessoPeloApp(userId: string, origem: string, senhaDefinida?: string): Promise<ResultadoEnvioAcesso> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, role: true, active: true, deletedAt: true, whatsappUltimaMensagemEm: true },
  });
  if (!user || !user.active || user.deletedAt) return { enviado: false, motivo: "usuário inativo" };
  const telefone = user.phone ? normalizePhoneBR(user.phone) : null;
  if (!telefone) return { enviado: false, motivo: "sem celular cadastrado" };
  if (!isWhatsAppConfigured()) return { enviado: false, motivo: "WhatsApp da escola não configurado" };

  const dados = {
    nome: user.name,
    url: `${origem}${user.role === "GUARDIAN" ? "/guia" : "/login"}`,
    login: user.email ?? user.phone ?? telefone,
    senha: senhaDefinida ?? randomBytes(6).toString("hex"),
  };

  async function gravarSenha() {
    if (senhaDefinida) return; // o chamador já gravou
    await prisma.$transaction([
      prisma.user.update({ where: { id: user!.id }, data: { passwordHash: await hashPassword(dados.senha) } }),
      prisma.refreshToken.updateMany({ where: { userId: user!.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  try {
    if (conversaAberta(user.whatsappUltimaMensagemEm)) {
      await sendWhatsAppTextMessage(telefone, mensagemAcesso(dados));
      await gravarSenha();
      return { enviado: true, via: "senha", senha: dados.senha };
    }

    const modeloAcesso = getAccessTemplate();
    if (modeloAcesso) {
      await sendWhatsAppTemplateMessage(telefone, modeloAcesso, parametrosModeloAcesso(dados));
      await gravarSenha();
      return { enviado: true, via: "senha", senha: dados.senha };
    }

    const convite = await modeloDisponivel("convite");
    if (!convite) {
      return { enviado: false, motivo: "modelo de convite ainda não aprovado pela Meta (veja Painel → Configuração dos avisos)" };
    }
    await sendWhatsAppTemplateMessage(telefone, convite, [user.name.split(" ")[0]], [PALAVRA_PEDIDO_ACESSO]);
    return { enviado: true, via: "convite" };
  } catch (err) {
    console.error(`Falha ao enviar acesso de ${user.id} pelo WhatsApp`, err);
    return { enviado: false, motivo: err instanceof Error ? err.message : "erro no envio" };
  }
}

/** Texto curto para o painel explicar o que aconteceu. */
export function descreverEnvio(r: ResultadoEnvioAcesso): string {
  if (!r.enviado) return `Não foi possível enviar pelo WhatsApp da escola: ${r.motivo}.`;
  if (r.via === "senha") return "Login e senha enviados pelo WhatsApp da escola.";
  return "Convite enviado pelo WhatsApp da escola — ao tocar em ACESSO, a pessoa recebe o login e a senha na hora.";
}
