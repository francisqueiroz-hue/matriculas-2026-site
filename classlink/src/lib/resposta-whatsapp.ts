import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/push";
import { avisarEquipePorWhatsApp, registrarAviso } from "@/lib/avisos-equipe";
import { conversaAberta } from "@/lib/envio-acesso";
import { perfilDoUsuario, podeConversar } from "@/lib/permissoes-mensagens";
import { normalizePhoneBR, sendWhatsAppTextMessage } from "@/lib/whatsapp";

/**
 * Responder pelo WhatsApp: a pessoa da equipe responde ao aviso que o número da escola
 * mandou ("Você recebeu uma nova mensagem no ClassLink de ...") e a resposta entra na
 * conversa do ClassLink, como se tivesse sido escrita no app.
 *
 * A conversa vem do aviso respondido (o WhatsApp manda o id dele em `context`). Sem
 * "Responder", vale o aviso mais recente dos últimos 30 minutos — e a confirmação diz para
 * quem foi, então um engano fica visível na hora.
 */

/** Sem "Responder" no WhatsApp, só vale o aviso bem recente — evita cair na conversa errada. */
export const JANELA_SEM_CONTEXTO_MS = 30 * 60 * 1000;

export const TEXTO_COMO_RESPONDER =
  "Para responder uma mensagem do ClassLink por aqui, toque e segure o aviso da mensagem e escolha *Responder*. " +
  "Se preferir, abra o ClassLink pelo link do aviso.";

export interface RespostaRecebida {
  /** Pessoa da equipe que respondeu (já identificada pelo telefone). */
  remetente: { id: string; name: string };
  /** Telefone de onde veio (para a confirmação). */
  telefone: string;
  /** Texto digitado; vazio quando é áudio, foto etc. */
  texto: string;
  /** id da mensagem recebida (wamid), para não processar duas vezes. */
  mensagemId: string;
  /** id do aviso respondido (context.id), quando a pessoa usou "Responder". */
  respondendoA?: string | null;
  /** Origem do app, para links. */
  origem: string;
}

export type ResultadoResposta =
  | { status: "enviada"; destinatario: string; tipo: "familia" | "equipe"; conversationId: string }
  | { status: "duplicada" }
  | { status: "sem_conversa" }
  | { status: "sem_texto" }
  | { status: "nao_permitida" };

async function confirmar(r: RespostaRecebida, texto: string, vinculo?: { tipo: "familia" | "equipe"; conversationId: string }) {
  try {
    const enviada = await sendWhatsAppTextMessage(r.telefone, texto);
    // Responder à confirmação também continua na mesma conversa.
    if (vinculo) await registrarAviso(enviada.externalId, r.remetente.id, vinculo.tipo, vinculo.conversationId);
  } catch (err) {
    console.error("Falha ao confirmar resposta pelo WhatsApp", err);
  }
}

export async function processarRespostaPeloWhatsApp(r: RespostaRecebida): Promise<ResultadoResposta> {
  // A Meta reenvia o webhook se não receber 200 a tempo: a mesma resposta não entra duas vezes.
  if (await prisma.whatsAppVinculoConversa.findUnique({ where: { externalId: r.mensagemId } })) {
    return { status: "duplicada" };
  }

  const aviso = r.respondendoA
    ? await prisma.whatsAppVinculoConversa.findFirst({
        where: { externalId: r.respondendoA, userId: r.remetente.id, papel: "AVISO" },
      })
    : await prisma.whatsAppVinculoConversa.findFirst({
        where: { userId: r.remetente.id, papel: "AVISO", createdAt: { gte: new Date(Date.now() - JANELA_SEM_CONTEXTO_MS) } },
        orderBy: { createdAt: "desc" },
      });
  if (!aviso) {
    await confirmar(r, TEXTO_COMO_RESPONDER);
    return { status: "sem_conversa" };
  }
  const tipo = aviso.tipo === "FAMILIA" ? "familia" : "equipe";

  const texto = r.texto.trim();
  if (!texto) {
    await confirmar(r, "Por enquanto só respostas em texto chegam ao ClassLink. Escreva a resposta ou abra o ClassLink para enviar.");
    return { status: "sem_texto" };
  }

  // Marca como processada antes de enviar (reentregas simultâneas do webhook param aqui).
  try {
    await prisma.whatsAppVinculoConversa.create({
      data: { externalId: r.mensagemId, userId: r.remetente.id, papel: "RESPOSTA", tipo: aviso.tipo, conversationId: aviso.conversationId },
    });
  } catch {
    return { status: "duplicada" };
  }

  return tipo === "familia" ? responderFamilia(r, aviso.conversationId, texto) : responderEquipe(r, aviso.conversationId, texto);
}

