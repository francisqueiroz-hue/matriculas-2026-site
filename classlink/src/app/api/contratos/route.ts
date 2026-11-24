import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirDirecaoSeAdmin, requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import type { ContratoStatus } from "@/lib/contratos";
import { MODELO_CONTRATO_2027, valoresDoContrato } from "@/lib/contrato-modelo/tipos";
import { ROTULO_SITUACAO, conferirValor, precisaAtualizar } from "@/lib/contrato-modelo/conferencia";
import { exigirArea } from "@/lib/visibilidade-server";
import { destinoContrato, responsavelVeContrato } from "@/lib/responsavel-financeiro";

const STATUS_VALIDOS: ContratoStatus[] = ["AGUARDANDO_ASSINATURA", "EM_CONFERENCIA", "AGUARDANDO_ORIGINAL", "COMPLETO", "DEVOLVIDO"];

// Metadados dos arquivos — nunca o conteúdo (`conteudo` fica fora de toda listagem).
const arquivoSelect = {
  id: true,
  tipo: true,
  nomeArquivo: true,
  tamanhoBytes: true,
  sha256: true,
  ipOrigem: true,
  createdAt: true,
  enviadoPor: { select: { id: true, name: true } },
} as const;

/**
 * Lista contratos. Responsável: só os dos alunos vinculados a ele (sem dados de auditoria
 * da equipe). Direção: todos da escola, com filtros por ano/situação, arquivos e histórico.
 */
/**
 * A lista só precisa saber se a família já preencheu os dados no app (não os dados em si) e
 * os valores do contrato (não o resto das condições).
 */
function semDadosFamilia<T extends { dadosFamilia: unknown; condicoes: unknown }>({ dadosFamilia, condicoes, ...resto }: T) {
  return { ...resto, dadosPreenchidos: dadosFamilia !== null, valores: valoresDoContrato(condicoes) };
}

/**
 * Para a direção: o valor que saiu no contrato do app (renovação 2027) confere com a mensalidade
 * cadastrada corrigida? Só faz sentido para o modelo do app; nos demais, null.
 */
