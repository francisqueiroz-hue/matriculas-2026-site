import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  erroServidor: { updateMany: vi.fn(), count: vi.fn(), create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  cspViolacao: { findMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const sessao = vi.hoisted(() => ({ role: "ADMIN" }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(sessao.role)) {
      const { AuthError } = await import("@/lib/session");
      throw new AuthError("Acesso negado para este perfil", 403);
    }
    return { sub: "u1", role: sessao.role, schoolId: "s1" };
  }),
  AuthError: class AuthError extends Error {
    constructor(
      m: string,
      readonly status = 401,
    ) {
      super(m);
    }
  },
}));

import { registrarErroServidor, resumirErro } from "@/lib/erros-servidor";
import { handleApiError } from "@/lib/http";
import { DELETE as limpar, GET as saude } from "@/app/api/admin/saude/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessao.role = "ADMIN";
  prismaMock.erroServidor.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.erroServidor.count.mockResolvedValue(0);
  prismaMock.erroServidor.create.mockResolvedValue({});
});

describe("resumo do erro sem dados pessoais", () => {
  it("só a 1ª linha, com e-mail, telefone, CPF e ids mascarados", () => {
    const e = Object.assign(new Error("Falha para maria@escola.com.br tel 21 99137-8093 cpf 123.456.789-09 id cmvi7sm32000007jqx31dfzhv\nlinha 2 com segredo"), {
      name: "PrismaClientKnownRequestError",
      code: "P2025",
    });
    const r = resumirErro(e);
    expect(r.origem).toBe("PrismaClientKnownRequestError P2025");
    expect(r.mensagem).not.toMatch(/maria|99137|456\.789|cmvi7|segredo/);
    expect(r.mensagem).toContain("[e-mail]");
    expect(r.mensagem).toContain("[id]");
  });
});

describe("registro", () => {
  it("soma no grupo existente ou cria um novo; nunca lança", async () => {
    prismaMock.erroServidor.updateMany.mockResolvedValueOnce({ count: 1 });
    await registrarErroServidor(new Error("x"));
    expect(prismaMock.erroServidor.create).not.toHaveBeenCalled();

    await registrarErroServidor(new Error("novo"), "GET /dashboard");
    expect(prismaMock.erroServidor.create.mock.calls[0][0].data).toMatchObject({ origem: "GET /dashboard · Erro", mensagem: "novo" });

    prismaMock.erroServidor.updateMany.mockRejectedValue(new Error("banco fora"));
    await expect(registrarErroServidor(new Error("y"))).resolves.toBeUndefined();
  });

  it("respeita o limite de grupos", async () => {
    prismaMock.erroServidor.count.mockResolvedValue(500);
    await registrarErroServidor(new Error("z"));
    expect(prismaMock.erroServidor.create).not.toHaveBeenCalled();
  });

  it("handleApiError registra só erros inesperados (500)", async () => {
    const res = handleApiError(new Error("quebrou"));
    expect(res.status).toBe(500);
    await new Promise((r) => setTimeout(r, 0));
    expect(prismaMock.erroServidor.create).toHaveBeenCalled();
  });
});

describe("rota de saúde do sistema", () => {
  it("só a direção vê e limpa", async () => {
    sessao.role = "STAFF";
    expect((await saude()).status).toBe(403);
    expect((await limpar(new NextRequest("http://t/api/admin/saude", { method: "DELETE" }))).status).toBe(403);
  });

  it("lista erros e alertas e limpa cada tipo", async () => {
    prismaMock.erroServidor.findMany.mockResolvedValue([{ id: "e1" }]);
    prismaMock.cspViolacao.findMany.mockResolvedValue([]);
    const dados = await (await saude()).json();
    expect(dados.erros).toHaveLength(1);
    prismaMock.erroServidor.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.cspViolacao.deleteMany.mockResolvedValue({ count: 3 });
    expect(await (await limpar(new NextRequest("http://t/api/admin/saude", { method: "DELETE" }))).json()).toEqual({ removidos: 1 });
    expect(await (await limpar(new NextRequest("http://t/api/admin/saude?tipo=csp", { method: "DELETE" }))).json()).toEqual({ removidos: 3 });
  });
});
