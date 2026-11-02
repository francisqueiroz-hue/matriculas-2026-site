import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  classTeacher: { findFirst: vi.fn(), findMany: vi.fn() },
  class: { findFirst: vi.fn() },
  student: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  guardianStudent: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const blobMock = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blobMock);

import {
  exigirAlunoPublicavel,
  exigirLecionaNaTurma,
  exigirPodeVerAluno,
  exigirTurmaPublicavel,
  turmasQueLeciona,
} from "@/lib/turmas-acesso";
import { inicioDoBlob, juntarPartes } from "@/lib/blob-storage";

const admin = { sub: "a1", role: "ADMIN" as const, schoolId: "e1" };
const professor = { sub: "p1", role: "STAFF" as const, schoolId: "e1" };
const responsavel = { sub: "r1", role: "GUARDIAN" as const, schoolId: "e1" };

beforeEach(() => vi.resetAllMocks());

describe("acesso por turma", () => {
  it("direção passa sem consultar vínculo; professor precisa lecionar", async () => {
    await exigirLecionaNaTurma(admin, "t1");
    expect(prismaMock.classTeacher.findFirst).not.toHaveBeenCalled();

    prismaMock.classTeacher.findFirst.mockResolvedValueOnce({ id: "v1" });
    await expect(exigirLecionaNaTurma(professor, "t1")).resolves.toBeUndefined();
    expect(prismaMock.classTeacher.findFirst).toHaveBeenCalledWith({ where: { classId: "t1", teacherId: "p1" } });

    prismaMock.classTeacher.findFirst.mockResolvedValueOnce(null);
    await expect(exigirLecionaNaTurma(professor, "t2")).rejects.toMatchObject({ status: 403 });
  });

  it("turma de outra escola dá 404 antes de checar o professor", async () => {
    prismaMock.class.findFirst.mockResolvedValueOnce(null);
    await expect(exigirTurmaPublicavel(professor, "t9")).rejects.toMatchObject({ status: 404 });
    expect(prismaMock.class.findFirst).toHaveBeenCalledWith({ where: { id: "t9", schoolId: "e1" } });
    expect(prismaMock.classTeacher.findFirst).not.toHaveBeenCalled();
  });

  it("aluno publicável: confere escola, exclusão e a turma do aluno", async () => {
    prismaMock.student.findFirst.mockResolvedValueOnce({ id: "s1", classId: "t1" });
    prismaMock.classTeacher.findFirst.mockResolvedValueOnce(null);
    await expect(exigirAlunoPublicavel(professor, "s1")).rejects.toThrow("Você não leciona na turma deste aluno.");
    expect(prismaMock.student.findFirst.mock.calls[0][0].where).toEqual({ id: "s1", schoolId: "e1", deletedAt: null });

    prismaMock.student.findFirst.mockResolvedValueOnce({ id: "s1", classId: "t1" });
    await expect(exigirAlunoPublicavel(admin, "s1")).resolves.toEqual({ id: "s1", classId: "t1" });
  });

  it("turmas que leciona sem repetir", async () => {
    prismaMock.classTeacher.findMany.mockResolvedValueOnce([{ classId: "t1" }, { classId: "t2" }, { classId: "t1" }]);
    expect(await turmasQueLeciona("p1")).toEqual(["t1", "t2"]);
  });
});

describe("quem pode ver dados do aluno", () => {
  it("professor da turma, coordenação e responsável vinculado podem; os demais não", async () => {
    prismaMock.classTeacher.findFirst.mockResolvedValueOnce({ id: "v1" });
    await expect(exigirPodeVerAluno(professor, "s1", "ao boletim")).resolves.toBeUndefined();

    prismaMock.classTeacher.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce({ isCoordenacao: true });
    await expect(exigirPodeVerAluno(professor, "s1", "ao boletim")).resolves.toBeUndefined();

    prismaMock.classTeacher.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce({ isCoordenacao: false });
    await expect(exigirPodeVerAluno(professor, "s1", "ao boletim")).rejects.toThrow("Você não tem acesso ao boletim deste aluno.");

    prismaMock.guardianStudent.findFirst.mockResolvedValueOnce({ id: "g1" });
    await expect(exigirPodeVerAluno(responsavel, "s1", "à frequência")).resolves.toBeUndefined();

    prismaMock.guardianStudent.findFirst.mockResolvedValueOnce(null);
    await expect(exigirPodeVerAluno(responsavel, "s2", "à frequência")).rejects.toMatchObject({ status: 403 });
  });
});

describe("leitura parcial do Blob", () => {
  it("junta pedaços e lê só o começo, informando o tamanho total", async () => {
    expect(juntarPartes([new Uint8Array([1, 2]), new Uint8Array([3])])).toEqual(new Uint8Array([1, 2, 3]));

    const cancel = vi.fn(async () => undefined);
    const pedacos = [new Uint8Array(40).fill(1), new Uint8Array(40).fill(2), new Uint8Array(40).fill(3)];
    const read = vi.fn(async () => {
      const value = pedacos.shift();
      return value ? { value, done: false } : { value: undefined, done: true };
    });
    blobMock.get.mockResolvedValueOnce({ statusCode: 200, stream: { getReader: () => ({ read, cancel }) }, blob: { size: 5000 } });
    const lido = await inicioDoBlob("classlink/e1/x.png");
    expect(lido?.inicio.length).toBe(64);
    expect(lido?.tamanho).toBe(5000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalled();

    blobMock.get.mockResolvedValueOnce(null);
    expect(await inicioDoBlob("classlink/e1/sumiu.png")).toBeNull();
  });
});
