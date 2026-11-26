import { z } from "zod";
import "@/lib/zod-sem-eval";

/**
 * Histórico escolar (Ensino Fundamental) no modelo da escola, emitido pela secretaria quando a
 * família pede (transferência, matrícula em outra escola, documentação).
 *
 * Duas camadas, como no boletim:
 *  - ModeloHistorico: o que vale para todos os históricos da escola (cabeçalho com mantenedora,
 *    CNPJ, endereço, portaria e reconhecimento; cidade; estabelecimento; quem assina; lista
 *    padrão de componentes e de anos). Salvo por escola (tabela HistoricoModelo).
 *  - HistoricoAluno: os dados de um aluno (identificação, código INEP, notas por ano, carga
 *    horária, frequência, resultado e os estudos realizados, inclusive em outras escolas por
 *    transferência). Salvo por aluno (tabela HistoricoEscolar), para não digitar de novo no
 *    ano seguinte.
 *
 * Este arquivo não acessa o banco: é usado também na tela.
 */

export const LIMITES_HISTORICO = {
  linhasCabecalho: 7,
  texto: 200,
  celula: 12,
  series: 9,
  disciplinas: 30,
  estudos: 15,
  observacoes: 800,
} as const;

const texto = (max: number = LIMITES_HISTORICO.texto) => z.string().trim().max(max);
const celula = texto(LIMITES_HISTORICO.celula);

const assinanteSchema = z.object({ cargo: texto(60), nome: texto(120), registro: texto(60) });
export type Assinante = z.infer<typeof assinanteSchema>;

export const modeloHistoricoSchema = z.object({
  cabecalho: z.array(texto()).max(LIMITES_HISTORICO.linhasCabecalho),
  titulo: texto(120),
  cidade: texto(80),
  /** Nome da escola na tabela de estudos realizados (o ano em curso já vem com ele). */
  estabelecimento: texto(120),
  assinantes: z.array(assinanteSchema).length(2),
  disciplinas: z.array(texto(80).min(1)).max(LIMITES_HISTORICO.disciplinas),
  series: z.array(texto(20).min(1)).min(1).max(LIMITES_HISTORICO.series),
});
export type ModeloHistorico = z.infer<typeof modeloHistoricoSchema>;

/** Ponto de partida, a partir do histórico que a escola já usa (arquivo .docx enviado pela direção). */
export const MODELO_HISTORICO_PADRAO: ModeloHistorico = {
  cabecalho: [
    "MANTENEDORA – INSTITUTO DE EDUCAÇÃO SIL FARIA LTDA",
    "CNPJ Nº: 29.946.447/0001-30",
    "Av. Professor Carlos Nelson Ferreira dos Santos, 658 – Camboinhas – Niterói – RJ",
    "CEP: 24.358-705 – Tel.: 3492-2852",
    "Portaria SEEDUC/SUGEN/AUT nº 472 de 08/04/2013 – D.O. de 10/04/2013",
    "Reconhecido pela Resolução SEEDUC nº 4.654, de 23/12/2010.",
  ],
  titulo: "HISTÓRICO ESCOLAR – ENSINO FUNDAMENTAL",
  cidade: "Niterói",
  estabelecimento: "Instituto Fokus",
  // Nomes e registros ficam em branco no código: a secretaria preenche uma vez na tela e salva
  // como padrão da escola.
  assinantes: [
    { cargo: "Secretária Escolar", nome: "", registro: "" },
    { cargo: "Diretora Pedagógica", nome: "", registro: "" },
  ],
  disciplinas: [
    "Língua Portuguesa",
    "História",
    "Matemática",
    "Ciências",
    "Geografia",
    "Educação Física",
    "Inglês",
    "Educação Ambiental",
    "Educação Financeira",
    "Orientação Educacional",
    "Arte",
  ],
  series: ["1º ano", "2º ano", "3º ano", "4º ano", "5º ano"],
};

/** Modelo gravado (ou o padrão), sempre completo mesmo se a versão gravada for antiga. */
export function modeloHistoricoDe(dados: unknown): ModeloHistorico {
  const r = modeloHistoricoSchema.partial().safeParse(dados);
  return { ...MODELO_HISTORICO_PADRAO, ...(r.success ? r.data : {}) };
}

const estudoSchema = z.object({ serie: texto(20), ano: texto(9), estabelecimento: texto(120), municipio: texto(80) });
export type EstudoRealizado = z.infer<typeof estudoSchema>;

export const historicoAlunoSchema = z
  .object({
    studentId: z.string().min(1).max(50),
    aluno: z.object({
      nome: texto(150).min(1, "Informe o nome do aluno."),
      codigoInep: texto(20),
      naturalidade: texto(80),
      nacionalidade: texto(40),
      nascimento: texto(10),
      filiacao: texto(300),
    }),
    series: z.array(texto(20).min(1)).min(1).max(LIMITES_HISTORICO.series),
    disciplinas: z.array(z.object({ nome: texto(80).min(1, "Componente sem nome."), notas: z.array(celula) })).max(LIMITES_HISTORICO.disciplinas),
    cargaHoraria: z.array(celula),
    frequencia: z.array(celula),
    resultado: z.array(texto(20)),
    estudos: z.array(estudoSchema).max(LIMITES_HISTORICO.estudos),
    observacoes: texto(LIMITES_HISTORICO.observacoes),
    localData: texto(120),
  })
  .superRefine((h, ctx) => {
    const n = h.series.length;
    const conferir = (lista: unknown[], caminho: (string | number)[]) => {
      if (lista.length !== n) ctx.addIssue({ code: "custom", path: caminho, message: "Quantidade de anos não confere." });
    };
    h.disciplinas.forEach((d, i) => conferir(d.notas, ["disciplinas", i, "notas"]));
    conferir(h.cargaHoraria, ["cargaHoraria"]);
    conferir(h.frequencia, ["frequencia"]);
    conferir(h.resultado, ["resultado"]);
  });
