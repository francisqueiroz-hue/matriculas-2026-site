import { z } from "zod";
import type { SolicitacaoMatriculaStatus, SolicitacaoMatriculaTipo } from "@prisma/client";
import { normalizePhoneBR } from "@/lib/whatsapp";
import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";

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

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

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
  if (!normalizado) throw new Error("Telefone inválido");
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

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
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
    ]
      .map(csvEscape)
      .join(","),
  );
  return "﻿" + [cabecalho.join(","), ...linhas].join("\n"); // BOM para acentuação correta no Excel
}
