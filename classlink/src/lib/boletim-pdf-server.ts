import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { disciplinasDaEscola, linhasDoBoletim } from "@/lib/boletim";
import { gerarBoletimPdf, nomeArquivoBoletim, type BoletimParaImpressao } from "@/lib/boletim-pdf";

type AlunoBoletim = { id: string; name: string; class: { name: string; year: number } };

/** Monta os boletins dos alunos e devolve o PDF (download, sem cache). */
export async function respostaBoletimPdf(schoolId: string, alunos: AlunoBoletim[], nomeBase: string, ano: number) {
  const [escola, disciplinas, notas] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    disciplinasDaEscola(schoolId),
    prisma.nota.findMany({ where: { studentId: { in: alunos.map((a) => a.id) } } }),
  ]);
  const boletins: BoletimParaImpressao[] = alunos.map((a) => ({
    aluno: a.name,
    turma: a.class.name,
    linhas: linhasDoBoletim(disciplinas, notas.filter((n) => n.studentId === a.id)),
  }));
  const pdf = await gerarBoletimPdf({ escola: escola?.name ?? "Escola", ano }, boletins);
  return new NextResponse(new Blob([Uint8Array.from(pdf)]), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivoBoletim(ano, nomeBase)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
