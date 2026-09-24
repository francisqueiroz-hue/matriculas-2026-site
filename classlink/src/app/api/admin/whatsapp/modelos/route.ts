import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { cadastrarModelos, consultarModelo, limparCacheModelos, wabaId } from "@/lib/whatsapp-modelos";

/** Situação dos modelos de mensagem do ClassLink na Meta. */
export async function GET() {
  try {
    await requireRole("ADMIN");
    limparCacheModelos();
    const [convite, aviso] = await Promise.all([consultarModelo("convite"), consultarModelo("aviso")]);
    return NextResponse.json({ contaBusiness: wabaId() !== null, modelos: [convite, aviso] });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Cadastra na Meta os modelos que faltam (a aprovação costuma levar de minutos a algumas horas). */
export async function POST() {
  try {
    await requireRole("ADMIN");
    try {
      const modelos = await cadastrarModelos();
      return NextResponse.json({ contaBusiness: true, modelos });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao cadastrar" }, { status: 400 });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
