import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  student: { findFirst: vi.fn(), update: vi.fn() },
  class: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const sessaoMock = vi.hoisted(() => ({ atual: { sub: "u1", role: "ADMIN", schoolId: "s1" } as { sub: string; role: string; schoolId: string } }));
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

const ctx = { params: Promise.resolve({ id: "a1" }) } as never;
const editar = (corpo: unknown) =>
  PATCH(new NextRequest("http://t/api/admin/students/a1", { method: "PATCH", body: JSON.stringify(corpo) }), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessaoMock.atual = { sub: "u1", role: "ADMIN", schoolId: "s1" };
  prismaMock.student.findFirst.mockResolvedValue({ id: "a1", name: "Sarah", schoolId: "s1" });
  prismaMock.student.update.mockImplementation(async ({ data }) => ({ id: "a1", name: "Sarah", ...data }));
  prismaMock.class.findFirst.mockResolvedValue({ id: "t2", schoolId: "s1" });
});

describe("editar nome do aluno", () => {
  it("administração corrige o nome, sem espaços sobrando", async () => {
    const res = await editar({ name: "  Sara " });
    expect(res.status).toBe(200);
    expect(prismaMock.student.update.mock.calls[0][0]).toEqual({ where: { id: "a1" }, data: { name: "Sara" } });
    expect((await res.json()).student.name).toBe("Sara");
  });

  it("nome em branco é recusado", async () => {
    expect((await editar({ name: "   " })).status).toBe(400);
    expect(prismaMock.student.update).not.toHaveBeenCalled();
  });

  it("nome com mais de 150 caracteres é recusado", async () => {
    expect((await editar({ name: "a".repeat(151) })).status).toBe(400);
    expect(prismaMock.student.update).not.toHaveBeenCalled();
  });

  it("equipe e família não editam", async () => {
    for (const role of ["STAFF", "GUARDIAN"]) {
      sessaoMock.atual = { sub: "u2", role, schoolId: "s1" };
      expect((await editar({ name: "Sara" })).status).toBe(403);
    }
    expect(prismaMock.student.update).not.toHaveBeenCalled();
  });

  it("aluno de outra escola ou excluído: 404", async () => {
    prismaMock.student.findFirst.mockResolvedValue(null);
    expect((await editar({ name: "Sara" })).status).toBe(404);
    expect(prismaMock.student.findFirst.mock.calls[0][0].where).toEqual({ id: "a1", schoolId: "s1", deletedAt: null });
    expect(prismaMock.student.update).not.toHaveBeenCalled();
  });

  it("turma de outra escola não é aceita", async () => {
    prismaMock.class.findFirst.mockResolvedValue(null);
    expect((await editar({ classId: "t-outra" })).status).toBe(404);
    expect(prismaMock.class.findFirst.mock.calls[0][0].where).toEqual({ id: "t-outra", schoolId: "s1" });
    expect(prismaMock.student.update).not.toHaveBeenCalled();
  });
});
