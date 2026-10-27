import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { alteracoesAluno } from "@/lib/historico-cadastro";

const prismaMock = vi.hoisted(() => {
  const m = {
    student: { findFirst: vi.fn(), update: vi.fn() },
    class: { findFirst: vi.fn() },
    alteracaoCadastro: { createMany: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(async () => []),
  };
  return m;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
type Sessao = { sub: string; name: string; role: string; schoolId: string };
const sessaoMock = vi.hoisted(() => ({ atual: { sub: "u1", name: "Diretora Ana", role: "ADMIN", schoolId: "s1" } as Sessao }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(sessaoMock.atual.role)) {
      const { AuthError } = await import("@/lib/session");
      throw new AuthError("Acesso negado para este perfil", 403);
    }
    return sessaoMock.atual;
  }),
  AuthError: class AuthError extends Error {
    constructor(
      message: string,
      readonly status = 401,
    ) {
      super(message);
    }
  },
}));

import { PATCH } from "@/app/api/admin/students/[id]/route";
import { GET } from "@/app/api/admin/students/[id]/historico/route";

const ctx = { params: Promise.resolve({ id: "a1" }) } as never;
const editar = (corpo: unknown) =>
  PATCH(new NextRequest("http://t/api/admin/students/a1", { method: "PATCH", body: JSON.stringify(corpo) }), ctx);
const verHistorico = () => GET(new NextRequest("http://t/api/admin/students/a1/historico"), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessaoMock.atual = { sub: "u1", name: "Diretora Ana", role: "ADMIN", schoolId: "s1" };
  prismaMock.student.findFirst.mockResolvedValue({
    id: "a1",
    name: "Sarah",
    schoolId: "s1",
    birthDate: new Date("2021-03-10T00:00:00.000Z"),
    class: { id: "t1", name: "Infantil 3", year: 2026 },
  });
  prismaMock.student.update.mockImplementation(async ({ data }) => ({ id: "a1", ...data }));
  prismaMock.class.findFirst.mockResolvedValue({ id: "t2", name: "Infantil 4", year: 2026 });
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
});

describe("alteracoesAluno", () => {
  const base = {
    nome: "Sarah",
    turma: { id: "t1", name: "Infantil 3", year: 2026 },
    nascimento: new Date("2021-03-10T00:00:00.000Z"),
  };

  it("gera uma linha por campo alterado", () => {
    expect(alteracoesAluno(base, { ...base, nome: "Sara", turma: { id: "t2", name: "Infantil 4", year: 2026 } })).toEqual([
      { campo: "nome", valorAnterior: "Sarah", valorNovo: "Sara" },
      { campo: "turma", valorAnterior: "Infantil 3 (2026)", valorNovo: "Infantil 4 (2026)" },
    ]);
  });

  it("nada muda, nada é registrado", () => {
    expect(alteracoesAluno(base, { ...base, nascimento: new Date("2021-03-10T00:00:00.000Z") })).toEqual([]);
  });

  it("troca entre turmas de mesmo nome (anos diferentes) é registrada", () => {
    expect(alteracoesAluno(base, { ...base, turma: { id: "t9", name: "Infantil 3", year: 2027 } })).toEqual([
      { campo: "turma", valorAnterior: "Infantil 3 (2026)", valorNovo: "Infantil 3 (2027)" },
    ]);
  });

  it("data de nascimento vira AAAA-MM-DD; vazia vira null", () => {
    expect(alteracoesAluno({ ...base, nascimento: null }, base)).toEqual([
      { campo: "nascimento", valorAnterior: null, valorNovo: "2021-03-10" },
    ]);
  });
});

describe("registro ao editar o aluno", () => {
  it("guarda quem alterou, o campo, o valor anterior e o novo", async () => {
    expect((await editar({ name: "Sara" })).status).toBe(200);
    expect(prismaMock.alteracaoCadastro.createMany).toHaveBeenCalledWith({
      data: [
        {
          campo: "nome",
          valorAnterior: "Sarah",
          valorNovo: "Sara",
          schoolId: "s1",
          entidade: "ALUNO",
          entidadeId: "a1",
          porUserId: "u1",
          porNome: "Diretora Ana",
        },
      ],
    });
  });

  it("troca de turma fica registrada pelo nome da turma", async () => {
    await editar({ classId: "t2" });
    const linhas = prismaMock.alteracaoCadastro.createMany.mock.calls[0][0].data;
    expect(linhas).toEqual([expect.objectContaining({ campo: "turma", valorAnterior: "Infantil 3 (2026)", valorNovo: "Infantil 4 (2026)" })]);
  });

  it("salvar o mesmo nome não gera registro", async () => {
    expect((await editar({ name: "Sarah" })).status).toBe(200);
    expect(prismaMock.alteracaoCadastro.createMany).not.toHaveBeenCalled();
  });

  it("o aluno é lido e travado dentro da transação (edições simultâneas não usam o mesmo antes)", async () => {
    const ordem: string[] = [];
    prismaMock.$queryRaw.mockImplementation(async () => (ordem.push("trava"), []));
    prismaMock.student.findFirst.mockImplementation(async () => {
      ordem.push("leitura");
      return { id: "a1", name: "Sarah", schoolId: "s1", birthDate: null, class: { id: "t1", name: "Infantil 3", year: 2026 } };
    });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => {
      ordem.push("inicio");
      return fn(prismaMock);
    });
    await editar({ name: "Sara" });
    expect(ordem).toEqual(["inicio", "trava", "leitura"]);
  });

  it("alteração e registro andam juntos: se o registro falha, a edição falha", async () => {
    prismaMock.alteracaoCadastro.createMany.mockRejectedValue(new Error("falha no banco"));
    expect((await editar({ name: "Sara" })).status).toBe(500);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("consulta do histórico", () => {
  it("Administração vê o histórico do aluno da própria escola", async () => {
    prismaMock.alteracaoCadastro.findMany.mockResolvedValue([
      {
        id: "h1",
        campo: "nome",
        valorAnterior: "Sarah",
        valorNovo: "Sara",
        porNome: "Diretora Ana",
        criadoEm: new Date("2026-10-27T19:00:00.000Z"),
      },
    ]);
    const res = await verHistorico();
    expect(res.status).toBe(200);
    expect((await res.json()).historico[0]).toEqual({
      id: "h1",
      campo: "nome",
      valorAnterior: "Sarah",
      valorNovo: "Sara",
      porNome: "Diretora Ana",
      criadoEm: "2026-10-27T19:00:00.000Z",
    });
    expect(prismaMock.alteracaoCadastro.findMany.mock.calls[0][0].where).toEqual({ schoolId: "s1", entidade: "ALUNO", entidadeId: "a1" });
  });

  it("equipe e família não veem o histórico", async () => {
    for (const role of ["STAFF", "GUARDIAN"]) {
      sessaoMock.atual = { sub: "u2", name: "X", role, schoolId: "s1" };
      expect((await verHistorico()).status).toBe(403);
    }
    expect(prismaMock.alteracaoCadastro.findMany).not.toHaveBeenCalled();
  });

  it("aluno de outra escola: 404", async () => {
    prismaMock.student.findFirst.mockResolvedValue(null);
    expect((await verHistorico()).status).toBe(404);
    expect(prismaMock.student.findFirst.mock.calls[0][0].where).toEqual({ id: "a1", schoolId: "s1" });
    expect(prismaMock.alteracaoCadastro.findMany).not.toHaveBeenCalled();
  });
});
