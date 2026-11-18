import { z } from "zod";
import "@/lib/zod-sem-eval";
import { MEDIA_APROVACAO } from "@/lib/notas";

/**
 * Boletim impresso no modelo da escola (Espaço Kids / Instituto Fokus).
 *
 * Duas camadas:
 *  - ModeloBoletim: o que vale para todos os boletins da escola (cabeçalho com a portaria, cidade,
 *    rodapé com endereço e contatos, nomes de quem assina). Salvo por escola (tabela BoletimModelo).
 *  - BoletimEditavel: os dados de um aluno já preenchidos com as notas lançadas, que a direção ou a
 *    coordenação pode ajustar só para esta impressão. Nada disso altera as notas gravadas.
 */

export const LIMITES = {
  linhasCabecalho: 5,
  linhasRodape: 3,
  texto: 200,
  observacoes: 600,
  disciplinas: 60,
  boletinsPorPdf: 80,
} as const;

const texto = (max: number = LIMITES.texto) => z.string().trim().max(max);

export const modeloBoletimSchema = z.object({
  cabecalho: z.array(texto()).max(LIMITES.linhasCabecalho),
  cidade: texto(80),
  rodape: z.array(texto()).max(LIMITES.linhasRodape),
  coordenacao: texto(120),
  responsavelPedagogico: texto(120),
  mostrarGrafico: z.boolean(),
});
export type ModeloBoletim = z.infer<typeof modeloBoletimSchema>;

/**
 * Ponto de partida, a partir do boletim que a escola já usa. Os números da portaria foram lidos de
 * uma imagem em baixa resolução: a direção confere e corrige na tela antes de imprimir.
 */
export const MODELO_PADRAO: ModeloBoletim = {
  cabecalho: [
    "Portaria SEEDUC/SUGEN/AUT nº 472 de 08/04/2013 D.O. de 10/04/2013",
    "Reconhecido pela Resolução SEEDUC nº 4.654 de 23/12/2010.",
    "BOLETIM ESCOLAR — ENSINO FUNDAMENTAL I",
  ],
  cidade: "Niterói",
  rodape: [
    "Rua Professor Carlos Nelson Ferreira dos Santos, nº 658 – Camboinhas – Niterói – RJ",
    "Tel.: (21) 3492-2852 – (21) 96469-9441 – e-mail: secretaria@institutofokus.com.br",
  ],
  coordenacao: "",
  responsavelPedagogico: "",
  mostrarGrafico: true,
};

/** Modelo gravado (ou o padrão), sempre completo mesmo se a versão gravada for antiga. */
export function modeloDe(dados: unknown): ModeloBoletim {
  const r = modeloBoletimSchema.partial().safeParse(dados);
  return { ...MODELO_PADRAO, ...(r.success ? r.data : {}) };
}

/** Nota/faltas como texto do formulário ("8,5"); vazio = não lançado. */
const valorCelula = z.string().trim().max(6);

const trimestreEditavel = z.object({ nota: valorCelula, faltas: valorCelula });

export const boletimEditavelSchema = z.object({
  studentId: z.string().min(1).max(50),
  turma: texto(80),
  linhas: z
    .array(z.object({ disciplina: texto(80).min(1), trimestres: z.array(trimestreEditavel).length(3) }))
    .max(LIMITES.disciplinas),
  /** Aulas dadas em cada trimestre (para a % de frequência); vazio = não informado. */
  aulasDadas: z.array(valorCelula).length(3),
  observacoes: texto(LIMITES.observacoes),
  localData: texto(120),
  professor: texto(120),
  coordenacao: texto(120),
  responsavelPedagogico: texto(120),
});
export type BoletimEditavel = z.infer<typeof boletimEditavelSchema>;

export const pedidoPdfSchema = z.object({
  modelo: modeloBoletimSchema,
  boletins: z.array(boletimEditavelSchema).min(1).max(LIMITES.boletinsPorPdf),
});

/** "8,5" | "8.5" → 8.5; vazio → null; fora de 0–10 ou inválido → erro de validação (undefined). */
export function lerNota(v: string): number | null | undefined {
  const t = v.trim().replace(",", ".");
  if (!t || t === "—" || t === "-") return null;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 0 && n <= 10 ? n : undefined;
}