async function responderFamilia(r: RespostaRecebida, conversationId: string, texto: string): Promise<ResultadoResposta> {
  const conversa = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { guardian: { select: { id: true, name: true, phone: true, deletedAt: true, whatsappUltimaMensagemEm: true } } },
  });
  // A conversa precisa existir, ser desta pessoa e seguir as regras (família ↔ direção/coordenação).
  if (!conversa || conversa.staffId !== r.remetente.id || conversa.guardian.deletedAt) {
    await confirmar(r, "Essa conversa não está mais disponível no ClassLink.");
    return { status: "sem_conversa" };
  }
  if (!podeConversar(await perfilDoUsuario(r.remetente.id), "familia")) {
    await confirmar(r, "Pelas regras da escola, as mensagens com as famílias passam pela direção ou pela coordenação.");
    return { status: "nao_permitida" };
  }

  // Se a família falou pelo WhatsApp e a conversa dela com a escola está aberta (24h),
  // a resposta vai para o WhatsApp dela; senão, chega pelo app (push).
  const ultimaDaFamilia = await prisma.message.findFirst({
    where: { conversationId, senderId: conversa.guardianId },
    orderBy: { createdAt: "desc" },
    select: { channel: true },
  });
  const telefoneFamilia = conversa.guardian.phone ? normalizePhoneBR(conversa.guardian.phone) : null;
  const pelaFamiliaNoWhatsApp =
    ultimaDaFamilia?.channel === "WHATSAPP" && telefoneFamilia && conversaAberta(conversa.guardian.whatsappUltimaMensagemEm);

  let channel: "APP" | "WHATSAPP" = "APP";
  let externalId: string | undefined;
  if (pelaFamiliaNoWhatsApp && telefoneFamilia) {
    try {
      externalId = (await sendWhatsAppTextMessage(telefoneFamilia, texto)).externalId;
      channel = "WHATSAPP";
    } catch (err) {
      console.error("Falha ao repassar a resposta à família pelo WhatsApp; fica no app", err);
    }
  }

  await prisma.message.create({ data: { conversationId, senderId: r.remetente.id, body: texto, channel, externalId } });
  // Quem respondeu já leu o que a família mandou.
  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: r.remetente.id }, readAt: null },
    data: { readAt: new Date() },
  });
  if (channel === "APP") {
    await notifyUsers([conversa.guardianId], {
      title: `Nova mensagem de ${r.remetente.name}`,
      body: texto.slice(0, 120),
      url: `/dashboard/mensagens/${conversationId}`,
    }).catch((err) => console.error("push notify failed", err));
  }

  await confirmar(r, `✓ Resposta enviada para ${conversa.guardian.name} no ClassLink.`, { tipo: "familia", conversationId });
  return { status: "enviada", destinatario: conversa.guardian.name, tipo: "familia", conversationId };
}

async function responderEquipe(r: RespostaRecebida, conversationId: string, texto: string): Promise<ResultadoResposta> {
  const conversa = await prisma.teamConversation.findUnique({
    where: { id: conversationId },
    include: {
      userA: { select: { id: true, name: true, deletedAt: true } },
      userB: { select: { id: true, name: true, deletedAt: true } },
    },
  });
  const outro = conversa && (conversa.userAId === r.remetente.id ? conversa.userB : conversa.userBId === r.remetente.id ? conversa.userA : null);
  if (!conversa || !outro || outro.deletedAt) {
    await confirmar(r, "Essa conversa não está mais disponível no ClassLink.");
    return { status: "sem_conversa" };
  }
  const [meuPerfil, perfilOutro] = await Promise.all([perfilDoUsuario(r.remetente.id), perfilDoUsuario(outro.id)]);
  if (!podeConversar(meuPerfil, perfilOutro)) {
    await confirmar(r, "Pelas regras da escola, as mensagens da equipe passam pela direção ou pela coordenação.");
    return { status: "nao_permitida" };
  }

  const mensagem = await prisma.teamMessage.create({ data: { conversationId, senderId: r.remetente.id, body: texto } });
  await prisma.teamMessage.updateMany({
    where: { conversationId, senderId: { not: r.remetente.id }, readAt: null },
    data: { readAt: new Date() },
  });
  const link = `/dashboard/mensagens/${conversationId}?tipo=equipe`;
  await notifyUsers([outro.id], { title: `Nova mensagem de ${r.remetente.name}`, body: texto.slice(0, 120), url: link }).catch((err) =>
    console.error("push notify failed", err),
  );
  await avisarEquipePorWhatsApp({
    destinatarioId: outro.id,
    remetente: r.remetente.name,
    texto,
    link: `${r.origem}${link}`,
    tipo: "equipe",
    conversationId,
    mensagemId: mensagem.id,
  });

  await confirmar(r, `✓ Resposta enviada para ${outro.name} no ClassLink.`, { tipo: "equipe", conversationId });
  return { status: "enviada", destinatario: outro.name, tipo: "equipe", conversationId };
}
