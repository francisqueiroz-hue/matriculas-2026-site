import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { exigirArea } from "@/lib/visibilidade-server";
import { agoraNoFusoDaEscola } from "@/lib/billing";
import { emitirBoletosDoAno, estadoBoletosDoAno } from "@/lib/boletos-do-ano-server";

// Até 12 emissões no Inter (cada uma com consulta) podem passar do limite padrão da função.
export const maxDuration = 60;

/** Boletos do ano que a família pode emitir sozinha (só aparece com a opção ligada pela direção). */
export async function GET() {
  try {
    const session = await requireRole("GUARDIAN");
    await exigirArea(session, "FINANCEIRO");
    return NextResponse.json(await estadoBoletosDoAno(session.sub, session.schoolId, agoraNoFusoDaEscola()));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({ studentId: z.string().min(1).max(100) });

/** Emite no Banco Inter as parcelas do ano ainda não emitidas do aluno. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("GUARDIAN");
    await exigirArea(session, "FINANCEIRO");
    const { studentId } = schema.parse(await request.json());
    const hoje = agoraNoFusoDaEscola();
    const resultado = await emitirBoletosDoAno(session.sub, session.schoolId, studentId, hoje);
    const estado = await estadoBoletosDoAno(session.sub, session.schoolId, hoje);
    return NextResponse.json({ ...resultado, estado });
  } catch (error) {
    return handleApiError(error);
  }
}
