import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { agoraNoFusoDaEscola } from "@/lib/billing";
import { linkWhatsAppCobranca, mensagemCobrancaBoleto } from "@/lib/boleto-aviso";

/**
 * Boletos em aberto (pendentes e vencidos) com o link pronto para cobrar o responsável
 * financeiro pelo WhatsApp. A cobrança é manual: a equipe revisa e envia a mensagem.
 */
export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const hoje = agoraNoFusoDaEscola();
    hoje.setHours(0, 0, 0, 0);

    const boletos = await prisma.boleto.findMany({
      where: { schoolId: session.schoolId, status: { in: ["PENDENTE", "VENCIDO"] }, student: { deletedAt: null } },
      orderBy: [{ vencimento: "asc" }],
      include: {
        student: {
          select: {
            id: true,
            name: true,
            guardians: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { guardian: { select: { name: true, phone: true } } },
            },
          },
        },
      },
    });

    const itens = boletos.map((b) => {
      const responsavel = b.student.guardians[0]?.guardian ?? null;
      const vencido = b.status === "VENCIDO" || b.vencimento.getTime() < hoje.getTime();
      const valor = Number(b.valor);
      const mensagem = responsavel
        ? mensagemCobrancaBoleto({ responsavel: responsavel.name, aluno: b.student.name, valor, vencimento: b.vencimento, vencido })
        : null;
      return {
        id: b.id,
        aluno: b.student.name,
        responsavel: responsavel?.name ?? null,
        mesReferencia: b.mesReferencia,
        valor,
        vencimento: b.vencimento.toISOString(),
        vencido,
        whatsapp: mensagem ? linkWhatsAppCobranca(responsavel?.phone, mensagem) : null,
      };
    });

    const pagosBd = await prisma.boleto.findMany({
      where: { schoolId: session.schoolId, status: "PAGO", student: { deletedAt: null } },
      orderBy: [{ pagoEm: "desc" }],
      take: 30,
      include: {
        student: {
          select: { name: true, guardians: { orderBy: { createdAt: "asc" }, take: 1, select: { guardian: { select: { name: true } } } } },
        },
      },
    });
    const pagos = pagosBd.map((b) => ({
      id: b.id,
      aluno: b.student.name,
      responsavel: b.student.guardians[0]?.guardian.name ?? null,
      mesReferencia: b.mesReferencia,
      valor: Number(b.valor),
      pagoEm: b.pagoEm ? b.pagoEm.toISOString() : null,
      // Pagamento confirmado pelo banco (boleto emitido) não se desfaz aqui.
      desfazivel: !b.codigoSolicitacao,
    }));

    return NextResponse.json({ itens, pagos });
  } catch (error) {
    return handleApiError(error);
  }
}
