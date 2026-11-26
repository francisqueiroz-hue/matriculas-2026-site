import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, ehGestaoDaSessao, exigirDirecaoOuCoordenacao, requireRole } from "@/lib/session";
import { ErroDeUsuario } from "@/lib/erros";
import { exigirArea } from "@/lib/visibilidade-server";
import { disciplinasDaEscola, linhasDoBoletim } from "@/lib/boletim";
import { formatarNumero } from "@/lib/boletim-modelo";
import { MENSAGEM_SO_DIRECAO_COORDENACAO_HISTORICO, MENSAGEM_SO_GESTAO_HISTORICO } from "@/lib/equipe";
import {
  colunaDaTurma,
  dataBr,
  historicoAlunoSchema,
  aplicarMedias,
  localDataHistorico,
  modeloHistoricoDe,
  normalizarNome,
  vazios,
  type HistoricoAluno,
  type ModeloHistorico,
} from "@/lib/historico-escolar";

/**
 * Quem vê o histórico: direção, secretaria e coordenação (a gestão). Professores, auxiliares e
 * famílias não acessam. A coordenação também respeita a área "Notas e boletim" desligada pela
 * direção em Configurações. A função é lida do banco a cada pedido.
 */
export async function exigirQuemVeHistorico() {
  const session = await requireRole("ADMIN", "STAFF");
  await exigirArea(session, "NOTAS");
  if (!(await ehGestaoDaSessao(session))) throw new AuthError(MENSAGEM_SO_GESTAO_HISTORICO, 403);
  return session;
}

/** Quem emite (salva, muda o modelo e gera o PDF): só direção e coordenação; a secretaria só vê. */
export async function exigirQuemEmiteHistorico() {
  const session = await exigirQuemVeHistorico();
  await exigirDirecaoOuCoordenacao(session, MENSAGEM_SO_DIRECAO_COORDENACAO_HISTORICO);
  return session;
}

/** Valida e devolve a primeira mensagem legível (em vez do genérico "Dados inválidos"). */
export function validar<T extends z.ZodType>(schema: T, dados: unknown): z.infer<T> {
  const r = schema.safeParse(dados);
  if (!r.success) throw new ErroDeUsuario(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

export async function carregarModeloHistorico(schoolId: string): Promise<ModeloHistorico> {
  const salvo = await prisma.historicoModelo.findUnique({ where: { schoolId }, select: { dados: true } });
  return modeloHistoricoDe(salvo?.dados);
}

const SELECT_ALUNO = {
  id: true,
  name: true,
  birthDate: true,
  codigoInep: true,
  class: { select: { name: true, year: true } },
  guardians: {
    where: { guardian: { deletedAt: null } },
    select: { relation: true, guardian: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  },
} as const;

/** Aluno ativo desta escola, ou 404. */
export async function alunoDaEscola(schoolId: string, studentId: string) {
  const aluno = await prisma.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: SELECT_ALUNO });
  if (!aluno) throw new ErroDeUsuario("Aluno não encontrado.", 404);
  return aluno;
}

type Aluno = Awaited<ReturnType<typeof alunoDaEscola>>;

/** Filiação a partir dos responsáveis: mãe e pai primeiro ("Maria Souza e João Souza"). */
function filiacaoDe(aluno: Aluno): string {
  const peso = (r: string | null) => {
    const n = normalizarNome(r ?? "");
    return n.startsWith("mae") ? 0 : n.startsWith("pai") ? 1 : 2;
  };
  const pais = aluno.guardians.filter((g) => peso(g.relation) < 2).sort((a, b) => peso(a.relation) - peso(b.relation));
  const lista = (pais.length ? pais : aluno.guardians).map((g) => g.guardian.name.trim()).filter(Boolean);
  return lista.length > 1 ? `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}` : (lista[0] ?? "");
}

/**
 * Médias finais do ano em curso (só as dos componentes com os 3 trimestres lançados), por nome
 * do componente normalizado.
 */
export async function mediasDoAno(schoolId: string, studentId: string): Promise<Map<string, { nome: string; media: string }>> {
  const [disciplinas, notas] = await Promise.all([disciplinasDaEscola(schoolId), prisma.nota.findMany({ where: { studentId } })]);
  const mapa = new Map<string, { nome: string; media: string }>();
  for (const l of linhasDoBoletim(disciplinas, notas)) {
    if (l.mediaFinal !== null) mapa.set(normalizarNome(l.nome), { nome: l.nome, media: formatarNumero(l.mediaFinal) });
  }
  return mapa;
}

/**
 * Primeiro histórico do aluno, já preenchido com o que o app sabe: nome, nascimento e filiação
 * do cadastro, componentes e anos do modelo, a linha do ano em curso nos estudos realizados e as
 * médias finais já fechadas no app. Código INEP, naturalidade e anos anteriores (inclusive de
 * outras escolas, em caso de transferência) a secretaria completa.
 */
export async function historicoInicial(schoolId: string, aluno: Aluno, modelo: ModeloHistorico, agora = new Date()): Promise<HistoricoAluno> {
  const series = modelo.series;
  const coluna = colunaDaTurma(aluno.class.name, series);
  const base: HistoricoAluno = {
    studentId: aluno.id,
    aluno: {
      nome: aluno.name,
      codigoInep: aluno.codigoInep ?? "",
      naturalidade: "",
      nacionalidade: "Brasileira",
      nascimento: dataBr(aluno.birthDate),
      filiacao: filiacaoDe(aluno),
    },
    series,
    disciplinas: modelo.disciplinas.map((nome) => ({ nome, notas: vazios(series.length) })),
    cargaHoraria: vazios(series.length),
    frequencia: vazios(series.length),
    resultado: vazios(series.length),
    estudos: [{ serie: coluna >= 0 ? series[coluna] : aluno.class.name, ano: String(aluno.class.year), estabelecimento: modelo.estabelecimento, municipio: modelo.cidade }],
    observacoes: "",
    localData: localDataHistorico(modelo.cidade, agora),
  };
  return aplicarMedias(base, coluna, await mediasDoAno(schoolId, aluno.id)).historico;
}

/** Histórico salvo do aluno (com a data de hoje), ou o inicial se ainda não foi salvo. */
export async function historicoDoAluno(schoolId: string, aluno: Aluno, modelo: ModeloHistorico, agora = new Date()) {
  const salvo = await prisma.historicoEscolar.findUnique({ where: { studentId: aluno.id }, select: { dados: true, updatedAt: true } });
  if (salvo) {
    const r = historicoAlunoSchema.safeParse({ ...(salvo.dados as object), studentId: aluno.id });
    if (r.success) {
      // O código INEP vem sempre do cadastro do aluno (não do que foi salvo no histórico).
      const historico = { ...r.data, aluno: { ...r.data.aluno, codigoInep: aluno.codigoInep ?? "" }, localData: localDataHistorico(modelo.cidade, agora) };
      return { historico, salvoEm: salvo.updatedAt };
    }
  }
  return { historico: await historicoInicial(schoolId, aluno, modelo, agora), salvoEm: null };
}
