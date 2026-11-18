import { z } from "zod";
import "@/lib/zod-sem-eval";

/**
 * Rotina diária da educação infantil (ficha em papel da escola, agora no app).
 * Este arquivo não acessa o banco: é usado também no navegador.
 */

export const REFEICOES = [
  { campo: "colacao", rotulo: "Colação" },
  { campo: "almoco", rotulo: "Almoço" },
  { campo: "lanche", rotulo: "Lanche" },
  { campo: "janta", rotulo: "Janta" },
] as const;
export type CampoRefeicao = (typeof REFEICOES)[number]["campo"];

/** Aceitação da refeição, na ordem da ficha: o primeiro (frutas) é "comeu tudo". */
export const ACEITACAO = [
  { valor: "TUDO", emoji: "🥗", rotulo: "Comeu tudo" },
  { valor: "BEM", emoji: "🙂", rotulo: "Comeu bem" },
  { valor: "POUCO", emoji: "😐", rotulo: "Comeu pouco" },
  { valor: "NADA", emoji: "☹️", rotulo: "Não comeu" },
] as const;
export type Aceitacao = (typeof ACEITACAO)[number]["valor"];

export const SONO = [
  { valor: "MANHA", rotulo: "Manhã" },
  { valor: "TARDE", rotulo: "Tarde" },
  { valor: "NAO", rotulo: "Não" },
] as const;

export const EVACUACAO = [
  { valor: "NORMAL", rotulo: "Normal" },
  { valor: "PASTOSA", rotulo: "Pastosa" },
  { valor: "LIQUIDA", rotulo: "Líquida" },
  { valor: "NAO", rotulo: "Não" },
] as const;

export const MAX_MEDICACOES = 6;
export const DIAS_PADRAO = 14;
export const DIAS_MAXIMO = 62;
export const FUSO_ESCOLA = "America/Sao_Paulo";

export interface Medicacao {
  horario: string;
  nome: string;
  dosagem: string;
  responsavel: string;
}

export interface RotinaDados {
  colacao: Aceitacao | null;
  almoco: Aceitacao | null;
  lanche: Aceitacao | null;
  janta: Aceitacao | null;
  sono: string[];
  evacuacao: string[];
  banho: boolean | null;
  medicacoes: Medicacao[];
  observacoes: string | null;
}

export interface RotinaSalva extends RotinaDados {
  /** AAAA-MM-DD */
  data: string;
  preenchidoPorNome: string;
  atualizadoEm: string;
}

export const ROTINA_VAZIA: RotinaDados = {
  colacao: null,
  almoco: null,
  lanche: null,
  janta: null,
  sono: [],
  evacuacao: [],
  banho: null,
  medicacoes: [],
  observacoes: null,
};

const valores = <T extends readonly { valor: string }[]>(lista: T) =>
  lista.map((i) => i.valor) as unknown as [T[number]["valor"], ...T[number]["valor"][]];

const textoCurto = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres`);

/** "Não" exclui as outras opções; sem repetição. */
function opcoesExclusivas(lista: string[]): string[] {
  const unicos = [...new Set(lista)];
  return unicos.includes("NAO") ? ["NAO"] : unicos;
}

const aceitacao = z.enum(valores(ACEITACAO)).nullable().default(null);

const medicacaoSchema = z.object({
  horario: z
    .string()
    .trim()
    .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Horário no formato 00:00")
    .default(""),
  nome: textoCurto(120).default(""),
  dosagem: textoCurto(80).default(""),
  responsavel: textoCurto(120).default(""),
});

export const salvarRotinaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  colacao: aceitacao,
  almoco: aceitacao,
  lanche: aceitacao,
  janta: aceitacao,
  sono: z.array(z.enum(valores(SONO))).max(SONO.length).default([]).transform(opcoesExclusivas),
  evacuacao: z.array(z.enum(valores(EVACUACAO))).max(EVACUACAO.length).default([]).transform(opcoesExclusivas),
  banho: z.boolean().nullable().default(null),
  medicacoes: z
    .array(medicacaoSchema)
    .max(MAX_MEDICACOES, `No máximo ${MAX_MEDICACOES} medicações por dia`)
    .default([])
    // Linhas em branco são ignoradas; linha com algum dado precisa do nome do remédio.
    .transform((lista) => lista.filter((m) => m.horario || m.nome || m.dosagem || m.responsavel))
    .refine((lista) => lista.every((m) => m.nome), "Informe o nome do remédio em cada medicação"),
  observacoes: textoCurto(2000)
    .nullable()
    .default(null)
    .transform((t) => (t ? t : null)),
});
export type SalvarRotina = z.infer<typeof salvarRotinaSchema>;

/** Data de hoje (AAAA-MM-DD) no fuso da escola. */
export function hojeNaEscola(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_ESCOLA, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Data válida no calendário e não futura (a rotina é do dia que passou ou de hoje). */
export function validarDataRotina(data: string, agora: Date = new Date()): string | null {
  const d = new Date(`${data}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) return "Data inválida";
  if (data > hojeNaEscola(agora)) return "A rotina não pode ser de um dia futuro";
  return null;
}

