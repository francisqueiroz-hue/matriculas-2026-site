import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Rota "Conferir assinatura" da secretaria: só ADMIN, só contratos da própria escola, só envios
// da família (ASSINADO), e diz se o nome do certificado bate com um responsável cadastrado.

const pdf = readFileSync(join(__dirname, "fixtures/contrato-assinado-teste.pdf"));
const contratoFindFirst = vi.fn();
const arquivoFindFirst = vi.fn();
const requireRole = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { contrato: { findFirst: (a: unknown) => contratoFindFirst(a) }, contratoArquivo: { findFirst: (a: unknown) => arquivoFindFirst(a) } },
}));
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));
vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/session", () => {
  class AuthError extends Error {
    constructor(
      m: string,
      readonly status = 401,
    ) {
      super(m);
    }
  }
  return { AuthError, requireRole: (...r: string[]) => requireRole(...r) };
});

import { GET } from "@/app/api/admin/contratos/[id]/assinatura/route";

const ctx = { params: Promise.resolve({ id: "c1" }) } as never;
const pedir = (q = "?arquivoId=f1") => GET(new NextRequest(`http://t/api/admin/contratos/c1/assinatura${q}`), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ sub: "u1", role: "ADMIN", schoolId: "s1" });
  contratoFindFirst.mockResolvedValue({ id: "c1", student: { guardians: [{ guardian: { name: "Maria de Teste" } }, { guardian: { name: "João" } }] } });
  arquivoFindFirst.mockResolvedValue({ conteudo: pdf, blobPath: null });
});

describe("GET /api/admin/contratos/[id]/assinatura", () => {
  it("devolve a conferência e acha o responsável pelo nome do certificado", async () => {
    const res = await pedir();
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.assinaturas[0]).toMatchObject({ signatario: "MARIA DE TESTE", integridade: "INTEGRA", responsavelCadastrado: "Maria de Teste" });
    expect(requireRole).toHaveBeenCalledWith("ADMIN");
    expect(contratoFindFirst.mock.calls[0][0].where).toMatchObject({ id: "c1", schoolId: "s1" });
    expect(arquivoFindFirst.mock.calls[0][0].where).toEqual({ id: "f1", contratoId: "c1", tipo: "ASSINADO" });
  });

  it("contrato de outra escola: 404", async () => {
    contratoFindFirst.mockResolvedValue(null);
    expect((await pedir()).status).toBe(404);
  });

  it("sem arquivoId: 400", async () => {
    expect((await pedir("")).status).toBe(400);
  });

  it("responsável (não ADMIN) não acessa", async () => {
    const { AuthError } = await import("@/lib/session");
    requireRole.mockRejectedValue(new AuthError("Sem permissão", 403));
    expect((await pedir()).status).toBe(403);
  });
});
