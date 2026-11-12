import { z } from "zod";
import "@/lib/zod-sem-eval";
import { etapaPelaTurma, type Etapa } from "@/lib/contrato-modelo/tipos";

/**
 * Ficha da matrícula: checklist de documentos (por ano letivo) e consentimentos LGPD.
 *
 * Regras de negócio:
 * - documento pendente nunca bloqueia aula, prova ou emissão de outro documento — a ficha
 *   só informa; nada aqui é consultado pelo financeiro nem por notas/frequência;
 * - o LAUDO é voluntário e sensível (dado de saúde, LGPD art. 11): só a direção (ADMIN)
 *   vê e edita, e ele não conta como pendência;
 * - consentimento revogado não é apagado: revogar preenche `revogadoEm`;
 * - a lista de documentos exigidos depende da etapa (educação infantil ou fundamental) e fica
 *   toda em DOCUMENTOS_EXIGIDOS, logo abaixo: mudar a lista é mudar só ali.
 */

export type PapelEquipe = "ADMIN" | "STAFF";

/** Todos os tipos que o banco aceita (CPF ficou fora da lista exigida, mas o registro antigo continua válido). */
export const TIPOS_DOCUMENTO = [
  "CERTIDAO_NASCIMENTO",
  "CPF",
  "VACINACAO",
  "COMPROVANTE_RESIDENCIA",
  "IDENTIDADE_RESPONSAVEL",
  "ATESTADO_MEDICO",
  "HISTORICO_ESCOLAR",
  "LAUDO",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  CERTIDAO_NASCIMENTO: "Certidão de nascimento",
  CPF: "CPF do aluno",
  VACINACAO: "Caderneta de vacinação",
  COMPROVANTE_RESIDENCIA: "Comprovante de residência",
  IDENTIDADE_RESPONSAVEL: "Documento de identidade do responsável",
  ATESTADO_MEDICO: "Atestado médico atualizado para o ano letivo",
  HISTORICO_ESCOLAR: "Histórico escolar da escola anterior",
  LAUDO: "Laudo (voluntário)",
};

export type { Etapa };
export const ROTULO_ETAPA: Record<Etapa, string> = { EI: "Educação infantil", EF1: "Ensino fundamental" };

/**
 * Documentos exigidos na matrícula ou renovação, por etapa. Configuração única da lista:
 * a ficha, o resumo da lista de alunos e o aviso à família leem daqui.
 */
const DOCUMENTOS_EDUCACAO_INFANTIL: TipoDocumento[] = [
  "CERTIDAO_NASCIMENTO",
  "VACINACAO",
  "COMPROVANTE_RESIDENCIA",
  "IDENTIDADE_RESPONSAVEL",
  "ATESTADO_MEDICO",
];
export const DOCUMENTOS_EXIGIDOS: Record<Etapa, TipoDocumento[]> = {
  EI: DOCUMENTOS_EDUCACAO_INFANTIL,
  EF1: [...DOCUMENTOS_EDUCACAO_INFANTIL, "HISTORICO_ESCOLAR"],
};

/**
 * Etapa do aluno no ano letivo: a do contrato do ano (escolhida pela direção no envio), senão a
 * deduzida do nome da turma ("3º Ano A" → fundamental; demais → educação infantil).
 */
export function etapaDaFicha(turma: string | null | undefined, etapaDoContrato?: unknown): Etapa {
  if (etapaDoContrato === "EI" || etapaDoContrato === "EF1") return etapaDoContrato;
  return turma ? etapaPelaTurma(turma) : "EI";
}

export const FINALIDADES = ["DADOS_DA_CRIANCA", "USO_DE_IMAGEM", "DADO_DE_SAUDE"] as const;
export type Finalidade = (typeof FINALIDADES)[number];

export const ROTULO_FINALIDADE: Record<Finalidade, string> = {
  DADOS_DA_CRIANCA: "Tratamento dos dados da criança",
  USO_DE_IMAGEM: "Uso de imagem",
  DADO_DE_SAUDE: "Dados de saúde",
};

/** Documento só da direção: sensível e voluntário. */
export const TIPO_RESTRITO: TipoDocumento = "LAUDO";

export function podeVerTipo(papel: PapelEquipe, tipo: TipoDocumento): boolean {
  return tipo !== TIPO_RESTRITO || papel === "ADMIN";
}

/** Tipos que aparecem na ficha: os exigidos da etapa e, para a direção, o laudo voluntário. */
export function tiposVisiveis(papel: PapelEquipe, etapa: Etapa = "EI"): TipoDocumento[] {
  return [...DOCUMENTOS_EXIGIDOS[etapa], TIPO_RESTRITO].filter((t) => podeVerTipo(papel, t));
}

/** O laudo é voluntário: nunca aparece como pendência. */
export function contaComoPendencia(tipo: TipoDocumento): boolean {
  return tipo !== TIPO_RESTRITO;
}

export interface RegistroDocumento {
  id: string;
  tipo: TipoDocumento;
  recebido: boolean;
  recebidoEm: Date | null;
  prazo: Date | null;
  observacao: string | null;
}

export interface ItemChecklist {
  tipo: TipoDocumento;
  rotulo: string;
  recebido: boolean;
  recebidoEm: string | null;
  prazo: string | null;
  observacao: string | null;
  voluntario: boolean;
  /** Prazo vencido e ainda não entregue (só informativo). */
  atrasado: boolean;
}