function conferenciaDoContrato(
  c: { modelo: string | null; anoLetivo: number; status: string; condicoes: unknown; arquivos: { tipo: string }[] },
  aluno: { mensalidadeValor: unknown; bolsista: boolean },
) {
  if (c.modelo !== MODELO_CONTRATO_2027 || c.anoLetivo !== 2027) return null;
  const conf = conferirValor(c.condicoes, {
    mensalidade: aluno.mensalidadeValor === null || aluno.mensalidadeValor === undefined ? null : Number(aluno.mensalidadeValor),
    bolsista: aluno.bolsista,
  });
  const assinado = c.arquivos.some((a) => a.tipo === "ASSINADO") || c.status !== "AGUARDANDO_ASSINATURA";
  return { ...conf, rotulo: ROTULO_SITUACAO[conf.situacao], assinado, atualizavel: !assinado && precisaAtualizar(conf.situacao) };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("GUARDIAN", "ADMIN");
    await exigirArea(session, "CONTRATOS");
    // Da administração, só a direção vê contratos e boletos (valores).
    await exigirDirecaoSeAdmin(session);

    if (session.role === "GUARDIAN") {
      const contratos = await prisma.contrato.findMany({
        where: {
          schoolId: session.schoolId,
          student: { deletedAt: null, guardians: { some: { guardianId: session.sub } } },
        },
        select: {
          id: true,
          titulo: true,
          anoLetivo: true,
          status: true,
          metodoAssinatura: true,
          assinadoEnviadoEm: true,
          motivoDevolucao: true,
          confirmadoPelaEscola: true,
          modelo: true,
          dadosFamilia: true,
          condicoes: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              name: true,
              class: { select: { name: true } },
              guardians: {
                select: {
                  guardianId: true,
                  responsavelFinanceiro: true,
                  guardian: { select: { active: true, deletedAt: true, role: true } },
                },
              },
            },
          },
          arquivos: { select: { id: true, tipo: true, nomeArquivo: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        },
        orderBy: [{ anoLetivo: "desc" }, { createdAt: "desc" }],
      });
      // Com mais de um responsável, só o financeiro (quem assina) vê o contrato.
      const visiveis = contratos
        .filter((c) =>
          responsavelVeContrato(
            c.student.guardians.map((g) => ({
              guardianId: g.guardianId,
              responsavelFinanceiro: g.responsavelFinanceiro,
              ativo: g.guardian.active && !g.guardian.deletedAt && g.guardian.role === "GUARDIAN",
            })),
            session.sub,
          ),
        )
        // Os vínculos dos outros responsáveis não vão para a família.
        .map((c) => ({ ...c, student: { id: c.student.id, name: c.student.name, class: c.student.class } }));
      // A família vê só o total e as parcelas do novo contrato; o percentual de correção fica com a escola.
      return NextResponse.json({
        contratos: visiveis.map(semDadosFamilia).map((c) => ({ ...c, valores: c.valores && { ...c.valores, reajuste: null } })),
      });
    }

    const params = request.nextUrl.searchParams;
    const ano = Number(params.get("ano")) || undefined;
    const statusParam = params.get("status") as ContratoStatus | null;
    const status = statusParam && STATUS_VALIDOS.includes(statusParam) ? statusParam : undefined;

    const filtroBase = { schoolId: session.schoolId, student: { deletedAt: null }, ...(ano ? { anoLetivo: ano } : {}) };

    const [contratos, resumo, anos] = await Promise.all([
      prisma.contrato.findMany({
        where: { ...filtroBase, ...(status ? { status } : {}) },
        select: {
          id: true,
          titulo: true,
          anoLetivo: true,
          status: true,
          metodoAssinatura: true,
          assinadoEnviadoEm: true,
          motivoDevolucao: true,
          confirmadoPelaEscola: true,
          modelo: true,
          dadosFamilia: true,
          condicoes: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              name: true,
              class: { select: { name: true } },
              mensalidadeValor: true,
              bolsista: true,
              guardians: {
                orderBy: { createdAt: "asc" },
                select: {
                  relation: true,
                  responsavelFinanceiro: true,
                  guardian: { select: { id: true, name: true, phone: true, active: true, deletedAt: true, role: true } },
                },
              },
            },
          },
          arquivos: { select: arquivoSelect, orderBy: { createdAt: "desc" } },
          eventos: {
            select: {
              id: true,
              tipo: true,
              ipOrigem: true,
              arquivoSha256: true,
              detalhe: true,
              createdAt: true,
              usuario: { select: { name: true, role: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ student: { name: "asc" } }, { createdAt: "desc" }],
      }),
      prisma.contrato.groupBy({ by: ["status"], where: filtroBase, _count: { _all: true } }),
      prisma.contrato.findMany({
        where: { schoolId: session.schoolId },
        distinct: ["anoLetivo"],
        select: { anoLetivo: true },
        orderBy: { anoLetivo: "desc" },
      }),
    ]);

    return NextResponse.json({
      contratos: contratos.map((c) => {
        const { mensalidadeValor, bolsista, guardians, ...resto } = c.student;
        const vinculos = guardians.map((g) => ({
          guardianId: g.guardian.id,
          responsavelFinanceiro: g.responsavelFinanceiro,
          ativo: g.guardian.active && !g.guardian.deletedAt && g.guardian.role === "GUARDIAN",
        }));
        const destino = destinoContrato(vinculos);
        // Na tela só entram os responsáveis ativos (com o dado de quem é o financeiro).
        const student = {
          ...resto,
          guardians: guardians
            .filter((_, i) => vinculos[i].ativo)
            .map((g) => ({
              relation: g.relation,
              responsavelFinanceiro: g.responsavelFinanceiro,
              guardian: { id: g.guardian.id, name: g.guardian.name, phone: g.guardian.phone },
            })),
          destino,
        };
        return { ...semDadosFamilia({ ...c, student }), conferencia: conferenciaDoContrato(c, { mensalidadeValor, bolsista }) };
      }),
      resumo: resumo.map((r) => ({ status: r.status, total: r._count._all })),
      anos: anos.map((a) => a.anoLetivo),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
