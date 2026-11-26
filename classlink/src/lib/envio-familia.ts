/**
 * Envio de uma mensagem curta a um responsável pelo mesmo caminho dos lembretes: notificação do
 * app; quem não tem notificação ativa recebe pelo WhatsApp da escola (texto livre na janela de
 * 24 h, senão o modelo "aviso"). Usado pelos lembretes e pelo aviso de definição das turmas.
 */
import { prisma } from "@/lib/prisma";
import { notifyUsers, origemPublica } from "@/lib/push";
import { janelaWhatsApp } from "@/lib/canal-envio";
import { deveAvisarPorWhatsApp, parametrosModeloAviso } from "@/lib/avisos-equipe";
import { isWhatsAppConfigured, normalizePhoneBR, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from "@/lib/whatsapp";
import { modeloDisponivel } from "@/lib/whatsapp-modelos";

export type CanalLembrete = "push" | "whatsapp" | "nenhum";

export interface ResultadoEnvioFamilia {
  canal: CanalLembrete;
  /** Id da mensagem no WhatsApp (só no canal "whatsapp"), para acompanhar a entrega pelo webhook. */
  mensagemId?: string;
}

/** Nunca lança: falha vira "nenhum" (quem chamou decide tentar de novo). */
export async function enviarMensagemFamilia(
  responsavelId: string,
  { titulo, texto, url }: { titulo: string; texto: string; url: string },
): Promise<ResultadoEnvioFamilia> {
  let push = 0;
  try {
    push = (await notifyUsers([responsavelId], { title: titulo, body: texto, url })).enviados;
  } catch (err) {
    console.error("envio à família: falha no push", err);
  }
  if (push > 0) return { canal: "push" };

  // Sem notificação no celular: WhatsApp da escola, como já é feito com as mensagens.
  try {
    if (!isWhatsAppConfigured()) return { canal: "nenhum" };
    const pessoa = await prisma.user.findUnique({
      where: { id: responsavelId },
      select: { phone: true, avisosWhatsApp: true, whatsappUltimaMensagemEm: true, _count: { select: { pushTokens: true } } },
    });
    if (!pessoa) return { canal: "nenhum" };
    // Quem tem aparelho com push ativo e o envio falhou agora não recebe WhatsApp: tenta amanhã.
    if (!deveAvisarPorWhatsApp({ avisosWhatsApp: pessoa.avisosWhatsApp, aparelhosComPush: pessoa._count.pushTokens })) return { canal: "nenhum" };
    const telefone = pessoa.phone ? normalizePhoneBR(pessoa.phone) : null;
    if (!telefone) return { canal: "nenhum" };
    const link = `${origemPublica() ?? ""}${url}`;
    if (janelaWhatsApp(pessoa.whatsappUltimaMensagemEm).aberta) {
      const { externalId } = await sendWhatsAppTextMessage(telefone, `${titulo}\n\n${texto}\n${link}`);
      return { canal: "whatsapp", mensagemId: externalId };
    }
    const modelo = await modeloDisponivel("aviso");
    if (!modelo) return { canal: "nenhum" };
    const { externalId } = await sendWhatsAppTemplateMessage(telefone, modelo, parametrosModeloAviso("Secretaria", texto, link));
    return { canal: "whatsapp", mensagemId: externalId };
  } catch (err) {
    console.error("envio à família: falha no WhatsApp", err);
    return { canal: "nenhum" };
  }
}
