import { NextRequest, NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";
import { interpretarCallbackInter, type CallbackInter } from "@/lib/inter-webhook";

/** Compara o segredo em tempo constante (mesmo padrão usado nos webhooks do WhatsApp/Mailgun). */
function segredoValido(esperado: string, recebido: string | null): boolean {
  if (!recebido) return false;
  const expectedBuf = Buffer.from(esperado);
  const receivedBuf = Buffer.from(recebido);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Recebe os avisos (callbacks) da API Cobrança v3 do Banco Inter: emissão concluída (chega a
 * linha digitável e o Pix), falha de emissão, cancelamento e pagamento. A URL cadastrada no banco
 * (Financeiro › Banco Inter › Cadastrar webhook) leva ?secret=BANCO_INTER_WEBHOOK_SECRET: o
 * Inter não assina o callback de cobrança, então a segurança depende de a URL ser secreta.
 * O Inter tenta de novo até 4 vezes se a resposta não for 2xx; por isso tudo aqui é idempotente.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.BANCO_INTER_WEBHOOK_SECRET;
    if (!secret || !segredoValido(secret, request.nextUrl.searchParams.get("secret"))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const payload = await request.json();
    const eventos: CallbackInter[] = Array.isArray(payload) ? payload : [payload];
    const avisar: Array<{ userId: string; mes: string }> = [];

    for (const evento of eventos) {
      if (!evento?.codigoSolicitacao) continue;
      const boleto = await prisma.boleto.findUnique({ where: { codigoSolicitacao: evento.codigoSolicitacao } });
      if (!boleto) continue;

      const mudanca = interpretarCallbackInter(evento, boleto);
      if (!mudanca) continue;

      // Só grava se o boleto não mudou desde a leitura (dois callbacks ao mesmo tempo).
      const { count } = await prisma.boleto.updateMany({
        where: { id: boleto.id, updatedAt: boleto.updatedAt },
        data: mudanca.dados,
      });
      if (count === 0 || !mudanca.pagamentoConfirmado) continue;

      // Regra do responsável financeiro: aviso ao destinatário; boleto anterior à regra, ao 1º
      // responsável vinculado, como era.
      let userId = boleto.porResponsavelFinanceiro ? boleto.destinatarioId : null;
      if (!boleto.porResponsavelFinanceiro) {
        const link = await prisma.guardianStudent.findFirst({
          where: { studentId: boleto.studentId },
          orderBy: { createdAt: "asc" },
          select: { guardianId: true },
        });
        userId = link?.guardianId ?? null;
      }
      if (userId) avisar.push({ userId, mes: boleto.mesReferencia });
    }

    if (avisar.length > 0) {
      // after: na Vercel, trabalho solto com "void" pode ser cortado ao responder.
      after(async () => {
        for (const a of avisar) {
          await notifyUsers([a.userId], {
            title: "Pagamento confirmado",
            body: `Recebemos o pagamento do boleto de ${a.mes}. Obrigado!`,
            url: "/dashboard/financeiro",
          }).catch((err) => console.error("push notify failed", err));
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
