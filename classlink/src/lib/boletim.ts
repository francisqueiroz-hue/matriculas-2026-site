import { prisma } from "@/lib/prisma";
import { TRIMESTRES, calcMediaFinal, calcMediaTrimestre, calcSituacao } from "@/lib/notas";
import type { Trimestre } from "@prisma/client";

export interface ValoresTrimestre {
  trabalho: number | null;
  teste: number | null;
  prova: number | null;
  media: number | null;
}

export interface LinhaBoletim {
  disciplinaId: string;
  nome: string;
  trimestres: Record<Trimestre, ValoresTrimestre>;
  mediaFinal: number | null;
  situacao: "APROVADO" | "REPROVADO" | "EM_ANDAMENTO";
}

type NotaBruta = { disciplinaId: string; trimestre: Trimestre; trabalho: unknown; teste: unknown; prova: unknown };

const numero = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v));

/** Linhas do boletim (uma por disciplina), a partir das disciplinas da escola e das notas do aluno. */
export function linhasDoBoletim(disciplinas: { id: string; nome: string }[], notas: NotaBruta[]): LinhaBoletim[] {
  return disciplinas.map((d) => {
    const trimestres = Object.fromEntries(
      TRIMESTRES.map((t) => {
        const nota = notas.find((n) => n.disciplinaId === d.id && n.trimestre === t);
        const trabalho = numero(nota?.trabalho);
        const teste = numero(nota?.teste);
        const prova = numero(nota?.prova);
        return [t, { trabalho, teste, prova, media: calcMediaTrimestre(trabalho, teste, prova) }];
      }),
    ) as Record<Trimestre, ValoresTrimestre>;
    const mediaFinal = calcMediaFinal(TRIMESTRES.map((t) => trimestres[t].media));
    return { disciplinaId: d.id, nome: d.nome, trimestres, mediaFinal, situacao: calcSituacao(mediaFinal) };
  });
}

/** Disciplinas da escola (em ordem alfabética), usadas em todos os boletins. */
export function disciplinasDaEscola(schoolId: string) {
  return prisma.disciplina.findMany({ where: { schoolId }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });
}

/** Boletim de um aluno (a permissão de quem vê é conferida na rota). */
export async function montarBoletim(schoolId: string, studentId: string): Promise<LinhaBoletim[]> {
  const [disciplinas, notas] = await Promise.all([disciplinasDaEscola(schoolId), prisma.nota.findMany({ where: { studentId } })]);
  return linhasDoBoletim(disciplinas, notas);
}
