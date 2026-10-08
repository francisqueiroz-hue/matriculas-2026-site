import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import type { ContratoStatus } from "@/lib/contratos";

const STATUS_VALIDOS: ContratoStatus[] = ["AGUARDANDO_DADOS", "AGUARDANDO_ASSINATURA", "EM_CONFERENCIA", "AGUARDANDO_ORIGINAL", "COMPLETO", "DEVOLVIDO"];

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
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("GUARDIAN", "ADMIN");

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
          modelo: true,
          createdAt: true,
          student: { select: { id: true, name: true, class: { select: { name: true } } } },
          arquivos: { select: { id: true, tipo: true, nomeArquivo: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        },
        orderBy: [{ anoLetivo: "desc" }, { createdAt: "desc" }],
      });
      return NextResponse.json({ contratos });
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
          modelo: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              name: true,
              class: { select: { name: true } },
              guardians: { select: { relation: true, guardian: { select: { id: true, name: true, phone: true } } } },
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
      contratos,
      resumo: resumo.map((r) => ({ status: r.status, total: r._count._all })),
      anos: anos.map((a) => a.anoLetivo),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
