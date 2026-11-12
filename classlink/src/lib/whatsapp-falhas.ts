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
