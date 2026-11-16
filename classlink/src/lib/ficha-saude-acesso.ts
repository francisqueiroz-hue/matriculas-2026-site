import { prisma } from "@/lib/prisma";
import { AuthError, requireSession } from "@/lib/session";
import { ErroDeUsuario } from "@/lib/erros";
import { notifyUsers } from "@/lib/push";
import {
  CAMPOS_SAUDE,
  ENTIDADE_HISTORICO,
  dadosDaFicha,
  type AutorizadoSalvo,
  type FichaSaudeDados,
} from "@/lib/ficha-saude";
import type { AlteracaoCampo } from "@/lib/historico-cadastro";

/**
 * Quem pode ler e editar a ficha de saúde e as pessoas autorizadas de um aluno:
 * - família: só os filhos vinculados (outro aluno responde 404, sem revelar que existe);
 * - direção (ADMIN) e coordenação (STAFF com isCoordenacao, conferido no banco a cada pedido);
 * - professor e demais: 403.
 */
export type PapelSaude = "ESCOLA" | "FAMILIA";

export async function acessoFichaSaude(studentId: string) {
  const session = await requireSession();
  let papel: PapelSaude;
  if (session.role === "GUARDIAN") {
    const vinculo = await prisma.guardianStudent.findFirst({
      where: { guardianId: session.sub, studentId, student: { schoolId: session.schoolId, deletedAt: null } },
      select: { id: true },
    });
    if (!vinculo) throw new AuthError("Aluno não encontrado", 404);
    papel = "FAMILIA";
  } else if (session.role === "ADMIN") {
    papel = "ESCOLA";
  } else {
    const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { isCoordenacao: true } });
    if (!user?.isCoordenacao) throw new AuthError("Ficha de saúde restrita à direção, à coordenação e à família do aluno", 403);
    papel = "ESCOLA";
  }

  const aluno = await prisma.student.findFirst({
    where: { id: studentId, schoolId: session.schoolId, deletedAt: null },
    select: {
      id: true,
      name: true,
      class: { select: { name: true } },
      guardians: {
        where: { guardian: { deletedAt: null } },
        select: { relation: true, guardian: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!aluno) throw new AuthError("Aluno não encontrado", 404);
  return { session, papel, aluno };
}

/** Consentimento ativo (não revogado) de dados de saúde do aluno, o mais recente. */
export function consentimentoSaudeAtivo(studentId: string) {
  return prisma.consentimentoLgpd.findFirst({
    where: { studentId, finalidade: "DADO_DE_SAUDE", revogadoEm: null },
    orderBy: { consentidoEm: "desc" },
    select: { id: true, versaoTexto: true, consentidoPorNome: true, consentidoEm: true },
  });
}

const SELECT_AUTORIZADO = { id: true, nome: true, parentesco: true, telefone: true, documento: true, observacao: true } as const;

/**
 * Tudo o que a tela e o cartão de emergência mostram. Sem consentimento ativo, os dados de saúde
 * não saem do banco (só as pessoas autorizadas, que não são dado sensível).
 * Nunca inclui mensalidade nem outro dado financeiro.
 */
export async function carregarFichaSaude(studentId: string, papel: PapelSaude) {
  const [consentimento, ficha, autorizados] = await Promise.all([
    consentimentoSaudeAtivo(studentId),
    prisma.fichaSaude.findUnique({
      where: { studentId },
      select: {
        ...Object.fromEntries(CAMPOS_SAUDE.map((c) => [c, true])),
        atualizadoEm: true,
        atualizadoPorNome: true,
        pendenteConferenciaDesde: true,
        alteradoPelaFamiliaPor: true,
        conferidoEm: true,
        conferidoPorNome: true,
      },
    }),
    prisma.pessoaAutorizada.findMany({
      where: { studentId, removidoEm: null },
      orderBy: { criadoEm: "asc" },
      select: SELECT_AUTORIZADO,
    }),
  ]);
  const f = ficha as (FichaSaudeDados & Record<string, unknown>) | null;
  return {
    consentimento,
    saude: consentimento ? dadosDaFicha(f) : null,
    atualizadoEm: (f?.atualizadoEm as Date | undefined) ?? null,
    atualizadoPorNome: (f?.atualizadoPorNome as string | null | undefined) ?? null,
    // A família não precisa ver o controle interno de conferência da escola.
    conferencia:
      papel === "ESCOLA"
        ? {
            pendenteDesde: (f?.pendenteConferenciaDesde as Date | null | undefined) ?? null,
            alteradoPelaFamiliaPor: (f?.alteradoPelaFamiliaPor as string | null | undefined) ?? null,
            conferidoEm: (f?.conferidoEm as Date | null | undefined) ?? null,
            conferidoPorNome: (f?.conferidoPorNome as string | null | undefined) ?? null,
          }
        : null,
    autorizados: autorizados as AutorizadoSalvo[],
  };
}

export function autorizadosAtuais(studentId: string) {
  return prisma.pessoaAutorizada.findMany({ where: { studentId, removidoEm: null }, select: SELECT_AUTORIZADO });
}

/** Histórico das alterações (entidade ALUNO_SAUDE). Quem fez leva "(família)" ou "(escola)". */
export function linhasHistorico(schoolId: string, studentId: string, porUserId: string, porNome: string, alteracoes: AlteracaoCampo[]) {
  return alteracoes.map((a) => ({
    schoolId,
    entidade: ENTIDADE_HISTORICO,
    entidadeId: studentId,
    campo: a.campo,
    valorAnterior: a.valorAnterior,
    valorNovo: a.valorNovo,
    porUserId,
    porNome,
  }));
}

/** Direção e coordenação ativas da escola: quem recebe o aviso de alteração feita pela família. */
export async function destinatariosEscola(schoolId: string): Promise<string[]> {
  const equipe = await prisma.user.findMany({
    where: { schoolId, active: true, deletedAt: null, OR: [{ role: "ADMIN" }, { role: "STAFF", isCoordenacao: true }] },
    select: { id: true },
  });
  return equipe.map((u) => u.id);
}

/** Avisa direção e coordenação por push. Nunca lança erro: o aviso não pode desfazer o que foi salvo. */
export async function avisarEscola(schoolId: string, studentId: string, aviso: { title: string; body: string }) {
  try {
    const ids = await destinatariosEscola(schoolId);
    await notifyUsers(ids, { ...aviso, url: `/dashboard/saude?aluno=${studentId}` });
  } catch (err) {
    console.error("Falha ao avisar a escola sobre a ficha de saúde", err);
  }
}

export { ErroDeUsuario };
