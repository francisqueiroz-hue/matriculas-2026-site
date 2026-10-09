import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { publicarCardapio } from "@/lib/cardapios";
import { exigirGestaoCardapio } from "@/lib/cardapios-acesso";

/** Publica agora, sem esperar a segunda-feira (ex.: cardápio corrigido de última hora). */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/cardapios/[id]/publicar">) {
  try {
    const session = await requireSession();
    await exigirGestaoCardapio(session.sub);
    const { id } = await ctx.params;
    const existente = await prisma.cardapio.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existente) return NextResponse.json({ error: "Cardápio não encontrado" }, { status: 404 });
    if (existente.status === "PUBLICADO") return NextResponse.json({ error: "Esse cardápio já foi publicado." }, { status: 409 });

    await publicarCardapio(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
