import { z } from "zod";
import "@/lib/zod-sem-eval";

/**
 * Ficha da matrícula: checklist de documentos (por ano letivo) e consentimentos LGPD.
 *
 * Regras de negócio:
 * - documento pendente nunca bloqueia aula, prova ou emissão de outro documento — a ficha
 *   só informa; nada aqui é consultado pelo financeiro nem por notas/frequência;
 * - o LAUDO é voluntário e sensível (dado de saúde, LGPD art. 11): só a direção (ADMIN)
 *   vê e edita, e ele não conta como pendência;
 * - consentimento revogado não é apagado: revogar preenche `revogadoEm`.
 */

export type PapelEquipe = "ADMIN" | "STAFF";

export const TIPOS_DOCUMENTO = [
  "CERTIDAO_NASCIMENTO",
  "CPF",
  "VACINACAO",
  "COMPROVANTE_RESIDENCIA",
  "HISTORICO_ESCOLAR",
  "LAUDO",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  CERTIDAO_NASCIMENTO: "Certidão de nascimento",
  CPF: "CPF do aluno",
  VACINACAO: "Caderneta de vacinação",
  COMPROVANTE_RESIDENCIA: "Comprovante de residência",
  HISTORICO_ESCOLAR: "Histórico escolar / declaração de transferência",
  LAUDO: "Laudo (voluntário)",
};

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

export function tiposVisiveis(papel: PapelEquipe): TipoDocumento[] {
  return TIPOS_DOCUMENTO.filter((t) => podeVerTipo(papel, t));
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
export function montarChecklist(registros: RegistroDocumento[], papel: PapelEquipe, agora = new Date()): ItemChecklist[] {
  const porTipo = new Map(registros.map((r) => [r.tipo, r]));
  return tiposVisiveis(papel).map((tipo) => {
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
export function resumoDocumentos(registros: Pick<RegistroDocumento, "tipo" | "recebido">[]) {
  const exigidos = TIPOS_DOCUMENTO.filter(contaComoPendencia);
  const entregues = exigidos.filter((t) => registros.some((r) => r.tipo === t && r.recebido)).length;
  return { entregues, exigidos: exigidos.length, pendentes: exigidos.length - entregues };
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