/** Um item por tipo visível, preenchido com o registro salvo quando existir. */
export function montarChecklist(
  registros: RegistroDocumento[],
  papel: PapelEquipe,
  etapa: Etapa = "EI",
  agora = new Date(),
): ItemChecklist[] {
  const porTipo = new Map(registros.map((r) => [r.tipo, r]));
  return tiposVisiveis(papel, etapa).map((tipo) => {
    const r = porTipo.get(tipo);
    const recebido = r?.recebido ?? false;
    const prazo = r?.prazo ?? null;
    return {
      tipo,
      rotulo: ROTULO_DOCUMENTO[tipo],
      recebido,
      recebidoEm: r?.recebidoEm?.toISOString() ?? null,
      prazo: prazo?.toISOString() ?? null,
      observacao: r?.observacao ?? null,
      voluntario: !contaComoPendencia(tipo),
      atrasado: !recebido && contaComoPendencia(tipo) && prazo !== null && prazo.getTime() < agora.getTime(),
    };
  });
}

/** Resumo para a lista de alunos: entregues / exigidos (o laudo não entra na conta). */
export function resumoDocumentos(registros: Pick<RegistroDocumento, "tipo" | "recebido">[], etapa: Etapa = "EI") {
  const exigidos = DOCUMENTOS_EXIGIDOS[etapa];
  const entregues = exigidos.filter((t) => registros.some((r) => r.tipo === t && r.recebido)).length;
  return { entregues, exigidos: exigidos.length, pendentes: exigidos.length - entregues };
}

/** Documentos exigidos ainda não entregues (para o aviso à família). */
export function documentosFaltantes(registros: Pick<RegistroDocumento, "tipo" | "recebido">[], etapa: Etapa): TipoDocumento[] {
  return DOCUMENTOS_EXIGIDOS[etapa].filter((t) => !registros.some((r) => r.tipo === t && r.recebido));
}

/** Aviso à família com os documentos que faltam (notificação no app e texto para o WhatsApp). */
export function mensagemDocumentosFaltantes(aluno: string, anoLetivo: number, faltantes: TipoDocumento[]) {
  const primeiro = aluno.trim().split(/\s+/)[0] ?? aluno;
  const lista = faltantes.map((t) => ROTULO_DOCUMENTO[t]);
  return {
    titulo: `Documentos pendentes de ${primeiro}`,
    texto: `Para concluir a matrícula ${anoLetivo} de ${primeiro}, ainda faltam: ${lista.join("; ")}. Entregue na secretaria da escola.`,
    whatsapp: [
      `Olá! Para concluir a matrícula ${anoLetivo} de *${aluno.trim()}*, ainda precisamos destes documentos:`,
      "",
      ...lista.map((r) => `• ${r}`),
      "",
      "Pode entregar na secretaria da escola. Qualquer dúvida, estamos à disposição.",
    ].join("\n"),
  };
}

/** Ano letivo padrão: o ano da turma do aluno, senão o ano corrente (fuso de Brasília). */
export function anoLetivoPadrao(anoDaTurma: number | null | undefined, agora = new Date()): number {
  if (anoDaTurma && anoDaTurma >= 2000 && anoDaTurma <= 2100) return anoDaTurma;
  return Number(new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(agora));
}

// ─── Validação das entradas ──────────────────────────────────────────────────

export const anoLetivoSchema = z.coerce.number().int().min(2000).max(2100);

/** Data "AAAA-MM-DD" (ou ISO) → Date; vazio/null → null. */
const dataOpcional = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00-03:00` : v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Data inválida" });
      return z.NEVER;
    }
    return d;
  });

export const atualizarDocumentoSchema = z.object({
  anoLetivo: anoLetivoSchema,
  tipo: z.enum(TIPOS_DOCUMENTO),
  recebido: z.boolean().optional(),
  prazo: dataOpcional,
  observacao: z
    .union([z.string().trim().max(500, "Observação com no máximo 500 caracteres"), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v)),
});
export type AtualizarDocumento = z.infer<typeof atualizarDocumentoSchema>;

export const registrarConsentimentoSchema = z
  .object({
    finalidade: z.enum(FINALIDADES),
    versaoTexto: z.string().trim().min(1, "Informe a versão do texto").max(40),
    /** Responsável cadastrado que consentiu (opcional: pode ter sido em papel, por outra pessoa). */
    consentidoPorId: z.string().trim().min(1).optional(),
    consentidoPorNome: z.string().trim().max(120).optional(),
  })
  .refine((d) => d.consentidoPorId || (d.consentidoPorNome && d.consentidoPorNome.length >= 3), {
    message: "Informe quem consentiu",
    path: ["consentidoPorNome"],
  });
export type RegistrarConsentimento = z.infer<typeof registrarConsentimentoSchema>;

/** Dados para gravar a mudança de um documento: recebidoEm acompanha o "recebido". */
export function dadosDaAtualizacao(
  entrada: { recebido?: boolean; prazo?: Date | null; observacao?: string | null },
  atual: { recebido: boolean; recebidoEm: Date | null } | null, agora = new Date()) {
  const dados: { recebido?: boolean; recebidoEm?: Date | null; prazo?: Date | null; observacao?: string | null } = {};
  if (entrada.recebido !== undefined) {
    dados.recebido = entrada.recebido;
    if (entrada.recebido) dados.recebidoEm = atual?.recebido && atual.recebidoEm ? atual.recebidoEm : agora;
    else dados.recebidoEm = null;
  }
  if (entrada.prazo !== undefined) dados.prazo = entrada.prazo;
  if (entrada.observacao !== undefined) dados.observacao = entrada.observacao;
  return dados;
}
