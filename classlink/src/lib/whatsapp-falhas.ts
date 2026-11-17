import { prisma } from "@/lib/prisma";
import { findGuardianByPhone, findStaffByPhone } from "@/lib/whatsapp";

/**
 * A Meta aceita o envio e só depois avisa, pelo webhook de status, que a entrega falhou. Este
 * módulo guarda essas falhas e resume o que a direção precisa saber: quem não recebeu e por quê,
 * para avisar a família por outro meio em vez de achar que a mensagem chegou.
 */

/** Explicação, em português claro, dos códigos de erro mais comuns da Cloud API. */
export function explicarCodigoFalha(codigo: number | null): string {
  switch (codigo) {
    case 131042:
      return "Pagamento pendente na conta do WhatsApp Business (Meta Business Suite → Faturamento).";
    case 131047:
      return "Fora da janela de 24h: a família não escreveu recentemente e o texto livre não é entregue.";
    case 131026:
      return "O número da família não recebe mensagens no WhatsApp (ou está incorreto).";
    case 131048:
    case 131049:
    case 131056:
      return "A Meta limitou o envio para este contato ou conta; tente de novo mais tarde.";
    case 131051:
    case 131053:
      return "Formato de mensagem ou mídia não aceito pelo WhatsApp.";
    default:
      return "A Meta recusou a entrega.";
  }
}

export interface FalhaDeEntrega {
  mensagemId: string;
  telefone: string;
  codigo?: number;
  titulo?: string;
  detalhe?: string;
}

/** Guarda a falha (uma vez por mensagem, mesmo que a Meta reenvie o webhook) ligando-a à pessoa e à escola. */
export async function registrarFalhaEntrega(f: FalhaDeEntrega): Promise<void> {
  const pessoa = (await findGuardianByPhone(f.telefone)) ?? (await findStaffByPhone(f.telefone));
  await prisma.whatsappFalha.upsert({
    where: { mensagemId: f.mensagemId },
    create: {
      mensagemId: f.mensagemId,
      schoolId: pessoa?.schoolId ?? null,
      userId: pessoa?.id ?? null,
      telefone: f.telefone,
      codigo: f.codigo ?? null,
      titulo: f.titulo ?? null,
      detalhe: f.detalhe ?? null,
    },
    update: {},
  });
}

export interface ResumoFalhas {
  /** Mensagens não entregues no período. */
  total: number;
  /** Pessoas diferentes que ficaram sem receber. */
  pessoas: number;
  /** Causa mais frequente, já explicada (null quando não houve falha). */
  motivo: string | null;
  /** Há erro de cobrança: nada será entregue até a conta ser quitada. */
  cobrancaPendente: boolean;
  ultimas: { nome: string; codigo: number | null; em: Date }[];
}

const HORAS_RESUMO = 48;

export async function resumoFalhasRecentes(schoolId: string, agora = new Date()): Promise<ResumoFalhas> {
  const desde = new Date(agora.getTime() - HORAS_RESUMO * 3_600_000);
  const falhas = await prisma.whatsappFalha.findMany({
    where: { schoolId, createdAt: { gte: desde } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { userId: true, codigo: true, createdAt: true },
  });
  if (falhas.length === 0) return { total: 0, pessoas: 0, motivo: null, cobrancaPendente: false, ultimas: [] };

  const ids = [...new Set(falhas.flatMap((f) => (f.userId ? [f.userId] : [])))];
  const usuarios = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nomes = new Map(usuarios.map((u) => [u.id, u.name]));

  const porCodigo = new Map<number | null, number>();
  for (const f of falhas) porCodigo.set(f.codigo, (porCodigo.get(f.codigo) ?? 0) + 1);
  const [maisFrequente] = [...porCodigo.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    total: falhas.length,
    pessoas: ids.length,
    motivo: explicarCodigoFalha(maisFrequente),
    cobrancaPendente: porCodigo.has(131042),
    ultimas: falhas.slice(0, 20).map((f) => ({ nome: (f.userId && nomes.get(f.userId)) || "Número sem cadastro", codigo: f.codigo, em: f.createdAt })),
  };
}

/**
 * Janela em que uma recusa por cobrança (131042) ainda vale como "WhatsApp fora do ar". O
 * bloqueio acaba antes disso assim que a Meta confirma uma entrega posterior à recusa (conta
 * quitada); as 24 h só valem quando nada foi entregue desde então.
 */
export const HORAS_BLOQUEIO_COBRANCA = 24;

/**
 * Enquanto a Meta recusa por pagamento pendente, nenhuma mensagem chega — a escola inteira fica
 * sem WhatsApp. Devolve desde quando (última recusa) ou null quando o canal está liberado.
 */
export async function bloqueioPorCobranca(schoolId: string, agora = new Date()): Promise<{ desde: Date } | null> {
  const desde = new Date(agora.getTime() - HORAS_BLOQUEIO_COBRANCA * 3_600_000);
  const ultima = await prisma.whatsappFalha.findFirst({
    where: { schoolId, codigo: 131042, createdAt: { gte: desde } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!ultima) return null;
  // A Meta voltou a entregar depois da última recusa: a cobrança foi resolvida.
  const escola = await prisma.school.findUnique({ where: { id: schoolId }, select: { whatsappEntregueEm: true } });
  if (escola?.whatsappEntregueEm && escola.whatsappEntregueEm > ultima.createdAt) return null;
  return { desde: ultima.createdAt };
}

/**
 * Guarda a entrega mais recente confirmada pela Meta. A conta do WhatsApp (e a cobrança) é a
 * mesma para todo o sistema, então a entrega vale para todas as escolas. Só grava se for mais nova.
 */
export async function registrarEntregaConfirmada(em: Date): Promise<void> {
  if (Number.isNaN(em.getTime())) return;
  await prisma.school.updateMany({
    where: { OR: [{ whatsappEntregueEm: null }, { whatsappEntregueEm: { lt: em } }] },
    data: { whatsappEntregueEm: em },
  });
}

/** Momento da entrega mais recente entre os status do webhook ("delivered"/"read"), ou null. */
export function ultimaEntregaDosStatus(statuses: { status: string; timestamp?: string }[], agora = new Date()): Date | null {
  let maior: number | null = null;
  for (const st of statuses) {
    if (st.status !== "delivered" && st.status !== "read") continue;
    const segundos = Number(st.timestamp);
    // Sem horário válido (ou no futuro), vale a hora em que o aviso chegou.
    const ms = Number.isFinite(segundos) && segundos > 0 ? Math.min(segundos * 1000, agora.getTime()) : agora.getTime();
    if (maior === null || ms > maior) maior = ms;
  }
  return maior === null ? null : new Date(maior);
}

export const MOTIVO_BLOQUEIO_COBRANCA =
  "O WhatsApp da escola está bloqueado pela Meta por pagamento pendente na conta do WhatsApp Business. " +
  "Enquanto isso, as mensagens vão pelo ClassLink (a família recebe a notificação no celular).";

/** Falhas de entrega das mensagens da conversa (pelo id da mensagem no WhatsApp), já explicadas. */
export async function falhasDasMensagens(externalIds: string[]): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();
  const falhas = await prisma.whatsappFalha.findMany({
    where: { mensagemId: { in: externalIds } },
    select: { mensagemId: true, codigo: true },
  });
  return new Map(falhas.map((f) => [f.mensagemId, explicarCodigoFalha(f.codigo)]));
}
