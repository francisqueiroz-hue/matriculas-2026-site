import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  guardianStudent: { findMany: vi.fn() },
  classTeacher: { findMany: vi.fn() },
  post: { findMany: vi.fn(), findFirst: vi.fn() },
  postRead: { upsert: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const sessaoMock = vi.hoisted(() => ({ atual: { sub: "u1", role: "GUARDIAN", schoolId: "s1" } as { sub: string; role: string; schoolId: string } }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => sessaoMock.atual),
  requireRole: vi.fn(async () => sessaoMock.atual),
  AuthError: class extends Error {},
}));
vi.mock("@prisma/client", () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
vi.mock("@/lib/firebase-storage", () => ({ getSignedMediaUrl: vi.fn() }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn() }));

import { GET } from "@/app/api/posts/route";
import { POST as marcarLido } from "@/app/api/posts/[id]/read/route";
import { GET as quemLeu } from "@/app/api/posts/[id]/reads/route";
import { filtroDeVisibilidade } from "@/lib/visibilidade-posts";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const req = () => new NextRequest("http://t/api/posts");

beforeEach(() => {
  vi.clearAllMocks();
  sessaoMock.atual = { sub: "u1", role: "GUARDIAN", schoolId: "s1" };
  prismaMock.post.findMany.mockResolvedValue([]);
});

describe("filtroDeVisibilidade", () => {
  it("direção (null) não restringe; senão, escola toda + só as turmas informadas", () => {
    expect(filtroDeVisibilidade(null)).toEqual({});
    expect(filtroDeVisibilidade(["A"])).toEqual({ OR: [{ audience: "SCHOOL" }, { audience: "CLASS", classId: { in: ["A"] } }] });
  });
});

describe("Mural: família só vê avisos (e cardápios) da turma dos filhos", () => {
  it("lista: restringe às turmas dos filhos, sem repetir turma", async () => {
    prismaMock.guardianStudent.findMany.mockResolvedValue([{ student: { classId: "5ano" } }, { student: { classId: "5ano" } }]);
    await GET(req());
    const where = prismaMock.post.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ audience: "SCHOOL" }, { audience: "CLASS", classId: { in: ["5ano"] } }]);
    expect(JSON.stringify(where)).not.toContain("bercario");
  });

  it("família sem filhos ativos não vê aviso de turma nenhuma", async () => {
    prismaMock.guardianStudent.findMany.mockResolvedValue([]);
    await GET(req());
    expect(prismaMock.post.findMany.mock.calls[0][0].where.OR).toEqual([{ audience: "SCHOOL" }, { audience: "CLASS", classId: { in: [] } }]);
  });

  it("professor: só as turmas em que dá aula", async () => {
    sessaoMock.atual = { sub: "p1", role: "STAFF", schoolId: "s1" };
    prismaMock.classTeacher.findMany.mockResolvedValue([{ classId: "3ano" }]);
    await GET(req());
    expect(prismaMock.post.findMany.mock.calls[0][0].where.OR[1]).toEqual({ audience: "CLASS", classId: { in: ["3ano"] } });
  });

  it("direção vê tudo da escola", async () => {
    sessaoMock.atual = { sub: "d1", role: "ADMIN", schoolId: "s1" };
    await GET(req());
    expect(prismaMock.post.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it("confirmar leitura de aviso de outra turma: 404 (a busca leva o filtro de visibilidade)", async () => {
    prismaMock.guardianStudent.findMany.mockResolvedValue([{ student: { classId: "5ano" } }]);
    prismaMock.post.findFirst.mockResolvedValue(null);
    const res = await marcarLido(req(), ctx("post-do-bercario"));
    expect(res.status).toBe(404);
    const where = prismaMock.post.findFirst.mock.calls[0][0].where;
    expect(where.OR[1]).toEqual({ audience: "CLASS", classId: { in: ["5ano"] } });
    expect(prismaMock.postRead.upsert).not.toHaveBeenCalled();
  });

  it("'quem leu' de aviso de turma alheia: 404 para o professor", async () => {
    sessaoMock.atual = { sub: "p1", role: "STAFF", schoolId: "s1" };
    prismaMock.classTeacher.findMany.mockResolvedValue([{ classId: "3ano" }]);
    prismaMock.post.findFirst.mockResolvedValue(null);
    const res = await quemLeu(req(), ctx("post-de-outra-turma"));
    expect(res.status).toBe(404);
    expect(prismaMock.postRead.findMany).not.toHaveBeenCalled();
  });
});
