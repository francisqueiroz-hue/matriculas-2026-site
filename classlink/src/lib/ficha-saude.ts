import { z } from "zod";
import "@/lib/zod-sem-eval";
import type { AlteracaoCampo } from "@/lib/historico-cadastro";

/**
 * Ficha de saúde do aluno e pessoas autorizadas a buscar a criança.
 *
 * Regras de negócio:
 * - dado de saúde é dado sensível (LGPD, art. 11) e de criança (art. 14, § 1º): só é gravado
 *   com consentimento ativo da finalidade DADO_DE_SAUDE, dado por um responsável. A família
 *   aceita o termo no próprio app; a escola registra o aceite feito em papel;
 * - leem: direção, coordenação e a família do aluno. Professores não leem;
 * - editam: a escola (direção e coordenação) e a família;
 * - alteração feita pela família avisa direção e coordenação (notificação no app e push) e fica
 *   marcada "a conferir" até a escola confirmar que atualizou os protocolos;
 * - toda mudança vai para o histórico (quem, quando, valor anterior e novo);
 * - pessoa autorizada removida não é apagada: fica com `removidoEm` (histórico de quem podia buscar).
 */

/** Versão do termo de consentimento. Mudou o texto, muda a versão (o aceite guarda qual leu). */
export const VERSAO_TERMO_SAUDE = "saude-2026-11";

/** Termo exibido em destaque antes do aceite (LGPD, arts. 11, I, e 14, § 1º). */
export const TERMO_SAUDE: string[] = [
  "Autorizo a escola a guardar no aplicativo as informações de saúde do meu filho ou da minha filha que eu ou a escola preenchermos aqui: alergias, medicamentos, condições de saúde, restrições alimentares e orientações para emergência.",
  "Finalidade: cuidar da criança no dia a dia e agir rápido numa emergência (por exemplo, evitar um alimento que causa alergia ou saber qual remédio informar ao socorro).",
  "Quem vê: só a direção e a coordenação da escola, além dos responsáveis da criança. Professores e outras famílias não veem. Os dados não são vendidos nem repassados a terceiros, exceto ao serviço de saúde numa emergência.",
  "Posso corrigir as informações a qualquer momento pelo aplicativo, e a escola é avisada na hora. Posso retirar esta autorização quando quiser; as informações de saúde deixam de aparecer no aplicativo.",
];

export const CAMPOS_SAUDE = ["alergias", "medicamentos", "condicoes", "restricoesAlimentares", "orientacoesEmergencia"] as const;
export type CampoSaude = (typeof CAMPOS_SAUDE)[number];

export const ROTULO_CAMPO_SAUDE: Record<CampoSaude, string> = {
  alergias: "Alergias",
  medicamentos: "Medicamentos",
  condicoes: "Condições de saúde e cuidados",
  restricoesAlimentares: "Restrições alimentares",
  orientacoesEmergencia: "Em emergência, o que fazer",
};

export const DICA_CAMPO_SAUDE: Record<CampoSaude, string> = {
  alergias: "Ex.: amendoim, dipirona, picada de abelha. Escreva também o que acontece.",
  medicamentos: "Remédios de uso contínuo ou para crise, com dose e horário.",
  condicoes: "Ex.: asma, epilepsia, diabetes, TEA, uso de óculos.",
  restricoesAlimentares: "Ex.: sem lactose, sem glúten, vegetariana.",
  orientacoesEmergencia: "Ex.: usar a bombinha da mochila; ligar primeiro para a mãe.",
};

export type FichaSaudeDados = Record<CampoSaude, string | null>;

export const FICHA_VAZIA: FichaSaudeDados = {
  alergias: null,
  medicamentos: null,
  condicoes: null,
  restricoesAlimentares: null,
  orientacoesEmergencia: null,
};

/** Rótulos do histórico (somam-se aos do cadastro em ROTULO_CAMPO). */
export const ROTULO_HISTORICO_SAUDE: Record<string, string> = {
  ...Object.fromEntries(CAMPOS_SAUDE.map((c) => [`saude.${c}`, ROTULO_CAMPO_SAUDE[c]])),
  autorizado: "Pessoa autorizada a buscar",
  consentimento: "Consentimento de dados de saúde",
  conferencia: "Conferência da escola",
};

