import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { notifyUsers } from "@/lib/push";
import { responsaveisDoAluno } from "@/lib/contratos-server";
import { carregarConfig } from "@/lib/contrato-modelo/servidor";
import { envioLoteSchema } from "@/lib/contrato-modelo/validacao";
import { MODELO_CONTRATO_2027, pendenciasConfig, type CondicoesContrato } from "@/lib/contrato-modelo/tipos";

/**
 * Envia o contrato do modelo do app para vários alunos de uma vez. Cada contrato guarda
 * uma cópia das condições do momento (valores, parcelas, dados da escola): mudar a
 * configuração depois não altera contratos já enviados. A família recebe aviso para
 * conferir os dados; o PDF é gerado quando ela confirma.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = envioLoteSchema.parse(await request.json());
    if (body.anoLetivo !== 2027) {
      return NextResponse.json({ error: "O modelo de contrato guardado no app é o de 2027." }, { status: 400 });
    }

    const { config } = await carregarConfig(session.schoolId, body.anoLetivo);
    const pendencias = pendenciasConfig(config);
    if (pendencias.length > 0) {
      return NextResponse.json(
        { error: `Complete a configuração do contrato antes de enviar: ${pendencias.slice(0, 5).join("; ")}${pendencias.length > 5 ? "…" : ""}`, pendencias },
        { status: 409 },
      );
    }

    const ids = [...new Set(body.itens.map((i) => i.studentId))];
    const [alunos, existentes] = await Promise.all([
      prisma.student.findMany({
        where: { id: { in: ids }, schoolId: session.schoolId, deletedAt: null },
        select: { id: true, name: true, class: { select: { name: true } } },
      }),
      prisma.contrato.findMany({
        where: { schoolId: session.schoolId, anoLetivo: body.anoLetivo, modelo: MODELO_CONTRATO_2027, studentId: { in: ids } },
        select: { studentId: true },
      }),
    ]);
    const porId = new Map(alunos.map((a) => [a.id, a]));
    const jaTem = new Set(existentes.map((e) => e.studentId));
    const ipOrigem = getClientIp(request);

    const criados: { id: string; studentId: string; nome: string }[] = [];
    const ignorados: { studentId: string; nome: string; motivo: string }[] = [];

    for (const item of body.itens) {
      const aluno = porId.get(item.studentId);
      if (!aluno) {
        ignorados.push({ studentId: item.studentId, nome: "—", motivo: "Aluno não encontrado" });
        continue;
      }
      if (jaTem.has(aluno.id)) {
        ignorados.push({ studentId: aluno.id, nome: aluno.name, motivo: `Já tem contrato ${body.anoLetivo} do modelo do app` });
        continue;
      }
      const periodo = config.periodos.find((p) => p.chave === item.periodo)!;
      const parcelaBruta = item.parcelaBruta ?? periodo.parcelaBruta;
      const parcelaLiquida = item.parcelaLiquida ?? periodo.parcelaLiquida;
      if (parcelaLiquida > parcelaBruta || parcelaBruta <= 0) {
        ignorados.push({ studentId: aluno.id, nome: aluno.name, motivo: "Valores da parcela inválidos" });
        continue;
      }
      const condicoes: CondicoesContrato = {
        modelo: MODELO_CONTRATO_2027,
        anoLetivo: body.anoLetivo,
        etapa: item.etapa,
        turma: aluno.class.name,
        periodo: item.periodo,
        parcelaBruta,
        parcelaLiquida,
        config,
      };
      const contrato = await prisma.$transaction(async (tx) => {
        const c = await tx.contrato.create({
          data: {
            schoolId: session.schoolId,
            studentId: aluno.id,
            anoLetivo: body.anoLetivo,
            titulo: body.titulo,
            status: "AGUARDANDO_DADOS",
            modelo: MODELO_CONTRATO_2027,
            condicoes: JSON.parse(JSON.stringify(condicoes)),
            criadoPorId: session.sub,
          },
          select: { id: true },
        });
        await tx.contratoEvento.create({
          data: { contratoId: c.id, tipo: "CRIADO", usuarioId: session.sub, ipOrigem, detalhe: `Modelo do app · ${periodo.nome}` },
        });
        return c;
      });
      jaTem.add(aluno.id);
      criados.push({ id: contrato.id, studentId: aluno.id, nome: aluno.name });
      await notifyUsers(await responsaveisDoAluno(aluno.id), {
        title: "Contrato de matrícula 2027",
        body: `Confira os dados e assine o contrato de ${aluno.name.split(" ")[0]} pelo app — leva poucos minutos e é grátis pelo gov.br.`,
        url: "/dashboard/contratos",
      }).catch((err) => console.error("push notify failed", err));
    }

    return NextResponse.json({ criados, ignorados }, { status: criados.length > 0 ? 201 : 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
