import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import {
  acessoFichaSaude,
  autorizadosAtuais,
  avisarEscola,
  carregarFichaSaude,
  consentimentoSaudeAtivo,
  linhasHistorico,
} from "@/lib/ficha-saude-acesso";
import {
  CAMPOS_SAUDE,
  ENTIDADE_HISTORICO,
  FICHA_VAZIA,
  VERSAO_TERMO_SAUDE,
  alteracoesSaude,
  avisoAlteracaoFamilia,
  dadosDaFicha,
  fichaTemDados,
  planejarAutorizados,
  salvarSaudeSchema,
  type FichaSaudeDados,
  type PlanoAutorizados,
} from "@/lib/ficha-saude";
import type { AlteracaoCampo } from "@/lib/historico-cadastro";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

/**
 * Ficha de saúde e pessoas autorizadas a buscar o aluno. Direção, coordenação e a família do
 * aluno. A escola recebe também o histórico de alterações e a situação da conferência.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/alunos/[id]/saude">) {
  try {
    const { id } = await ctx.params;
    const { session, papel, aluno } = await acessoFichaSaude(id);
    const dados = await carregarFichaSaude(id, papel);
    const historico =
      papel === "ESCOLA"
        ? await prisma.alteracaoCadastro.findMany({
            where: { schoolId: session.schoolId, entidade: ENTIDADE_HISTORICO, entidadeId: id },
            orderBy: { criadoEm: "desc" },
            take: 50,
            select: { id: true, campo: true, valorAnterior: true, valorNovo: true, porNome: true, criadoEm: true },
          })
        : null;
    return NextResponse.json(
      {
        papel,
        aluno: {
          id: aluno.id,
          name: aluno.name,
          turma: aluno.class?.name ?? null,
          responsaveis: aluno.guardians.map((g) => ({ id: g.guardian.id, name: g.guardian.name, relation: g.relation })),
        },
        versaoTermo: VERSAO_TERMO_SAUDE,
        ...dados,
        historico,
      },
      { headers: SEM_CACHE },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Salva a ficha de saúde e/ou a lista completa de pessoas autorizadas (e o aceite do termo,
 * quando vier junto). Dado de saúde só é gravado com consentimento ativo. Alteração feita pela
 * família fica "a conferir" e avisa direção e coordenação.
 */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/alunos/[id]/saude">) {
  try {
    const { id } = await ctx.params;
    const { session, papel, aluno } = await acessoFichaSaude(id);
    const entrada = salvarSaudeSchema.parse(await request.json());

    // Quem consentiu: a família, ela mesma; a escola, um responsável vinculado (termo em papel).
    let novoConsentimento: { consentidoPorId: string; consentidoPorNome: string } | null = null;
    if (entrada.consentimento) {
      if (papel === "FAMILIA") {
        novoConsentimento = { consentidoPorId: session.sub, consentidoPorNome: session.name };
      } else {
        const vinculo = aluno.guardians.find((g) => g.guardian.id === entrada.consentimento?.consentidoPorId);
        if (!vinculo) throw new ErroDeUsuario("Escolha o responsável que assinou o termo de consentimento");
        novoConsentimento = { consentidoPorId: vinculo.guardian.id, consentidoPorNome: vinculo.guardian.name };
      }
    }

    const [consentimentoAtual, fichaAtual, atuais] = await Promise.all([
      consentimentoSaudeAtivo(id),
      prisma.fichaSaude.findUnique({ where: { studentId: id }, select: Object.fromEntries(CAMPOS_SAUDE.map((c) => [c, true])) }),
      entrada.autorizados ? autorizadosAtuais(id) : Promise.resolve([]),
    ]);

    const antes: FichaSaudeDados = dadosDaFicha(fichaAtual as Partial<FichaSaudeDados> | null);
    const depois: FichaSaudeDados | null = entrada.ficha ? { ...FICHA_VAZIA, ...(entrada.ficha as Partial<FichaSaudeDados>) } : null;
    if (depois && fichaTemDados(depois) && !consentimentoAtual && !novoConsentimento) {
      throw new ErroDeUsuario(
        papel === "FAMILIA"
          ? "Para guardar informações de saúde, leia e aceite o termo de consentimento."
          : "Para guardar informações de saúde, registre antes o consentimento assinado por um responsável.",
      );
    }

    let plano: PlanoAutorizados | null = null;
    if (entrada.autorizados) {
      try {
        plano = planejarAutorizados(atuais, entrada.autorizados);
      } catch {
        throw new ErroDeUsuario("Lista de pessoas autorizadas desatualizada. Recarregue a página e tente de novo.", 409);
      }
    }

    const alteracoes: AlteracaoCampo[] = [...(depois ? alteracoesSaude(antes, depois) : []), ...(plano?.alteracoes ?? [])];
    if (novoConsentimento) {
      alteracoes.push({
        campo: "consentimento",
        valorAnterior: consentimentoAtual ? `Aceito por ${consentimentoAtual.consentidoPorNome}` : null,
        valorNovo: `Aceito por ${novoConsentimento.consentidoPorNome} (termo ${VERSAO_TERMO_SAUDE}${papel === "ESCOLA" ? ", em papel" : ", no app"})`,
      });
    }
    if (alteracoes.length === 0) return NextResponse.json({ ok: true, alterado: false });

    const agora = new Date();
    const porNome = `${session.name} (${papel === "FAMILIA" ? "família" : "escola"})`;
    const mudouFichaOuLista = alteracoes.some((a) => a.campo !== "consentimento");

    await prisma.$transaction(async (tx) => {
      if (novoConsentimento) {
        await tx.consentimentoLgpd.updateMany({
          where: { studentId: id, finalidade: "DADO_DE_SAUDE", revogadoEm: null },
          data: { revogadoEm: agora },
        });
        await tx.consentimentoLgpd.create({
          data: {
            schoolId: session.schoolId,
            studentId: id,
            finalidade: "DADO_DE_SAUDE",
            versaoTexto: VERSAO_TERMO_SAUDE,
            ...novoConsentimento,
            consentidoEm: agora,
          },
        });
      }

      if (mudouFichaOuLista) {
        const campos = depois ?? {};
        const marcaFamilia =
          papel === "FAMILIA" ? { alteradoPelaFamiliaPor: session.name, conferidoEm: null, conferidoPorNome: null } : {};
        const atual = await tx.fichaSaude.findUnique({ where: { studentId: id }, select: { pendenteConferenciaDesde: true } });
        await tx.fichaSaude.upsert({
          where: { studentId: id },
          create: {
            schoolId: session.schoolId,
            studentId: id,
            ...campos,
            atualizadoPorNome: porNome,
            ...(papel === "FAMILIA" && { pendenteConferenciaDesde: agora, alteradoPelaFamiliaPor: session.name }),
          },
          update: {
            ...campos,
            atualizadoPorNome: porNome,
            // Várias alterações seguidas da família: vale a data da primeira ainda não conferida.
            ...(papel === "FAMILIA" && { pendenteConferenciaDesde: atual?.pendenteConferenciaDesde ?? agora, ...marcaFamilia }),
          },
        });
      }

      if (plano) {
        if (plano.remover.length > 0) {
          await tx.pessoaAutorizada.updateMany({ where: { id: { in: plano.remover }, studentId: id }, data: { removidoEm: agora } });
        }
        for (const a of plano.atualizar) {
          const { id: autId, ...dados } = a;
          await tx.pessoaAutorizada.updateMany({ where: { id: autId, studentId: id, removidoEm: null }, data: dados });
        }
        if (plano.criar.length > 0) {
          await tx.pessoaAutorizada.createMany({
            data: plano.criar.map((d) => ({ ...d, schoolId: session.schoolId, studentId: id, criadoPorNome: porNome })),
          });
        }
      }

      await tx.alteracaoCadastro.createMany({ data: linhasHistorico(session.schoolId, id, session.sub, porNome, alteracoes) });
    });

    if (papel === "FAMILIA") {
      await avisarEscola(session.schoolId, id, avisoAlteracaoFamilia(aluno.name, session.name, alteracoes));
    }
    return NextResponse.json({ ok: true, alterado: true });
  } catch (error) {
    return handleApiError(error);
  }
}