/** Faltas/aulas: inteiro de 0 a 999; vazio → null; inválido → undefined. */
export function lerInteiro(v: string): number | null | undefined {
  const t = v.trim();
  if (!t || t === "—" || t === "-") return null;
  if (!/^\d{1,3}$/.test(t)) return undefined;
  return Number(t);
}

export function formatarNumero(v: number | null, casas = 2): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: casas });
}

export type Situacao = "Aprovado" | "Reprovado" | "Em andamento";

export interface LinhaCalculada {
  disciplina: string;
  trimestres: { nota: number | null; faltas: number | null; freq: number | null }[];
  media: number | null;
  /** Média dos trimestres com nota (para o gráfico enquanto o ano não fecha). */
  mediaParcial: number | null;
  faltasTotal: number | null;
  freqTotal: number | null;
  situacao: Situacao;
}

const arred = (n: number) => Math.round(n * 100) / 100;

/** % de frequência: (aulas − faltas) / aulas. Sem aulas informadas não dá para calcular. */
function frequencia(aulas: number | null, faltas: number | null): number | null {
  if (aulas === null || aulas === 0) return null;
  return Math.max(0, Math.round(((aulas - (faltas ?? 0)) / aulas) * 100));
}

/**
 * Média, frequência e situação a partir do que está no formulário (valores já validados). Mesma
 * regra do app: média final = média dos 3 trimestres; aprovado com média final ≥ 6.
 */
export function calcularLinhas(b: BoletimEditavel): LinhaCalculada[] {
  const aulas = b.aulasDadas.map((a) => lerInteiro(a) ?? null);
  const aulasTotal = aulas.every((a) => a !== null) ? (aulas as number[]).reduce((s, a) => s + a, 0) : null;
  return b.linhas.map((l) => {
    const trimestres = l.trimestres.map((t, i) => {
      const nota = lerNota(t.nota) ?? null;
      const faltas = lerInteiro(t.faltas) ?? null;
      return { nota, faltas, freq: frequencia(aulas[i], faltas) };
    });
    const notas = trimestres.map((t) => t.nota);
    const lancadas = notas.filter((n): n is number => n !== null);
    const media = lancadas.length === 3 ? arred(lancadas.reduce((s, n) => s + n, 0) / 3) : null;
    const mediaParcial = lancadas.length ? arred(lancadas.reduce((s, n) => s + n, 0) / lancadas.length) : null;
    const faltasLancadas = trimestres.map((t) => t.faltas).filter((f): f is number => f !== null);
    const faltasTotal = faltasLancadas.length ? faltasLancadas.reduce((s, f) => s + f, 0) : null;
    const situacao: Situacao = media === null ? "Em andamento" : media >= MEDIA_APROVACAO ? "Aprovado" : "Reprovado";
    return { disciplina: l.disciplina, trimestres, media, mediaParcial, faltasTotal, freqTotal: frequencia(aulasTotal, faltasTotal), situacao };
  });
}

/** Lista de problemas do formulário (vazia = pode gerar o PDF). */
export function errosDoBoletim(b: BoletimEditavel): string[] {
  const erros: string[] = [];
  b.linhas.forEach((l) =>
    l.trimestres.forEach((t, i) => {
      if (lerNota(t.nota) === undefined) erros.push(`${l.disciplina}, ${i + 1}º trimestre: nota "${t.nota}" inválida (use 0 a 10).`);
      if (lerInteiro(t.faltas) === undefined) erros.push(`${l.disciplina}, ${i + 1}º trimestre: faltas "${t.faltas}" inválidas.`);
    }),
  );
  b.aulasDadas.forEach((a, i) => {
    if (lerInteiro(a) === undefined) erros.push(`Aulas dadas no ${i + 1}º trimestre: "${a}" inválido.`);
  });
  return erros;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Niterói, 18 de novembro de 2026." no fuso de São Paulo. */
export function localDataPadrao(cidade: string, agora: Date = new Date()): string {
  const [d, m, a] = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).split("/").map(Number);
  return `${cidade ? `${cidade}, ` : ""}${d} de ${MESES[m - 1]} de ${a}.`;
}
