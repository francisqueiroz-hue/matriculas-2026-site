import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({ consentimentoLgpd: { updateMany: vi.fn(), create: vi.fn() } }));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  student: { findFirst: vi.fn(), findMany: vi.fn() },
  matriculaDocumento: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  consentimentoLgpd: { findMany: vi.fn(), updateMany: vi.fn() },
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

import { GET as lista } from "@/app/api/fichas-matricula/route";
import { GET as ficha } from "@/app/api/fichas-matricula/[studentId]/route";
import { PUT as salvarDocumento } from "@/app/api/fichas-matricula/[studentId]/documentos/route";
import { POST as registrar } from "@/app/api/fichas-matricula/[studentId]/consentimentos/route";
import { DELETE as revogar } from "@/app/api/fichas-matricula/[studentId]/consentimentos/[consentimentoId]/route";

const ctx = { params: Promise.resolve({ studentId: "a1", consentimentoId: "c1" }) } as never;
const aluno = {
  id: "a1",
  name: "Lia",
  class: { id: "t1", name: "Maternal", year: 2027 },
  guardians: [{ relation: "mãe", guardian: { id: "g1", name: "Ana Souza" } }],
};
const req = (url: string, metodo = "GET", corpo?: unknown) =>
  new NextRequest(`http://t${url}`, { method: metodo, ...(corpo !== undefined && { body: JSON.stringify(corpo) }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessaoMock.atual = { sub: "u1", role: "ADMIN", schoolId: "s1" };
  prismaMock.student.findFirst.mockResolvedValue(aluno);
  prismaMock.matriculaDocumento.findMany.mockResolvedValue([]);
  prismaMock.consentimentoLgpd.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe("acesso", () => {
  it("família não acessa a ficha", async () => {
    sessaoMock.atual = { sub: "g1", role: "GUARDIAN", schoolId: "s1" };
    expect((await ficha(req("/api/fichas-matricula/a1"), ctx)).status).toBe(403);
    expect((await lista(req("/api/fichas-matricula"))).status).toBe(403);
  });

  it("aluno de outra escola: 404", async () => {
    prismaMock.student.findFirst.mockResolvedValue(null);
    expect((await ficha(req("/api/fichas-matricula/a1"), ctx)).status).toBe(404);
    expect(prismaMock.student.findFirst.mock.calls[0][0].where).toMatchObject({ id: "a1", schoolId: "s1", deletedAt: null });
  });
});

describe("documentos", () => {
  it("STAFF não vê o laudo: nem pede ao banco, nem aparece no checklist", async () => {
    sessaoMock.atual = { sub: "u2", role: "STAFF", schoolId: "s1" };
    const res = await ficha(req("/api/fichas-matricula/a1"), ctx);
    const dados = await res.json();
    expect(res.status).toBe(200);
    expect(prismaMock.matriculaDocumento.findMany.mock.calls[0][0].where.tipo.in).not.toContain("LAUDO");
    expect(dados.documentos.map((d: { tipo: string }) => d.tipo)).not.toContain("LAUDO");
    expect(dados.anoLetivo).toBe(2027);
  });

  it("STAFF não edita o laudo (403); direção edita", async () => {
    sessaoMock.atual = { sub: "u2", role: "STAFF", schoolId: "s1" };
    const corpo = { anoLetivo: 2027, tipo: "LAUDO", recebido: true };
    expect((await salvarDocumento(req("/api/fichas-matricula/a1/documentos", "PUT", corpo), ctx)).status).toBe(403);
    expect(prismaMock.matriculaDocumento.upsert).not.toHaveBeenCalled();

    sessaoMock.atual = { sub: "u1", role: "ADMIN", schoolId: "s1" };
    prismaMock.matriculaDocumento.findUnique.mockResolvedValue(null);
    prismaMock.matriculaDocumento.upsert.mockImplementation(async (a: { create: Record<string, unknown> }) => ({ id: "d1", prazo: null, observacao: null, ...a.create }));
    const res = await salvarDocumento(req("/api/fichas-matricula/a1/documentos", "PUT", corpo), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).documento).toMatchObject({ tipo: "LAUDO", recebido: true, voluntario: true });
  });

  it("marca como entregue gravando recebidoEm, na escola da sessão", async () => {
    prismaMock.matriculaDocumento.findUnique.mockResolvedValue(null);
    prismaMock.matriculaDocumento.upsert.mockImplementation(async (a: { create: Record<string, unknown> }) => ({ id: "d1", prazo: null, observacao: null, ...a.create }));
    const res = await salvarDocumento(req("/api/fichas-matricula/a1/documentos", "PUT", { anoLetivo: 2027, tipo: "CPF", recebido: true }), ctx);
    expect(res.status).toBe(200);
    const args = prismaMock.matriculaDocumento.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ studentId_anoLetivo_tipo: { studentId: "a1", anoLetivo: 2027, tipo: "CPF" } });
    expect(args.create).toMatchObject({ schoolId: "s1", studentId: "a1", recebido: true });
    expect(args.create.recebidoEm).toBeInstanceOf(Date);
  });

  it("entrada inválida: 400", async () => {
    const res = await salvarDocumento(req("/api/fichas-matricula/a1/documentos", "PUT", { anoLetivo: 2027, tipo: "RG" }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("consentimentos", () => {
  it("registra com o nome do responsável vinculado e encerra o ativo da mesma finalidade", async () => {
    tx.consentimentoLgpd.create.mockImplementation(async (a: { data: unknown }) => ({ id: "c2", ...(a.data as object) }));
    const res = await registrar(
      req("/api/fichas-matricula/a1/consentimentos", "POST", { finalidade: "USO_DE_IMAGEM", versaoTexto: "2027-v1", consentidoPorId: "g1" }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(tx.consentimentoLgpd.updateMany.mock.calls[0][0]).toMatchObject({
      where: { studentId: "a1", finalidade: "USO_DE_IMAGEM", revogadoEm: null },
    });
    expect(tx.consentimentoLgpd.create.mock.calls[0][0].data).toMatchObject({
      schoolId: "s1",
      studentId: "a1",
      finalidade: "USO_DE_IMAGEM",
      versaoTexto: "2027-v1",
      consentidoPorId: "g1",
      consentidoPorNome: "Ana Souza",
    });
  });

  it("recusa responsável que não é deste aluno", async () => {
    const res = await registrar(
      req("/api/fichas-matricula/a1/consentimentos", "POST", { finalidade: "USO_DE_IMAGEM", versaoTexto: "v1", consentidoPorId: "outro" }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(tx.consentimentoLgpd.create).not.toHaveBeenCalled();
  });

  it("revogar preenche revogadoEm (nunca apaga) e só uma vez", async () => {
    prismaMock.consentimentoLgpd.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await revogar(req("/x", "DELETE"), ctx)).status).toBe(200);
    const args = prismaMock.consentimentoLgpd.updateMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ id: "c1", studentId: "a1", schoolId: "s1", revogadoEm: null });
    expect(args.data.revogadoEm).toBeInstanceOf(Date);
    expect((await revogar(req("/x", "DELETE"), ctx)).status).toBe(404);
  });
});
