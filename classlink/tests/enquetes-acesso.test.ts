import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ enquete: { findFirst: vi.fn() }, user: { findMany: vi.fn() }, guardianStudent: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));
const perfis = vi.hoisted(() => new Map<string, { role: string; funcao: string | null; isCoordenacao: boolean }>());
vi.mock("@/lib/session", () => ({
  perfilDaSessao: vi.fn(async (s: { sub: string }) => perfis.get(s.sub)),
}));
vi.mock("@/lib/escopo-acesso", () => ({
  visibilidadePorPublico: vi.fn(async () => ({ condicoes: [{ audience: "SCHOOL" }], vinculos: [] })),
}));

import { carregarEnqueteVisivel, filtroDeVisibilidadeEnquetes, publicoDaEnquete, respondeEstaEnquete } from "@/lib/enquetes-acesso";

const s = (sub: string, role: string) => ({ sub, role, schoolId: "s1" }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  perfis.clear();
  perfis.set("dir", { role: "ADMIN", funcao: "DIRECAO", isCoordenacao: false });
  perfis.set("sec", { role: "ADMIN", funcao: "SECRETARIA", isCoordenacao: false });
  perfis.set("coord", { role: "STAFF", funcao: "COORDENACAO", isCoordenacao: true });
  perfis.set("prof", { role: "STAFF", funcao: "PROFESSOR", isCoordenacao: false });
  perfis.set("aux", { role: "STAFF", funcao: "AUXILIAR", isCoordenacao: false });
  perfis.set("antigo", { role: "STAFF", funcao: null, isCoordenacao: false });
});

describe("quem vê quais enquetes", () => {
  it("família: só as enquetes às famílias, nunca as internas", async () => {
    expect(await filtroDeVisibilidadeEnquetes(s("g1", "GUARDIAN"))).toEqual({ interna: false, OR: [{ audience: "SCHOOL" }] });
  });

  it("professor, auxiliar e cadastro antigo sem função: só as internas", async () => {
    for (const sub of ["prof", "aux", "antigo"]) expect(await filtroDeVisibilidadeEnquetes(s(sub, "STAFF"))).toEqual({ interna: true });
  });

  it("direção, secretaria e coordenação: todas", async () => {
    expect(await filtroDeVisibilidadeEnquetes(s("dir", "ADMIN"))).toEqual({});
    expect(await filtroDeVisibilidadeEnquetes(s("sec", "ADMIN"))).toEqual({});
    expect(await filtroDeVisibilidadeEnquetes(s("coord", "STAFF"))).toEqual({});
  });

  it("a consulta da enquete aplica o filtro junto com a escola", async () => {
    prismaMock.enquete.findFirst.mockResolvedValue(null);
    await carregarEnqueteVisivel(s("prof", "STAFF"), "e1");
    expect(prismaMock.enquete.findFirst.mock.calls[0][0].where).toEqual({ AND: [{ id: "e1", schoolId: "s1" }, { interna: true }] });
  });
});

describe("quem responde", () => {
  it("família responde a das famílias; professor e auxiliar, a interna; gestão não responde", async () => {
    expect(await respondeEstaEnquete(s("g1", "GUARDIAN"), { interna: false })).toBe(true);
    expect(await respondeEstaEnquete(s("g1", "GUARDIAN"), { interna: true })).toBe(false);
    expect(await respondeEstaEnquete(s("prof", "STAFF"), { interna: true })).toBe(true);
    expect(await respondeEstaEnquete(s("aux", "STAFF"), { interna: true })).toBe(true);
    expect(await respondeEstaEnquete(s("prof", "STAFF"), { interna: false })).toBe(false);
    expect(await respondeEstaEnquete(s("coord", "STAFF"), { interna: true })).toBe(false);
    expect(await respondeEstaEnquete(s("dir", "ADMIN"), { interna: true })).toBe(false);
  });

  it("público da interna: professores e auxiliares ativos da escola (sem famílias)", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "prof", name: "P" }]);
    await publicoDaEnquete({ schoolId: "s1", audience: "SCHOOL", classId: null, alunoId: null, interna: true });
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ schoolId: "s1", active: true, deletedAt: null, role: "STAFF", isCoordenacao: false });
    expect(prismaMock.guardianStudent.findMany).not.toHaveBeenCalled();
  });
});
