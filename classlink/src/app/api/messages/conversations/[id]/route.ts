import { NextRequest, NextResponse, after } from "next/server";
import { avisarEquipePorWhatsApp, parametrosModeloAviso, registrarAviso } from "@/lib/avisos-equipe";
import { modeloDisponivel } from "@/lib/whatsapp-modelos";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { assertConversationParticipant } from "@/lib/messaging";
import { exigirPodeConversar, exigirPodeExcluirConversa } from "@/lib/permissoes-mensagens";
import { sendMessageSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";
import { isWhatsAppConfigured, normalizePhoneBR, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from "@/lib/whatsapp";
import { isEmailConfigured, sendEmailMessage } from "@/lib/email";
import { MENSAGEM_JANELA_FECHADA, janelaWhatsApp } from "@/lib/canal-envio";
import { SELECT_PESSOA, nomeParaQuemVe, pessoaParaQuemVe } from "@/lib/nome-institucional";
import { getShortSignedMediaUrl } from "@/lib/firebase-storage";

type MensagemComAnexo = {
  anexoTipo: string | null;
  anexoMime: string | null;
  anexoNome: string | null;
  anexoCaminho: string | null;
  anexoMediaId: string | null;
};

/**
 * Anexo para a tela: link assinado e curto (só quem participa da conversa chega aqui). O
 * caminho no armazenamento e o id da mídia na Meta não saem do servidor.
 */
async function comAnexo<T extends MensagemComAnexo>(m: T) {
  const { anexoTipo, anexoMime, anexoNome, anexoCaminho, anexoMediaId: _mediaId, ...resto } = m;
  void _mediaId;
  if (!anexoTipo) return { ...resto, anexo: null };
  const url = anexoCaminho
    ? await getShortSignedMediaUrl(anexoCaminho).catch((err) => {
        console.error("conversa: falha ao gerar link do anexo", err);
        return null;
      })
    : null;
  return { ...resto, anexo: { tipo: anexoTipo, mime: anexoMime, nome: anexoNome, url } };
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/messages/conversations/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const participante = await assertConversationParticipant(id, session.sub);
    await exigirPodeConversar(participante.staffId, participante.guardianId);

    const [conversation, messages] = await Promise.all([
      prisma.conversation.findUniqueOrThrow({
        where: { id },
        include: {
          staff: { select: SELECT_PESSOA },
          guardian: { select: { id: true, name: true, phone: true, email: true, whatsappUltimaMensagemEm: true } },
        },
      }),
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
        include: { sender: { select: SELECT_PESSOA } },
      }),
    ]);

    await prisma.message.updateMany({
      where: { conversationId: id, senderId: { not: session.sub }, readAt: null },
      data: { readAt: new Date() },
    });

    // Família: a equipe aparece pelo cargo/nome institucional; e-mail e telefone da família
    // só fazem sentido para a equipe.
    // Só a equipe precisa saber se o WhatsApp ainda entrega texto livre (janela de 24h); a família não vê isso.
    const { whatsappUltimaMensagemEm, ...guardianPublico } = conversation.guardian;
    const souEquipe = session.sub === conversation.staffId;
    return NextResponse.json({
      conversation: {
        ...conversation,
        guardian: guardianPublico,
        staff: pessoaParaQuemVe(conversation.staff, session.role),
        ...(souEquipe && { janelaWhatsApp: { ...janelaWhatsApp(whatsappUltimaMensagemEm), avisoPorModelo: isWhatsAppConfigured() } }),
      },
      messages: await Promise.all(messages.map(async (m) => ({ ...(await comAnexo(m)), sender: pessoaParaQuemVe(m.sender, session.role) }))),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/messages/conversations/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const conversation = await assertConversationParticipant(id, session.sub);
    // Regra da escola: família ↔ direção/coordenação apenas (inclusive conversas antigas).
    await exigirPodeConversar(conversation.staffId, conversation.guardianId);
    const { body, channel } = sendMessageSchema.parse(await request.json());

    // WhatsApp/e-mail só fazem sentido enviados pela equipe ao responsável — o responsável
    // já está na conversa via app, e essas mensagens sempre partem de quem está na tela do ClassLink.
    let canalEfetivo: "APP" | "WHATSAPP" | "EMAIL" =
      channel && channel !== "APP" && session.sub === conversation.staffId ? channel : "APP";

    let externalId: string | undefined;
    let avisoPeloWhatsApp = false;
    if (canalEfetivo === "WHATSAPP") {
      if (!isWhatsAppConfigured()) return NextResponse.json({ error: "Integração com WhatsApp não configurada" }, { status: 400 });
      const guardian = await prisma.user.findUniqueOrThrow({
        where: { id: conversation.guardianId },
        select: { phone: true, whatsappUltimaMensagemEm: true },
      });
      const phone = guardian.phone ? normalizePhoneBR(guardian.phone) : null;
      if (!phone) return NextResponse.json({ error: "Responsável não tem telefone cadastrado" }, { status: 400 });

      if (janelaWhatsApp(guardian.whatsappUltimaMensagemEm).aberta) {
        const sent = await sendWhatsAppTextMessage(phone, body).catch((err: unknown) => {
          console.error("conversa: falha ao enviar WhatsApp", err);
          throw new ErroDeUsuario("Não foi possível enviar pelo WhatsApp. Confira o número do responsável e a integração.", 502);
        });
        externalId = sent.externalId;
      } else {
        // Fora da janela de 24h a Meta descarta texto livre (e aceita o envio, o que enganava a equipe).
        // O texto completo fica no ClassLink; a família recebe no WhatsApp o aviso padrão aprovado,
        // com o trecho e o link. A mensagem é do canal ClassLink, então vale o ✓✓ de abertura.
        const modelo = await modeloDisponivel("aviso");
        if (!modelo) throw new ErroDeUsuario(MENSAGEM_JANELA_FECHADA, 409);
        const eu = await prisma.user.findUniqueOrThrow({ where: { id: session.sub }, select: SELECT_PESSOA });
        const aviso = await sendWhatsAppTemplateMessage(
          phone,
          modelo,
          parametrosModeloAviso(nomeParaQuemVe(eu, "GUARDIAN"), body, `${request.nextUrl.origin}/dashboard/mensagens/${id}`),
        ).catch((err: unknown) => {
          console.error("conversa: falha ao enviar aviso padrão do WhatsApp", err);
          throw new ErroDeUsuario("Não foi possível avisar a família pelo WhatsApp agora. Envie pelo ClassLink.", 502);
        });
        await registrarAviso(aviso.externalId, conversation.guardianId, "familia", id);
        avisoPeloWhatsApp = true;
        canalEfetivo = "APP";
      }
    } else if (canalEfetivo === "EMAIL") {
      if (!isEmailConfigured()) return NextResponse.json({ error: "Integração de e-mail não configurada" }, { status: 400 });
      const guardian = await prisma.user.findUniqueOrThrow({ where: { id: conversation.guardianId }, select: { email: true } });
      if (!guardian.email) return NextResponse.json({ error: "Responsável não tem e-mail cadastrado" }, { status: 400 });
      const sent = await sendEmailMessage({ to: guardian.email, subject: "Nova mensagem do ClassLink", text: body, conversationId: id }).catch((err: unknown) => {
        console.error("conversa: falha ao enviar e-mail", err);
        throw new ErroDeUsuario("Não foi possível enviar o e-mail. Confira o endereço do responsável e a integração.", 502);
      });
      externalId = sent.externalId;
    }

    const message = await prisma.message.create({
      data: { conversationId: id, senderId: session.sub, body, channel: canalEfetivo, externalId },
      include: { sender: { select: SELECT_PESSOA } },
    });

    const recipientId = conversation.staffId === session.sub ? conversation.guardianId : conversation.staffId;
    // Depois da resposta (after): na Vercel, trabalho solto com "void" pode ser cortado.
    const origem = request.nextUrl.origin;
    after(async () => {
      if (canalEfetivo === "APP") {
        await notifyUsers([recipientId], {
          // Para a família, a notificação mostra o cargo/nome institucional de quem escreveu.
          title: `Nova mensagem de ${nomeParaQuemVe(message.sender, recipientId === conversation.guardianId ? "GUARDIAN" : "STAFF")}`,
          body: body.slice(0, 120),
          url: `/dashboard/mensagens/${id}`,
        }).catch((err) => console.error("push notify failed", err));
      }
      // Família escreveu pelo app: avisa a pessoa da equipe também no WhatsApp (se ela ativou).
      if (recipientId === conversation.staffId) {
        await avisarEquipePorWhatsApp({
          destinatarioId: recipientId,
          remetente: message.sender.name,
          texto: body,
          link: `${origem}/dashboard/mensagens/${id}`,
          tipo: "familia",
          conversationId: id,
          mensagemId: message.id,
        });
      }
    });

    return NextResponse.json(
      { message: { ...(await comAnexo(message)), sender: pessoaParaQuemVe(message.sender, session.role) }, avisoPeloWhatsApp },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** Exclui a conversa e todas as mensagens dela, para os dois lados (só direção/coordenação). */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/messages/conversations/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    await assertConversationParticipant(id, session.sub);
    await exigirPodeExcluirConversa(session.sub);
    await prisma.conversation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