/** Converte AAAA-MM-DD para o Date gravado na coluna DATE. */
export function dataParaBanco(data: string): Date {
  return new Date(`${data}T00:00:00Z`);
}

/** Primeiro dia (AAAA-MM-DD) da janela dos últimos `dias` dias, contando hoje. */
export function inicioDaJanela(dias: number, agora: Date = new Date()): string {
  const hoje = dataParaBanco(hojeNaEscola(agora));
  hoje.setUTCDate(hoje.getUTCDate() - (dias - 1));
  return hoje.toISOString().slice(0, 10);
}

/** Algo foi preenchido? (salvar tudo em branco é recusado) */
export function rotinaTemDados(r: RotinaDados): boolean {
  return Boolean(
    r.colacao ||
      r.almoco ||
      r.lanche ||
      r.janta ||
      r.sono.length ||
      r.evacuacao.length ||
      r.banho !== null ||
      r.medicacoes.length ||
      r.observacoes,
  );
}

/** Lê a lista de medicações gravada (JSON), descartando o que não tiver o formato esperado. */
export function medicacoesDoBanco(valor: unknown): Medicacao[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
    .map((m) => ({
      horario: typeof m.horario === "string" ? m.horario : "",
      nome: typeof m.nome === "string" ? m.nome : "",
      dosagem: typeof m.dosagem === "string" ? m.dosagem : "",
      responsavel: typeof m.responsavel === "string" ? m.responsavel : "",
    }))
    .filter((m) => m.nome);
}

const ehAceitacao = (v: unknown): v is Aceitacao => ACEITACAO.some((a) => a.valor === v);

/** Linha do banco → formato da tela. */
export function rotinaDoBanco(linha: {
  data: Date;
  colacao: string | null;
  almoco: string | null;
  lanche: string | null;
  janta: string | null;
  sono: string[];
  evacuacao: string[];
  banho: boolean | null;
  medicacoes: unknown;
  observacoes: string | null;
  preenchidoPorNome: string;
  atualizadoEm: Date;
}): RotinaSalva {
  return {
    data: linha.data.toISOString().slice(0, 10),
    colacao: ehAceitacao(linha.colacao) ? linha.colacao : null,
    almoco: ehAceitacao(linha.almoco) ? linha.almoco : null,
    lanche: ehAceitacao(linha.lanche) ? linha.lanche : null,
    janta: ehAceitacao(linha.janta) ? linha.janta : null,
    sono: linha.sono ?? [],
    evacuacao: linha.evacuacao ?? [],
    banho: linha.banho,
    medicacoes: medicacoesDoBanco(linha.medicacoes),
    observacoes: linha.observacoes,
    preenchidoPorNome: linha.preenchidoPorNome,
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

/** "18/11/2026" a partir de AAAA-MM-DD. */
export function dataCurta(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/** "qua., 18/11" a partir de AAAA-MM-DD (dia da semana calculado em UTC: a data não tem hora). */
export function dataComDiaDaSemana(data: string): string {
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" }).format(dataParaBanco(data));
  return `${dia} ${dataCurta(data)}`;
}

/**
 * Aviso no app para a família. Só diz que a rotina está disponível: nenhum dado de saúde
 * (medicação, evacuação) vai no texto da notificação, que aparece na tela bloqueada do celular.
 */
export function avisoRotinaFamilia(nomeAluno: string, data: string): { title: string; body: string } {
  const primeiroNome = nomeAluno.trim().split(/\s+/)[0] ?? nomeAluno;
  return {
    title: "Rotina do dia",
    body: `A rotina de ${primeiroNome} de ${dataCurta(data)} está disponível no app.`,
  };
}
