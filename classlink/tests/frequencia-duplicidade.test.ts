import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  class: { findFirst: vi.fn() },
  student: { findMany: vi.fn() },
  attendance: { count: vi.fn(), createMany: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/visibilidade-server", () => ({ exigirArea: async () => {} }));
vi.mock("@/lib/turmas-acesso", () => ({ exigirLecionaNaTurma: async () => {} }));
const ErroAuth = vi.hoisted(
  () =>
    class extends Error {
      status = 403;
    },
);
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async () => ({ sub: "prof1", role: "STAFF", schoolId: "s1" })),
  AuthError: ErroAuth,
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));

import { POST } from "@/app/api/attendance/route";
import { CODIGO_FREQUENCIA_JA_LANCADA, mensagemFrequenciaJaLancada } from "@/lib/attendance";

const marks = [
  { studentId: "a1", status: "PRESENT" },
  { studentId: "a2", status: "ABSENT" },
];
const post = (corpo: Record<string, unknown>) =>
  new NextRequest("http://t/api/attendance", {
    method: "POST",
    body: JSON.stringify({ classId: "t1", date: "2026-11-26", marks, ...corpo }),
  });
const erroUnico = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  prismaMock.class.findFirst.mockResolvedValue({ id: "t1", schoolId: "s1" });
  prismaMock.student.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
  prismaMock.attendance.count.mockResolvedValue(0);
  prismaMock.attendance.createMany.mockResolvedValue({ count: 2 });
  prismaMock.$transaction.mockResolvedValue([]);
});

describe("POST /api/attendance: lançamento repetido no mesmo dia", () => {
  it("primeiro lançamento grava todos os alunos num único INSERT", async () => {
    const r = await POST(post({}));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, editado: false });
    expect(prismaMock.attendance.createMany).toHaveBeenCalledTimes(1);
    const { data } = prismaMock.attendance.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ studentId: "a1", status: "PRESENT", markedById: "prof1" });
    expect(data[0].date.toISOString()).toBe("2026-11-26T00:00:00.000Z");
    expect(prismaMock.attendance.upsert).not.toHaveBeenCalled();
  });

  it("bloqueia (409) um segundo lançamento do mesmo dia e não grava nada", async () => {
    prismaMock.attendance.count.mockResolvedValue(2);
    const r = await POST(post({}));
    expect(r.status).toBe(409);
    const corpo = await r.json();
    expect(corpo.codigo).toBe(CODIGO_FREQUENCIA_JA_LANCADA);
    expect(corpo.error).toBe(mensagemFrequenciaJaLancada("2026-11-26"));
    expect(corpo.error).toContain("26/11/2026");
    expect(prismaMock.attendance.createMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("confere o dia certo e só os alunos da chamada", async () => {
    await POST(post({}));
    const { where } = prismaMock.attendance.count.mock.calls[0][0];
    expect(where.date.toISOString()).toBe("2026-11-26T00:00:00.000Z");
    expect(where.studentId).toEqual({ in: ["a1", "a2"] });
  });

  it("bloqueia mesmo se só parte da turma já tinha frequência no dia", async () => {
    prismaMock.attendance.count.mockResolvedValue(1);
    const r = await POST(post({}));
    expect(r.status).toBe(409);
    expect(prismaMock.attendance.createMany).not.toHaveBeenCalled();
  });

  it("duplo clique / dois aparelhos ao mesmo tempo: o banco recusa o segundo e vira 409", async () => {
    // As duas requisições passam pela checagem (nenhuma vê a outra ainda); o índice único
    // (aluno, dia) do banco aceita só um INSERT.
    prismaMock.attendance.createMany.mockResolvedValueOnce({ count: 2 }).mockRejectedValueOnce(erroUnico());
    const [r1, r2] = await Promise.all([POST(post({})), POST(post({}))]);
    const status = [r1.status, r2.status].sort();
    expect(status).toEqual([200, 409]);
    const recusada = r1.status === 409 ? r1 : r2;
    expect((await recusada.json()).codigo).toBe(CODIGO_FREQUENCIA_JA_LANCADA);
  });

  it("outro erro do banco não é mascarado como duplicidade", async () => {
    prismaMock.attendance.createMany.mockRejectedValueOnce(new Error("conexão caiu"));
    const r = await POST(post({}));
    expect(r.status).toBe(500);
  });

  it("recusa o mesmo aluno duas vezes na mesma chamada", async () => {
    const r = await POST(post({ marks: [marks[0], { studentId: "a1", status: "ABSENT" }] }));
    expect(r.status).toBe(400);
    expect(prismaMock.attendance.createMany).not.toHaveBeenCalled();
  });

  it("edição explícita (editar: true) atualiza o lançamento existente, sem duplicar", async () => {
    prismaMock.attendance.count.mockResolvedValue(2);
    const r = await POST(post({ editar: true }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, editado: true });
    expect(prismaMock.attendance.createMany).not.toHaveBeenCalled();
    expect(prismaMock.attendance.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.attendance.upsert.mock.calls[0][0].where.studentId_date.studentId).toBe("a1");
  });

  it("aluno de outra turma continua recusado", async () => {
    prismaMock.student.findMany.mockResolvedValue([{ id: "a1" }]);
    const r = await POST(post({}));
    expect(r.status).toBe(400);
    expect(prismaMock.attendance.createMany).not.toHaveBeenCalled();
  });
});
