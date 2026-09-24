import { NextRequest, NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";

/** Compara o segredo em tempo constante (mesmo padrão usado nos webhooks do WhatsApp/Mailgun). */
function segredoValido(esperado: string, recebido: string | null): boolean {
  if (!recebido) return false;
  const expectedBuf = Buffer.from(esperado);
  const receivedBuf = Buffer.from(recebido);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

// Situações da API do Inter que indicam pagamento confirmado.
const SITUACOES_PAGO = new Set(["RECEBIDO", "MARCADO_RECEBIDO", "PAGO"]);

interface EventoWebhook {
  codigoSolicitacao?: string;
  situacao?: string;
}

/**
 * Recebe confirmações de pagamento do Banco Inter. A URL cadastrada no banco
 * (via lib/banco-inter.ts#registrarWebhook) deve incluir ?secret=BANCO_INTER_WEBHOOK_SECRET —
 * o Inter não assina o payload do webhook de boleto, então a segurança depende
 * de a URL em si ser secreta.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.BANCO_INTER_WEBHOOK_SECRET;
    if (!secret || !segredoValido(secret, request.nextUrl.searchParams.get("secret"))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const payload = await request.json();
    const eventos: EventoWebhook[] = Array.isArray(payload) ? payload : [payload];

    for (const evento of eventos) {
      if (!evento.codigoSolicitacao || !evento.situacao) continue;
      if (!SITUACOES_PAGO.has(evento.situacao)) continue;

      const boleto = await prisma.boleto.findUnique({ where: { codigoSolicitacao: evento.codigoSolicitacao } });
      if (!boleto || boleto.status === "PAGO") continue;

      await prisma.boleto.update({
        where: { id: boleto.id },
        data: { status: "PAGO", pagoEm: new Date() },
      });

      const responsavelLink = await prisma.guardianStudent.findFirst({
        where: { studentId: boleto.studentId },
        orderBy: { createdAt: "asc" },
        select: { guardianId: true },
      });
      if (responsavelLink) {
        // after: na Vercel, trabalho solto com "void" pode ser cortado ao responder.
        after(() =>
          notifyUsers([responsavelLink.guardianId], {
            title: "Pagamento confirmado",
            body: `Recebemos o pagamento do boleto de ${boleto.mesReferencia}. Obrigado!`,
            url: "/dashboard/financeiro",
          }).catch((err) => console.error("push notify failed", err)),
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
