import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoordenacaoOuAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/**
 * Lista enxuta de todos os alunos ativos da escola para a busca instantânea (emergência).
 *
 * Só direção e coordenação (a coordenação é conferida no banco a cada pedido, então tirar a
 * função vale na hora). Professor e família recebem 403. Devolve apenas o que a equipe usa
 * para localizar o aluno e falar com a família: turma, data de nascimento e responsáveis com
 * parentesco e contato. Nada financeiro, nenhum documento e nenhum dado de saúde.
 */
export async function GET() {
  try {
    const session = await requireCoordenacaoOuAdmin("Consulta de alunos restrita à direção e à coordenação");
    const alunos = await prisma.student.findMany({
      where: { schoolId: session.schoolId, deletedAt: null },
      select: {
        id: true,
        name: true,
        birthDate: true,
        class: { select: { id: true, name: true } },
        guardians: {
          where: { guardian: { deletedAt: null } },
          select: { relation: true, guardian: { select: { id: true, name: true, phone: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ alunos }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
