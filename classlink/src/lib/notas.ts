import type { Trimestre } from "@prisma/client";

export const TRIMESTRES: Trimestre[] = ["PRIMEIRO", "SEGUNDO", "TERCEIRO"];

export const TRIMESTRE_LABEL: Record<Trimestre, string> = {
  PRIMEIRO: "1º Trimestre",
  SEGUNDO: "2º Trimestre",
  TERCEIRO: "3º Trimestre",
};

// Pesos definidos pela escola: trabalho conta 3, teste conta 7, prova conta 10 (soma 20).
const PESO_TRABALHO = 3;
const PESO_TESTE = 7;
const PESO_PROVA = 10;
const PESO_TOTAL = PESO_TRABALHO + PESO_TESTE + PESO_PROVA;

export const MEDIA_APROVACAO = 6;

/** Média ponderada do trimestre. Retorna null enquanto alguma das 3 notas não foi lançada. */
export function calcMediaTrimestre(trabalho: number | null, teste: number | null, prova: number | null): number | null {
  if (trabalho === null || teste === null || prova === null) return null;
  const media = (trabalho * PESO_TRABALHO + teste * PESO_TESTE + prova * PESO_PROVA) / PESO_TOTAL;
  return Math.round(media * 100) / 100;
}

/** Média final = média simples das 3 médias trimestrais. Retorna null até os 3 trimestres estarem completos. */
export function calcMediaFinal(medias: (number | null)[]): number | null {
  if (medias.some((m) => m === null)) return null;
  const soma = (medias as number[]).reduce((acc, m) => acc + m, 0);
  return Math.round((soma / medias.length) * 100) / 100;
}

export function calcSituacao(mediaFinal: number | null): "APROVADO" | "REPROVADO" | "EM_ANDAMENTO" {
  if (mediaFinal === null) return "EM_ANDAMENTO";
  return mediaFinal >= MEDIA_APROVACAO ? "APROVADO" : "REPROVADO";
}
