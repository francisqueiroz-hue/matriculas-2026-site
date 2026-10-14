import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { responderEnqueteSchema } from "@/lib/validators";
import { enqueteAberta, validarRespostas } from "@/lib/enquetes";
import { carregarEnqueteVisivel } from "@/lib/enquetes-acesso";

/**
 * A família responde uma vez; não há edição. Em enquete anônima, a participação (quem respondeu) e o
 * envio (o que respondeu) são gravados SEM ligação entre eles.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/enquetes/[id]/responder">) {
  try {
    const session = await requireRole("GUARDIAN");
    const { id } = await ctx.params;
    const { respostas } = responderEnqueteSchema.parse(await request.json());

    const enquete = await carregarEnqueteVisivel(session, id);
    if (!enquete) throw new ErroDeUsuario("Enquete não encontrada.", 404);
    if (!enqueteAberta(enquete)) throw new ErroDeUsuario("Esta enquete já foi encerrada.", 400);

    const itens = validarRespostas(enquete.perguntas, respostas);
    if (itens.length === 0) throw new ErroDeUsuario("Responda ao menos uma pergunta.");

    const agora = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        await tx.enqueteParticipacao.create({ data: { enqueteId: id, userId: session.sub, respondidoEm: agora } });
        await tx.enqueteEnvio.create({
          data: {
            enqueteId: id,
            ...(enquete.anonima ? {} : { userId: session.sub, respondidoEm: agora }),
            itens: { create: itens },
          },
        });
      });
    } catch (error) {
      if ((error as { code?: string } | null)?.code === "P2002") {
        throw new ErroDeUsuario("Você já respondeu esta enquete. Obrigado!", 409);
      }
      throw error;
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