export type HistoricoAluno = z.infer<typeof historicoAlunoSchema>;

export const pedidoPdfHistoricoSchema = z.object({ modelo: modeloHistoricoSchema, historico: historicoAlunoSchema });

/** Lista vazia com uma posição por ano. */
export const vazios = (n: number) => Array.from({ length: n }, () => "");

/** Ajusta as colunas de anos de um histórico (ao incluir ou tirar um ano na tela). */
export function ajustarColunas(h: HistoricoAluno, series: string[]): HistoricoAluno {
  const ajustar = (lista: string[]) => series.map((_, i) => lista[i] ?? "");
  return {
    ...h,
    series,
    disciplinas: h.disciplinas.map((d) => ({ ...d, notas: ajustar(d.notas) })),
    cargaHoraria: ajustar(h.cargaHoraria),
    frequencia: ajustar(h.frequencia),
    resultado: ajustar(h.resultado),
  };
}

/** Texto sem acento e em minúsculas, para casar nomes de componentes ("Educação Física" = "educacao fisica"). */
export function normalizarNome(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Coluna do ano (série) a partir do nome da turma: "1º ano A", "1° Ano", "1 ano" → "1º ano".
 * Devolve o índice na lista de anos do histórico, ou -1 se a turma não indica o ano.
 */
export function colunaDaTurma(turma: string, series: string[]): number {
  const m = normalizarNome(turma).match(/(\d)\s*(?:o\s*)?ano/);
  if (!m) return -1;
  return series.findIndex((s) => {
    const ms = normalizarNome(s).match(/(\d)\s*(?:o\s*)?ano/);
    return ms?.[1] === m[1];
  });
}

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);

/**
 * Mesmo componente, aceitando abreviações: "L. Portuguesa" = "Língua Portuguesa",
 * "Ed. Física" = "Educação Física", "Orient. Educ" = "Orientação Educacional", "Artes" = "Arte".
 * Cada palavra de um nome precisa ser o começo da palavra correspondente do outro.
 */
export function mesmoComponente(a: string, b: string): boolean {
  const pa = normalizarNome(a).split(" ").filter((p) => p && !LIGACOES.has(p));
  const pb = normalizarNome(b).split(" ").filter((p) => p && !LIGACOES.has(p));
  if (!pa.length || pa.length !== pb.length) return false;
  return pa.every((x, i) => x.startsWith(pb[i]) || pb[i].startsWith(x));
}

/**
 * Coloca as médias do app na coluna do ano. Casa pelo nome (sem acento, aceitando abreviações);
 * componentes do app que não estão na lista entram no fim.
 */
export function aplicarMedias(h: HistoricoAluno, coluna: number, medias: Map<string, { nome: string; media: string }>): { historico: HistoricoAluno; preenchidas: number } {
  if (coluna < 0 || !medias.size) return { historico: h, preenchidas: 0 };
  let preenchidas = 0;
  const restantes = [...medias.values()];
  const disciplinas = h.disciplinas.map((d) => {
    const i = restantes.findIndex((m) => mesmoComponente(m.nome, d.nome));
    if (i < 0) return d;
    const [m] = restantes.splice(i, 1);
    preenchidas++;
    return { ...d, notas: d.notas.map((v, j) => (j === coluna ? m.media : v)) };
  });
  for (const m of restantes) {
    preenchidas++;
    disciplinas.push({ nome: m.nome, notas: h.series.map((_, j) => (j === coluna ? m.media : "")) });
  }
  return { historico: { ...h, disciplinas }, preenchidas };
}

/** "2026-03-09T00:00:00Z" → "09/03/2026" (data do cadastro, sem fuso). */
export function dataBr(iso: Date | string | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** "Niterói, 26 de novembro de 2026." no fuso de São Paulo. */
export function localDataHistorico(cidade: string, agora: Date = new Date()): string {
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [d, m, a] = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).split("/").map(Number);
  return `${cidade ? `${cidade}, ` : ""}${d} de ${meses[m - 1]} de ${a}.`;
}

/** Avisos (não bloqueiam o PDF): o que costuma faltar num histórico. */
export function pendenciasDoHistorico(h: HistoricoAluno, modelo: ModeloHistorico): string[] {
  const p: string[] = [];
  if (!h.aluno.codigoInep) p.push("Código Censo INEP do aluno em branco.");
  if (!h.aluno.nascimento) p.push("Data de nascimento em branco.");
  if (!h.aluno.naturalidade) p.push("Naturalidade em branco.");
  if (!h.aluno.filiacao) p.push("Filiação em branco.");
  if (h.aluno.codigoInep && !/^\d{12}$/.test(h.aluno.codigoInep)) p.push("O código INEP do aluno costuma ter 12 dígitos: confira.");
  if (h.aluno.nascimento && !/^\d{2}\/\d{2}\/\d{4}$/.test(h.aluno.nascimento)) p.push("Data de nascimento: use dd/mm/aaaa.");
  if (!h.estudos.length) p.push("Nenhum estudo realizado informado (série, ano e escola).");
  modelo.assinantes.forEach((a) => {
    if (!a.nome) p.push(`Nome de quem assina como ${a.cargo || "responsável"} em branco.`);
  });
  return p;
}

/** Nome de arquivo seguro: "historico-escolar-maria-silva.pdf". */
export function nomeArquivoHistorico(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `historico-escolar-${slug || "aluno"}.pdf`;
}
