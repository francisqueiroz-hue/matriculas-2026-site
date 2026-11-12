import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  guardianStudent: { findMany: vi.fn() },
  classTeacher: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));

import { alunosDaFamilia, turmasDaFamilia, turmasQueAcompanha, visibilidadePorPublico } from "@/lib/escopo-acesso";

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

  it("turmas da família saem sem repetição", async () => {
    expect(await turmasDaFamilia("g1")).toEqual(["5ano", "2ano"]);
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