/** Entidade usada no histórico de alterações (AlteracaoCadastro). */
export const ENTIDADE_HISTORICO = "ALUNO_SAUDE";

export const LIMITE_AUTORIZADOS = 10;
const LIMITE_TEXTO = 1000;

// ─── Validação ───────────────────────────────────────────────────────────────

/** Texto livre opcional: apara, vazio vira null, limita o tamanho. */
const textoOpcional = (max: number, rotulo: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : v))
    .refine((v) => typeof v !== "string" || v.length <= max, `${rotulo}: no máximo ${max} caracteres`)
    .transform((v) => (v === "" ? null : v));

export const fichaSaudeSchema = z.object(
  Object.fromEntries(CAMPOS_SAUDE.map((c) => [c, textoOpcional(LIMITE_TEXTO, ROTULO_CAMPO_SAUDE[c])])) as Record<
    CampoSaude,
    ReturnType<typeof textoOpcional>
  >,
);

/** Telefone brasileiro com DDD (10 ou 11 dígitos), com ou sem 55 na frente. Guarda só os dígitos. */
const telefoneOpcional = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === "string" ? v.replace(/\D/g, "") : v))
  .refine((v) => !v || /^(55)?\d{10,11}$/.test(v), "Telefone com DDD, por exemplo (21) 99876-5432")
  .transform((v) => (v ? v.replace(/^55(?=\d{10,11}$)/, "") : null));

export const autorizadoSchema = z.object({
  /** Presente quando é uma pessoa já cadastrada (edição); ausente para incluir. */
  id: z.string().trim().min(1).max(40).optional(),
  nome: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .refine((v) => v.length >= 3, "Informe o nome completo de quem pode buscar")
    .refine((v) => v.length <= 120, "Nome com no máximo 120 caracteres"),
  parentesco: textoOpcional(60, "Parentesco"),
  telefone: telefoneOpcional,
  documento: textoOpcional(30, "Documento"),
  observacao: textoOpcional(300, "Observação"),
});
export type AutorizadoEntrada = z.infer<typeof autorizadoSchema>;

export const salvarSaudeSchema = z
  .object({
    ficha: fichaSaudeSchema.optional(),
    autorizados: z.array(autorizadoSchema).max(LIMITE_AUTORIZADOS, `No máximo ${LIMITE_AUTORIZADOS} pessoas autorizadas`).optional(),
    /** Aceite do termo no mesmo envio. Família: ela mesma. Escola: aceite feito em papel. */
    consentimento: z
      .object({
        aceito: z.literal(true),
        versaoTexto: z.literal(VERSAO_TERMO_SAUDE),
        /** Escola: responsável vinculado que assinou o termo em papel. */
        consentidoPorId: z.string().trim().min(1).max(40).optional(),
        /** Escola: quem assinou, quando não é um responsável com conta no app (ex.: avó guardiã). */
        consentidoPorNome: z
          .string()
          .transform((v) => v.replace(/\s+/g, " ").trim())
          .refine((v) => v.length >= 3 && v.length <= 120, "Nome de quem assinou: de 3 a 120 caracteres")
          .optional(),
      })
      .optional(),
  })
  .refine((d) => d.ficha !== undefined || d.autorizados !== undefined || d.consentimento !== undefined, "Nada para salvar");
export type SalvarSaude = z.infer<typeof salvarSaudeSchema>;

// ─── Regras ──────────────────────────────────────────────────────────────────

/** A ficha tem alguma informação de saúde preenchida. */
export function fichaTemDados(ficha: Partial<FichaSaudeDados> | null | undefined): boolean {
  return !!ficha && CAMPOS_SAUDE.some((c) => (ficha[c] ?? "").trim() !== "");
}

/** Normaliza o registro do banco (ou null) para os cinco campos. */
export function dadosDaFicha(ficha: Partial<FichaSaudeDados> | null | undefined): FichaSaudeDados {
  return Object.fromEntries(CAMPOS_SAUDE.map((c) => [c, ficha?.[c] ?? null])) as FichaSaudeDados;
}

