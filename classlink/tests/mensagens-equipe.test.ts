import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  mensagemEquipe: { findMany: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  mensagemEquipeResposta: { create: vi.fn(), findMany: vi.fn() },
  mensagemEquipeLeitura: { upsert: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));
vi.mock("@/lib/visibilidade-server", () => ({ exigirArea: async () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn(async () => undefined) }));

type Perfil = { role: "ADMIN" | "STAFF" | "GUARDIAN"; funcao: string | null; isCoordenacao: boolean };
const PERFIS: Record<string, Perfil> = {
  dir: { role: "ADMIN", funcao: "DIRECAO", isCoordenacao: false },
  sec: { role: "ADMIN", funcao: "SECRETARIA", isCoordenacao: false },
  coord: { role: "STAFF", funcao: "COORDENACAO", isCoordenacao: true },
  prof: { role: "STAFF", funcao: "PROFESSOR", isCoordenacao: false },
  aux: { role: "STAFF", funcao: "AUXILIAR", isCoordenacao: false },
  fam: { role: "GUARDIAN", funcao: null, isCoordenacao: false },
};
const atual = vi.hoisted(() => ({ sub: "dir" }));
vi.mock("@/lib/session", async (orig) => {
  const real = await orig<typeof import("@/lib/session")>();
  return {
    ...real,
    requireRole: vi.fn(async (...roles: string[]) => {
      const role = PERFIS[atual.sub].role;
      if (!roles.includes(role)) throw new real.AuthError("Acesso negado", 403);
      return { sub: atual.sub, role, schoolId: "s1" };
    }),
  };
});

import { GET as listar, POST as criar } from "@/app/api/team-messages/geral/route";
import { DELETE as excluir, GET as abrir, POST as responder } from "@/app/api/team-messages/geral/[id]/route";

const ctx = { params: Promise.resolve({ id: "m1" }) } as never;
const json = (url: string, corpo: unknown) => new NextRequest(url, { method: "POST", body: JSON.stringify(corpo) });
const autor = { id: "dir", name: "Francis", role: "ADMIN", isCoordenacao: false, funcao: "DIRECAO" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  atual.sub = "dir";
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => PERFIS[where.id] ?? null);
  prismaMock.mensagemEquipe.findMany.mockResolvedValue([]);
  prismaMock.mensagemEquipe.findFirst.mockResolvedValue({ id: "m1", autorId: "dir", titulo: "Reunião" });
  prismaMock.mensagemEquipe.findUniqueOrThrow.mockResolvedValue({ id: "m1", titulo: "Reunião", corpo: "Sexta", createdAt: new Date(), autor, respostas: [] });
  prismaMock.mensagemEquipe.create.mockResolvedValue({ id: "m1", autor: { name: "Francis" } });
  prismaMock.mensagemEquipeResposta.create.mockResolvedValue({ id: "r1", corpo: "Ok", createdAt: new Date(), autor: { ...autor, id: "prof", role: "STAFF", funcao: "PROFESSOR" } });
});

describe("mensagens para toda a equipe", () => {
  it("direção e coordenação escrevem; secretaria, professor e auxiliar não", async () => {
    for (const sub of ["dir", "coord"]) {
      atual.sub = sub;
      expect((await criar(json("http://t/api/team-messages/geral", { titulo: "Reunião", corpo: "Sexta às 14h" }))).status).toBe(201);
    }
    for (const sub of ["sec", "prof", "aux"]) {
      atual.sub = sub;
      expect((await criar(json("http://t/api/team-messages/geral", { titulo: "X", corpo: "Y" }))).status).toBe(403);
    }
    expect(prismaMock.mensagemEquipe.create).toHaveBeenCalledTimes(2);
  });

  it("família não lista, não abre e não responde", async () => {
    atual.sub = "fam";
    expect((await listar()).status).toBe(403);
    expect((await abrir(new NextRequest("http://t"), ctx)).status).toBe(403);
    expect((await responder(json("http://t", { corpo: "oi" }), ctx)).status).toBe(403);
    expect(prismaMock.mensagemEquipe.findMany).not.toHaveBeenCalled();
  });

  it("toda a equipe abre e responde; a lista é sempre da escola da sessão", async () => {
    for (const sub of ["dir", "sec", "coord", "prof", "aux"]) {
      atual.sub = sub;
      expect((await listar()).status).toBe(200);
      expect((await abrir(new NextRequest("http://t"), ctx)).status).toBe(200);
      expect((await responder(json("http://t", { corpo: "Ciente" }), ctx)).status).toBe(201);
    }
    expect(prismaMock.mensagemEquipe.findMany.mock.calls[0][0].where).toEqual({ schoolId: "s1" });
    expect(prismaMock.mensagemEquipe.findFirst.mock.calls[0][0].where).toEqual({ id: "m1", schoolId: "s1" });
  });

  it("assunto de outra escola: 404", async () => {
    prismaMock.mensagemEquipe.findFirst.mockResolvedValue(null);
    expect((await abrir(new NextRequest("http://t"), ctx)).status).toBe(404);
    expect((await responder(json("http://t", { corpo: "x" }), ctx)).status).toBe(404);
  });

  it("só a gestão exclui; professor recebe 403", async () => {
    atual.sub = "prof";
    expect((await excluir(new NextRequest("http://t"), ctx)).status).toBe(403);
    atual.sub = "coord";
    expect((await excluir(new NextRequest("http://t"), ctx)).status).toBe(200);
    expect(prismaMock.mensagemEquipe.delete).toHaveBeenCalledTimes(1);
  });

  it("lista informa se a pessoa pode escrever", async () => {
    atual.sub = "prof";
    expect((await (await listar()).json()).podeEscrever).toBe(false);
    atual.sub = "coord";
    expect((await (await listar()).json()).podeEscrever).toBe(true);
  });
});
