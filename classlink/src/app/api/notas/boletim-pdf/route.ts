import { NextRequest } from "next/server";
import { exigirDirecaoOuCoordenacao, requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM } from "@/lib/equipe";
import { exigirArea } from "@/lib/visibilidade-server";
import { errosDoBoletim, pedidoPdfSchema } from "@/lib/boletim-modelo";
import { alunosDaEscola, respostaPdf } from "@/lib/boletim-pdf-server";

/**
 * PDF dos boletins revisados na tela (só direção e coordenação). Os valores ajustados valem só
 * para esta impressão: nada é gravado e as notas do app não mudam. O nome do aluno vem sempre do
 * cadastro, e cada aluno precisa ser desta escola.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "NOTAS");
    await exigirDirecaoOuCoordenacao(session, MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM);
    const { modelo, boletins } = pedidoPdfSchema.parse(await request.json());

    for (const b of boletins) {
      const erros = errosDoBoletim(b);
      if (erros.length) throw new ErroDeUsuario(erros[0]);
    }
    const alunos = await alunosDaEscola(session.schoolId, boletins.map((b) => b.studentId));
    const impressao = boletins.map((b, i) => ({ ...b, aluno: alunos[i].name }));
    const nomeBase = alunos.length === 1 ? alunos[0].name : `turma-${impressao[0].turma}`;
    return await respostaPdf(modelo, alunos[0].class.year, impressao, nomeBase);
  } catch (error) {
    return handleApiError(error);
  }
}