/** Uma linha de histórico por campo de saúde que mudou. */
export function alteracoesSaude(antes: FichaSaudeDados, depois: FichaSaudeDados): AlteracaoCampo[] {
  return CAMPOS_SAUDE.filter((c) => (antes[c] ?? null) !== (depois[c] ?? null)).map((c) => ({
    campo: `saude.${c}`,
    valorAnterior: antes[c] ?? null,
    valorNovo: depois[c] ?? null,
  }));
}

export interface AutorizadoSalvo {
  id: string;
  nome: string;
  parentesco: string | null;
  telefone: string | null;
  documento: string | null;
  observacao: string | null;
}

/** "Maria Souza (avó) · tel. 21998765432 · doc. 12.345.678-9" — como a pessoa fica no histórico. */
export function descreverAutorizado(a: Omit<AutorizadoSalvo, "id">): string {
  const partes = [a.parentesco ? `${a.nome} (${a.parentesco})` : a.nome];
  if (a.telefone) partes.push(`tel. ${a.telefone}`);
  if (a.documento) partes.push(`doc. ${a.documento}`);
  if (a.observacao) partes.push(a.observacao);
  return partes.join(" · ");
}

const igual = (a: Omit<AutorizadoSalvo, "id">, b: Omit<AutorizadoSalvo, "id">) =>
  a.nome === b.nome && a.parentesco === b.parentesco && a.telefone === b.telefone && a.documento === b.documento && a.observacao === b.observacao;

export interface PlanoAutorizados {
  criar: Omit<AutorizadoSalvo, "id">[];
  atualizar: AutorizadoSalvo[];
  remover: string[];
  alteracoes: AlteracaoCampo[];
}

/**
 * Compara a lista atual com a enviada (a lista enviada é a lista completa). Quem tem id e não
 * veio na lista é removido; quem veio sem id é incluído; quem veio com id e mudou é atualizado.
 * Id que não pertence ao aluno é recusado (não deixa editar pessoa de outro aluno).
 */
export function planejarAutorizados(
  atuais: AutorizadoSalvo[],
  novos: (Pick<AutorizadoEntrada, "nome"> & Partial<Omit<AutorizadoEntrada, "nome">>)[],
): PlanoAutorizados {
  const porId = new Map(atuais.map((a) => [a.id, a]));
  const plano: PlanoAutorizados = { criar: [], atualizar: [], remover: [], alteracoes: [] };
  const mantidos = new Set<string>();
  for (const n of novos) {
    const dados = {
      nome: n.nome,
      parentesco: n.parentesco ?? null,
      telefone: n.telefone ?? null,
      documento: n.documento ?? null,
      observacao: n.observacao ?? null,
    };
    if (!n.id) {
      plano.criar.push(dados);
      plano.alteracoes.push({ campo: "autorizado", valorAnterior: null, valorNovo: descreverAutorizado(dados) });
      continue;
    }
    const atual = porId.get(n.id);
    if (!atual) throw new Error("PESSOA_NAO_E_DO_ALUNO");
    if (mantidos.has(n.id)) continue; // repetido na lista: vale o primeiro
    mantidos.add(n.id);
    if (!igual(atual, dados)) {
      plano.atualizar.push({ id: n.id, ...dados });
      plano.alteracoes.push({ campo: "autorizado", valorAnterior: descreverAutorizado(atual), valorNovo: descreverAutorizado(dados) });
    }
  }
  for (const a of atuais) {
    if (!mantidos.has(a.id)) {
      plano.remover.push(a.id);
      plano.alteracoes.push({ campo: "autorizado", valorAnterior: descreverAutorizado(a), valorNovo: null });
    }
  }
  return plano;
}

/** Aviso à escola quando a família muda a ficha (notificação no app e push). */
export function avisoAlteracaoFamilia(aluno: string, quem: string, alteracoes: AlteracaoCampo[]) {
  const assuntos = [
    ...new Set(
      alteracoes.map((a) =>
        a.campo === "autorizado" ? "pessoas autorizadas a buscar" : a.campo === "consentimento" ? "consentimento" : (ROTULO_HISTORICO_SAUDE[a.campo] ?? a.campo).toLowerCase(),
      ),
    ),
  ];
  return {
    title: `Ficha de saúde de ${aluno.trim().split(/\s+/)[0]} atualizada pela família`,
    body: `${quem} alterou: ${assuntos.join(", ")}. Confira e atualize os protocolos da escola.`,
  };
}
