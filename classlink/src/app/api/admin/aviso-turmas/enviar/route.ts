import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDirecao } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { envioAvisoTurmasSchema } from "@/lib/validators";
import { planejarDaEscola } from "@/lib/lembretes-server";
import { TIPOS_AVISO_TURMAS } from "@/lib/aviso-turmas";
import { carregarAvisoTurmas, enviarAvisoTurmasManual, responsaveisJaAvisados } from "@/lib/aviso-turmas-server";

/**
 * Envio manual do aviso de definição das turmas a um responsável (caso excepcional), com o texto
 * salvo ou um texto só para esta família. Funciona mesmo com o automático desligado. Se a família
 * já recebeu, a direção precisa confirmar (`repetir`) para mandar de novo.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireDirecao();
    const body = envioAvisoTurmasSchema.parse(await request.json());

    const responsavel = await prisma.user.findFirst({
      where: { id: body.responsavelId, schoolId: session.schoolId, role: "GUARDIAN", active: true, deletedAt: null },
      select: { id: true, studentLinks: { where: { student: { deletedAt: null } }, select: { student: { select: { name: true } } } } },
    });
    if (!responsavel) return NextResponse.json({ error: "Responsável não encontrado" }, { status: 404 });

    if (!body.repetir && (await responsaveisJaAvisados(session.schoolId)).has(responsavel.id)) {
      return NextResponse.json(
        { error: "Esta família já recebeu o aviso. Confirme se quer enviar de novo.", jaRecebeu: true },
        { status: 409 },
      );
    }

    // Alunos citados: os que têm a matrícula pendente agora; sem pendência, todos os do responsável.
    const { plano } = await planejarDaEscola(session.schoolId);
    const pendentes = plano.avaliadas.filter((a) => a.responsavelId === responsavel.id && TIPOS_AVISO_TURMAS.includes(a.tipo));
    const alunos = pendentes.length ? [...new Set(pendentes.map((p) => p.aluno))] : responsavel.studentLinks.map((s) => s.student.name);
    const url = pendentes.length && pendentes.every((p) => p.tipo === "CONTRATO") ? "/dashboard/contratos" : "/dashboard";

    const { modelo } = await carregarAvisoTurmas(session.schoolId);
    const { canal } = await enviarAvisoTurmasManual(session.schoolId, {
      responsavelId: responsavel.id,
      enviadoPorId: session.sub,
      modelo: { titulo: body.titulo ?? modelo.titulo, texto: body.texto ?? modelo.texto },
      alunos,
      url,
    });
    if (canal === "nenhum") {
      return NextResponse.json(
        { error: "Não foi possível enviar: a família não tem o app com notificação ativa nem WhatsApp disponível. Avise por telefone." },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, canal }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
