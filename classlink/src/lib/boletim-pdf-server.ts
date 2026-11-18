import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { disciplinasDaEscola, linhasDoBoletim } from "@/lib/boletim";
import { TRIMESTRES } from "@/lib/notas";
import { ErroDeUsuario } from "@/lib/erros";
import { gerarBoletimPdf, nomeArquivoBoletim, type BoletimParaImpressao } from "@/lib/boletim-pdf";
import { formatarNumero, localDataPadrao, modeloDe, type ModeloBoletim } from "@/lib/boletim-modelo";

type AlunoBoletim = { id: string; name: string; classId: string; class: { name: string; year: number } };

export const SELECT_ALUNO_BOLETIM = { id: true, name: true, classId: true, class: { select: { name: true, year: true } } } as const;

/** Modelo do boletim da escola (ou o padrão, se a escola ainda não salvou o seu). */
export async function carregarModeloBoletim(schoolId: string): Promise<ModeloBoletim> {
  const salvo = await prisma.boletimModelo.findUnique({ where: { schoolId }, select: { dados: true } });
  return modeloDe(salvo?.dados);
}

/**
 * Boletins já preenchidos com as notas lançadas (nota do trimestre = média ponderada do app),
 * prontos para a direção ou a coordenação ajustar antes de imprimir. Faltas e aulas dadas ficam
 * em branco: a frequência do app é por dia, não por disciplina nem por trimestre.
 */
export async function boletinsPreenchidos(schoolId: string, alunos: AlunoBoletim[], modelo: ModeloBoletim, agora = new Date()): Promise<BoletimParaImpressao[]> {
  const classIds = [...new Set(alunos.map((a) => a.classId))];
  const [disciplinas, notas, professores] = await Promise.all([
    disciplinasDaEscola(schoolId),
    prisma.nota.findMany({ where: { studentId: { in: alunos.map((a) => a.id) } } }),
    prisma.classTeacher.findMany({
      where: { classId: { in: classIds }, teacher: { active: true, deletedAt: null } },
      select: { classId: true, teacher: { select: { name: true } } },
      orderBy: { teacher: { name: "asc" } },
    }),
  ]);
  const localData = localDataPadrao(modelo.cidade, agora);
  return alunos.map((a) => {
    const linhas = linhasDoBoletim(disciplinas, notas.filter((n) => n.studentId === a.id));
    return {
      studentId: a.id,
      aluno: a.name,
      turma: a.class.name,
      linhas: linhas.map((l) => ({
        disciplina: l.nome,
        trimestres: TRIMESTRES.map((t) => {
          const m = l.trimestres[t].media;
          return { nota: m === null ? "" : formatarNumero(m), faltas: "" };
        }),
      })),
      aulasDadas: ["", "", ""],
      observacoes: "",
      localData,
      professor: professores
        .filter((p) => p.classId === a.classId)
        .map((p) => p.teacher.name)
        .join(" / "),
      coordenacao: modelo.coordenacao,
      responsavelPedagogico: modelo.responsavelPedagogico,
    };
  });
}

/** Alunos (da escola da sessão, não excluídos) pelos ids pedidos, na ordem pedida. 404 se faltar algum. */
export async function alunosDaEscola(schoolId: string, ids: string[]): Promise<AlunoBoletim[]> {
  const unicos = [...new Set(ids)];
  const alunos = await prisma.student.findMany({ where: { id: { in: unicos }, schoolId, deletedAt: null }, select: SELECT_ALUNO_BOLETIM });
  if (alunos.length !== unicos.length) throw new ErroDeUsuario("Aluno não encontrado.", 404);
  const porId = new Map(alunos.map((a) => [a.id, a]));
  return ids.map((id) => porId.get(id)!);
}

/** PDF para download (sem cache). */
export async function respostaPdf(modelo: ModeloBoletim, ano: number, boletins: BoletimParaImpressao[], nomeBase: string) {
  const pdf = await gerarBoletimPdf({ modelo, ano }, boletins);
  return new NextResponse(new Blob([Uint8Array.from(pdf)]), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivoBoletim(ano, nomeBase)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Download direto (sem edição): boletins preenchidos com o modelo salvo da escola. */
export async function respostaBoletimPdf(schoolId: string, alunos: AlunoBoletim[], nomeBase: string, ano: number) {
  const modelo = await carregarModeloBoletim(schoolId);
  return respostaPdf(modelo, ano, await boletinsPreenchidos(schoolId, alunos, modelo), nomeBase);
}
