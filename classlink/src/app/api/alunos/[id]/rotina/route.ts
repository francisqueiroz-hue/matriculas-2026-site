import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { notifyUsers } from "@/lib/push";
import { acessoRotina, exigirEscola, responsaveisDoAluno } from "@/lib/rotina-acesso";
import {
  DIAS_MAXIMO,
  DIAS_PADRAO,
  avisoRotinaFamilia,
  dataParaBanco,
  inicioDaJanela,
  rotinaDoBanco,
  rotinaTemDados,
  salvarRotinaSchema,
  validarDataRotina,
} from "@/lib/rotina";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

const SELECT_ROTINA = {
  data: true,
  colacao: true,
  almoco: true,
  lanche: true,
  janta: true,
  sono: true,
  evacuacao: true,
  banho: true,
  medicacoes: true,
  observacoes: true,
  preenchidoPorNome: true,
  atualizadoEm: true,
} as const;

/**
 * Rotinas do aluno nos últimos `dias` dias (padrão 14, máximo 62), da mais recente para a mais
 * antiga. Direção, secretaria e a família do aluno (somente leitura).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/alunos/[id]/rotina">) {
  try {
    const { id } = await ctx.params;
    const { papel, aluno } = await acessoRotina(id);
    const pedido = Number(request.nextUrl.searchParams.get("dias"));
    const dias = Number.isInteger(pedido) && pedido > 0 ? Math.min(pedido, DIAS_MAXIMO) : DIAS_PADRAO;
    const linhas = await prisma.rotinaDiaria.findMany({
      where: { studentId: id, data: { gte: dataParaBanco(inicioDaJanela(dias)) } },
      orderBy: { data: "desc" },
      select: SELECT_ROTINA,
    });
    return NextResponse.json(
      {
        papel,
        aluno: { id: aluno.id, name: aluno.name, turma: aluno.class?.name ?? null },
        rotinas: linhas.map(rotinaDoBanco),
      },
      { headers: SEM_CACHE },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Preenche ou corrige a rotina de um dia (só direção e secretaria). Na primeira vez que o dia é
 * salvo, a família recebe um aviso no app; correções do mesmo dia não avisam de novo.
 */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/alunos/[id]/rotina">) {
  try {
    const { id } = await ctx.params;
    const { session, papel, aluno } = await acessoRotina(id);
    exigirEscola(papel);
    const lido = salvarRotinaSchema.safeParse(await request.json());
    // A tela mostra a frase da regra (ex.: "Informe o nome do remédio"), não "Dados inválidos".
    if (!lido.success) throw new ErroDeUsuario(lido.error.issues[0]?.message ?? "Dados inválidos");
    const { data, ...dados } = lido.data;
    const erroData = validarDataRotina(data);
    if (erroData) throw new ErroDeUsuario(erroData);
    if (!rotinaTemDados(dados)) throw new ErroDeUsuario("Preencha ao menos um item da rotina antes de salvar");

    const preenchidoPorNome = session.name || "Escola";
    const chave = { studentId_data: { studentId: id, data: dataParaBanco(data) } };
    const salva = await prisma.rotinaDiaria.upsert({
      where: chave,
      create: { schoolId: session.schoolId, studentId: id, data: dataParaBanco(data), ...dados, preenchidoPorNome },
      update: { ...dados, preenchidoPorNome },
      select: { ...SELECT_ROTINA, familiaAvisadaEm: true },
    });

    let familiaAvisada = false;
    if (!salva.familiaAvisadaEm) {
      // Marca antes de enviar: dois salvamentos ao mesmo tempo não avisam duas vezes.
      const marcado = await prisma.rotinaDiaria.updateMany({
        where: { studentId: id, data: dataParaBanco(data), familiaAvisadaEm: null },
        data: { familiaAvisadaEm: new Date() },
      });
      if (marcado.count > 0) {
        familiaAvisada = true;
        try {
          const ids = await responsaveisDoAluno(id);
          await notifyUsers(ids, { ...avisoRotinaFamilia(aluno.name, data), url: `/dashboard/rotina?aluno=${id}` });
        } catch (err) {
          // O aviso não pode desfazer o que foi salvo.
          console.error("Falha ao avisar a família sobre a rotina", err);
        }
      }
    }

    return NextResponse.json({ rotina: rotinaDoBanco(salva), familiaAvisada }, { headers: SEM_CACHE });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Apaga a rotina de um dia lançada por engano (só direção e secretaria). ?data=AAAA-MM-DD */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/alunos/[id]/rotina">) {
  try {
    const { id } = await ctx.params;
    const { papel } = await acessoRotina(id);
    exigirEscola(papel);
    const data = request.nextUrl.searchParams.get("data") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || validarDataRotina(data) === "Data inválida") throw new ErroDeUsuario("Data inválida");
    const { count } = await prisma.rotinaDiaria.deleteMany({ where: { studentId: id, data: dataParaBanco(data) } });
    if (count === 0) return NextResponse.json({ error: "Não há rotina salva neste dia" }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: SEM_CACHE });
  } catch (error) {
    return handleApiError(error);
  }
}
