import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  guardianStudent: { findMany: vi.fn(), findFirst: vi.fn() },
  classTeacher: { findMany: vi.fn(), findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));

import { AuthError } from "@/lib/session";
import {
  alunosDaFamilia,
  exigirAcessoAoAluno,
  turmasDaFamilia,
  turmasDoProfessor,
  turmasQueAcompanha,
  visibilidadePorPublico,
} from "@/lib/escopo-acesso";

const familia = { sub: "g1", role: "GUARDIAN" };
const professor = { sub: "p1", role: "STAFF" };
const direcao = { sub: "d1", role: "ADMIN" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.guardianStudent.findMany.mockResolvedValue([
    { studentId: "a1", student: { classId: "5ano" } },
    { studentId: "a2", student: { classId: "5ano" } },
    { studentId: "a3", student: { classId: "2ano" } },
  ]);
  prismaMock.classTeacher.findMany.mockResolvedValue([{ classId: "3ano" }, { classId: "3ano" }, { classId: "4ano" }]);
});

describe("alunos e turmas da família", () => {
  it("só considera filhos não excluídos e devolve a turma de cada um", async () => {
    expect(await alunosDaFamilia("g1")).toEqual([
      { studentId: "a1", classId: "5ano" },
      { studentId: "a2", classId: "5ano" },
      { studentId: "a3", classId: "2ano" },
    ]);
    expect(prismaMock.guardianStudent.findMany.mock.calls[0][0].where).toEqual({
      guardianId: "g1",
      student: { deletedAt: null },
    });
  });

  it("turmas da família e do professor saem sem repetição", async () => {
    expect(await turmasDaFamilia("g1")).toEqual(["5ano", "2ano"]);
    expect(await turmasDoProfessor("p1")).toEqual(["3ano", "4ano"]);
  });
});

describe("turmasQueAcompanha (Mural e Agenda)", () => {
  it("família → turmas dos filhos; professor → onde dá aula; direção → todas (null)", async () => {
    expect(await turmasQueAcompanha(familia)).toEqual(["5ano", "2ano"]);
    expect(await turmasQueAcompanha(professor)).toEqual(["3ano", "4ano"]);
    expect(await turmasQueAcompanha(direcao)).toBeNull();
  });
});

describe("visibilidadePorPublico (comunicados e enquetes)", () => {
  it("família vê escola, turmas dos filhos e só os individuais dos próprios filhos", async () => {
    const { condicoes, vinculos } = await visibilidadePorPublico(familia);
    expect(condicoes).toEqual([
      { audience: "SCHOOL" },
      { audience: "CLASS", classId: { in: ["5ano", "2ano"] } },
      { audience: "STUDENT", alunoId: { in: ["a1", "a2", "a3"] } },
    ]);
    expect(vinculos).toHaveLength(3);
  });

  it("professor vê escola, suas turmas e individuais de alunos dessas turmas", async () => {
    const { condicoes, vinculos } = await visibilidadePorPublico(professor);
    expect(condicoes).toEqual([
      { audience: "SCHOOL" },
      { audience: "CLASS", classId: { in: ["3ano", "4ano"] } },
      { audience: "STUDENT", classId: { in: ["3ano", "4ano"] } },
    ]);
    expect(vinculos).toEqual([]);
  });

  it("direção não tem restrição e não consulta vínculos", async () => {
    expect(await visibilidadePorPublico(direcao)).toEqual({ condicoes: undefined, vinculos: [] });
    expect(prismaMock.guardianStudent.findMany).not.toHaveBeenCalled();
    expect(prismaMock.classTeacher.findMany).not.toHaveBeenCalled();
  });
});

describe("exigirAcessoAoAluno (frequência e boletim)", () => {
  const msg = "Sem acesso a este aluno";

  it("direção sempre pode", async () => {
    await expect(exigirAcessoAoAluno(direcao, "a1", msg)).resolves.toBeUndefined();
  });

  it("professor pode se leciona na turma do aluno", async () => {
    prismaMock.classTeacher.findFirst.mockResolvedValue({ id: "ct1" });
    await expect(exigirAcessoAoAluno(professor, "a1", msg)).resolves.toBeUndefined();
  });

  it("coordenação pode mesmo sem lecionar; professor comum recebe 403", async () => {
    prismaMock.classTeacher.findFirst.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ isCoordenacao: true });
    await expect(exigirAcessoAoAluno(professor, "a1", msg)).resolves.toBeUndefined();

    prismaMock.user.findUnique.mockResolvedValue({ isCoordenacao: false });
    const erro = await exigirAcessoAoAluno(professor, "a1", msg).catch((e) => e);
    expect(erro).toBeInstanceOf(AuthError);
    expect(erro).toMatchObject({ message: msg, status: 403 });
  });

  it("família só pode ver filho vinculado", async () => {
    prismaMock.guardianStudent.findFirst.mockResolvedValue({ guardianId: "g1", studentId: "a1" });
    await expect(exigirAcessoAoAluno(familia, "a1", msg)).resolves.toBeUndefined();

    prismaMock.guardianStudent.findFirst.mockResolvedValue(null);
    await expect(exigirAcessoAoAluno(familia, "outro", msg)).rejects.toMatchObject({ message: msg, status: 403 });
  });
});
