import { z } from "zod";
import "@/lib/zod-sem-eval";
import type { SolicitacaoMatriculaStatus, SolicitacaoMatriculaTipo } from "@prisma/client";
import { normalizePhoneBR } from "@/lib/whatsapp";
import { ErroDeUsuario } from "@/lib/erros";
import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";
import { celulaCsv } from "@/lib/csv";

/**
 * Pré-matrículas e rematrículas enviadas pelos formulários públicos. O endpoint público
 * aceita envios de outros domínios (a página também roda no GitHub Pages/Hostinger), por
 * isso responde com CORS aberto — sem cookies — e tem limite de envios por IP.
 */

const texto = (max: number) => z.string().trim().max(max);
const opcional = (max: number) =>
  texto(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Como a família conheceu a escola (pergunta opcional do formulário de pré-matrícula).
 * Guardado como texto: novos canais entram aqui sem migração.
 */
export const COMO_CONHECEU = {
  INDICACAO: "Indicação de outra família",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  GOOGLE: "Google / Maps",
  FACHADA: "Passei em frente à escola",
  EVENTO: "Evento ou panfleto",
  OUTRO: "Outro",
} as const;
export type ComoConheceu = keyof typeof COMO_CONHECEU;
const CHAVES_COMO_CONHECEU = Object.keys(COMO_CONHECEU) as [ComoConheceu, ...ComoConheceu[]];

/** Rótulo do canal, ou "Não informado" para envios antigos ou sem resposta. */
export function rotuloComoConheceu(valor: string | null | undefined): string {
  return valor && valor in COMO_CONHECEU ? COMO_CONHECEU[valor as ComoConheceu] : "Não informado";
}

/** Campanha do link (utm_source/utm_campaign): só letras, números, "-", "_" e ".", em minúsculas. */
export function limparCampanha(valor: string | null | undefined): string | undefined {
  const limpo = (valor ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 60);
  return limpo || undefined;
}

export const solicitacaoPublicaSchema = z.object({
  tipo: z.enum(["PRE_MATRICULA", "REMATRICULA"]),
  origem: z.enum(["SITE", "CLASSLINK"]).default("SITE"),
  responsavelNome: texto(80).pipe(z.string().min(3, "Informe o nome do responsável")),
  telefone: texto(20).refine((v) => normalizePhoneBR(v) !== null, "Telefone inválido"),
  alunoNome: texto(120).pipe(z.string().min(2, "Informe o nome do aluno")),
  serie: texto(60).pipe(z.string().min(1, "Informe a série")),
  periodoVisita: opcional(20),
  escolaAtual: opcional(80),
  observacoes: opcional(500),
  // Captação (opcionais): valor desconhecido vira "não informado" em vez de recusar o envio.
  comoConheceu: z
    .string()
    .optional()
    .transform((v) => (CHAVES_COMO_CONHECEU as string[]).includes(v ?? "") ? (v as ComoConheceu) : undefined),
  indicadoPor: opcional(80),
  campanha: z.string().max(200).optional().transform(limparCampanha),
  consentimento: z.literal(true, { message: "É preciso autorizar o contato" }),
  // Campo-armadilha invisível para robôs: pessoas nunca preenchem.
  website: z.string().max(0).optional(),
});

export type SolicitacaoPublica = z.infer<typeof solicitacaoPublicaSchema>;

export const atualizarSolicitacaoSchema = z.object({
  status: z.enum(["NOVA", "EM_ATENDIMENTO", "VISITA_AGENDADA", "MATRICULADO", "DESISTIU"]).optional(),
  observacoesInternas: z.string().trim().max(2000).optional(),
});

/** Ano letivo das solicitações: o da campanha vigente. */
export const ANO_LETIVO_MATRICULAS = CAMPANHA_REMATRICULA.ano;

/** Máximo de envios por IP na janela abaixo (protege contra spam no formulário público). */
export const LIMITE_ENVIOS_POR_IP = 5;
export const JANELA_LIMITE_MS = 10 * 60 * 1000;

export const TIPO_LABEL: Record<SolicitacaoMatriculaTipo, string> = {
  PRE_MATRICULA: "Pré-matrícula",
  REMATRICULA: "Rematrícula",
};

export const STATUS_LABEL: Record<SolicitacaoMatriculaStatus, string> = {
  NOVA: "Nova",
  EM_ATENDIMENTO: "Em atendimento",
  VISITA_AGENDADA: "Visita agendada",
  MATRICULADO: "Matriculado",
  DESISTIU: "Desistiu",
};

/** Telefone salvo só com dígitos e DDI 55 — ex.: (21) 98765-4321 → 5521987654321. */
export function normalizarTelefone(telefone: string): string {
  const normalizado = normalizePhoneBR(telefone);
  if (!normalizado) throw new ErroDeUsuario("Telefone inválido");
  return normalizado;
}

/** 5521987654321 → (21) 98765-4321, para exibição. */
export function formatarTelefone(telefone: string): string {
  const d = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

export function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

/** Horas sem retorno a partir das quais uma pré-matrícula "Nova" é destacada como parada. */
export const HORAS_SEM_RETORNO = 24;

export interface SolicitacaoFunil {
  tipo: SolicitacaoMatriculaTipo;
  status: SolicitacaoMatriculaStatus;
  comoConheceu: string | null;
  createdAt: Date;
  primeiroContatoEm: Date | null;
}

export interface CanalFunil {
  canal: string;
  rotulo: string;
  leads: number;
  matriculados: number;
}

export interface FunilCaptacao {
  leads: number;
  atendidos: number;
  visitas: number;
  matriculados: number;
  desistencias: number;
  semRetorno: number;
  /** Mediana, em horas, entre o envio e o 1º retorno (só solicitações com o momento registrado). */
  horasAtePrimeiroContato: number | null;
  /** Leads que viraram matrícula, em % (0–100, uma casa decimal); null sem leads. */
  conversao: number | null;
  canais: CanalFunil[];
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/** Pré-matrícula sem nenhum retorno da equipe há mais de HORAS_SEM_RETORNO. */
export function semRetorno(s: Pick<SolicitacaoFunil, "tipo" | "status" | "createdAt">, agora = new Date()): boolean {
  return s.tipo === "PRE_MATRICULA" && s.status === "NOVA" && agora.getTime() - s.createdAt.getTime() > HORAS_SEM_RETORNO * 3_600_000;
}

/**
 * Funil das pré-matrículas (famílias novas): lead → atendido → visita → matrícula, com a
 * conversão por canal de origem. Rematrículas ficam de fora: já são da escola.
 * "Visitas" conta quem chegou à visita (agendada) ou além (matriculado).
 */
export function calcularFunil(itens: SolicitacaoFunil[], agora = new Date()): FunilCaptacao {
  const pre = itens.filter((s) => s.tipo === "PRE_MATRICULA");
  const porCanal = new Map<string, CanalFunil>();
  for (const s of pre) {
    const canal = s.comoConheceu && s.comoConheceu in COMO_CONHECEU ? s.comoConheceu : "NAO_INFORMADO";
    const linha = porCanal.get(canal) ?? { canal, rotulo: rotuloComoConheceu(s.comoConheceu), leads: 0, matriculados: 0 };
    linha.leads += 1;
    if (s.status === "MATRICULADO") linha.matriculados += 1;
    porCanal.set(canal, linha);
  }
  const matriculados = pre.filter((s) => s.status === "MATRICULADO").length;
  const horas = pre
    .filter((s) => s.primeiroContatoEm)
    .map((s) => Math.max(0, (s.primeiroContatoEm!.getTime() - s.createdAt.getTime()) / 3_600_000));
  const med = mediana(horas);
  return {
    leads: pre.length,
    atendidos: pre.filter((s) => s.status !== "NOVA" && !(s.status === "DESISTIU" && !s.primeiroContatoEm)).length,
    visitas: pre.filter((s) => s.status === "VISITA_AGENDADA" || s.status === "MATRICULADO").length,
    matriculados,
    desistencias: pre.filter((s) => s.status === "DESISTIU").length,
    semRetorno: pre.filter((s) => semRetorno(s, agora)).length,
    horasAtePrimeiroContato: med === null ? null : Math.round(med * 10) / 10,
    conversao: pre.length ? Math.round((matriculados / pre.length) * 1000) / 10 : null,
    canais: [...porCanal.values()].sort((a, b) => b.leads - a.leads || a.rotulo.localeCompare(b.rotulo)),
  };
}

export interface SolicitacaoCsv {
  createdAt: Date;
  tipo: SolicitacaoMatriculaTipo;
  status: SolicitacaoMatriculaStatus;
  responsavelNome: string;
  telefone: string;
  alunoNome: string;
  serie: string | null;
  periodoVisita: string | null;
  escolaAtual: string | null;
  observacoes: string | null;
  observacoesInternas: string | null;
  comoConheceu?: string | null;
  indicadoPor?: string | null;
  campanha?: string | null;
}

export function solicitacoesParaCsv(itens: SolicitacaoCsv[]): string {
  const cabecalho = [
    "Data",
    "Tipo",
    "Status",
    "Responsável",
    "Telefone",
    "Aluno(s)",
    "Série",
    "Período p/ visita",
    "Escola atual",
    "Observações da família",
    "Anotações internas",
    "Como conheceu",
    "Indicado por",
    "Campanha",
  ];
  const linhas = itens.map((s) =>
    [
      s.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      TIPO_LABEL[s.tipo],
      STATUS_LABEL[s.status],
      s.responsavelNome,
      formatarTelefone(s.telefone),
      s.alunoNome,
      s.serie ?? "",
      s.periodoVisita ?? "",
      s.escolaAtual ?? "",
      s.observacoes ?? "",
      s.observacoesInternas ?? "",
      s.tipo === "PRE_MATRICULA" ? rotuloComoConheceu(s.comoConheceu) : "",
      s.indicadoPor ?? "",
      s.campanha ?? "",
    ]
      .map(celulaCsv)
      .join(","),
  );
  return "﻿" + [cabecalho.join(","), ...linhas].join("\n"); // BOM para acentuação correta no Excel
}
