import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  comunicado: { findFirst: vi.fn() },
  guardianStudent: { findMany: vi.fn() },
  respostaComunicado: { findMany: vi.fn(), count: vi.fn() },
  comunicadoLeitura: { upsert: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));
const sessaoMock = vi.hoisted(() => ({ atual: { sub: "g1", role: "GUARDIAN", schoolId: "s1" } as { sub: string; role: string; schoolId: string } }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn(async () => sessaoMock.atual), AuthError: class extends Error {} }));
const publicoMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/comunicados", () => ({ getPublicoAlvo: publicoMock }));

import { GET } from "@/app/api/comunicados/[id]/route";
import { separarAbertura } from "@/lib/comunicado-leitura";

const ctx = { params: Promise.resolve({ id: "c1" }) } as never;
const req = () => new NextRequest("http://t/api/comunicados/c1");
const comunicado = {
  id: "c1", tipo: "CIRCULAR", titulo: "Aviso", descricao: "x", audience: "CLASS", classId: "5ano", alunoId: null,
  class: { id: "5ano", name: "5º Ano" }, aluno: null, criadoPor: { id: "d1", name: "Dir", role: "ADMIN", funcao: null, nomeParaFamilias: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessaoMock.atual = { sub: "g1", role: "GUARDIAN", schoolId: "s1" };
  prismaMock.comunicado.findFirst.mockResolvedValue(comunicado);
  prismaMock.guardianStudent.findMany.mockResolvedValue([{ student: { id: "a1", name: "Aluno" } }]);
  prismaMock.respostaComunicado.findMany.mockResolvedValue([]);
});

describe("abertura de comunicado pela família", () => {
  it("abrir registra a leitura (upsert, 1ª abertura vale) e devolve o horário", async () => {
    const quando = new Date("2026-10-14T17:05:00Z");
    prismaMock.comunicadoLeitura.upsert.mockResolvedValue({ lidoEm: quando });
    const res = await GET(req(), ctx);
    const json = await res.json();
    expect(prismaMock.comunicadoLeitura.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { comunicadoId_userId: { comunicadoId: "c1", userId: "g1" } }, update: {} }),
    );
    expect(json.leituraEm).toBe(quando.toISOString());
  });

  it("falha ao gravar não impede a leitura", async () => {
    prismaMock.comunicadoLeitura.upsert.mockRejectedValue(new Error("db"));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).leituraEm).toBeNull();
  });

  it("responsável sem filho no público-alvo não gera leitura", async () => {
    prismaMock.guardianStudent.findMany.mockResolvedValue([]);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.comunicadoLeitura.upsert).not.toHaveBeenCalled();
  });

  it("equipe que abre não registra leitura e vê quem abriu e quem não abriu", async () => {
    sessaoMock.atual = { sub: "d1", role: "ADMIN", schoolId: "s1" };
    publicoMock.mockResolvedValue([
      { guardian: { id: "g1", name: "Ana" }, student: { id: "a1" } },
      { guardian: { id: "g1", name: "Ana" }, student: { id: "a2" } },
      { guardian: { id: "g2", name: "Bruno" }, student: { id: "a3" } },
    ]);
    prismaMock.respostaComunicado.count.mockResolvedValue(0);
    prismaMock.comunicadoLeitura.findMany.mockResolvedValue([{ userId: "g1", lidoEm: new Date("2026-10-14T17:05:00Z") }]);
    const res = await GET(req(), ctx);
    const json = await res.json();
    expect(prismaMock.comunicadoLeitura.upsert).not.toHaveBeenCalled();
    expect(json.abertura.abriram).toHaveLength(1);
    expect(json.abertura.naoAbriram).toEqual([{ id: "g2", name: "Bruno" }]);
  });
});

describe("separarAbertura", () => {
  it("uma linha por responsável, mesmo com vários filhos; ordenado", () => {
    const r = separarAbertura(
      [{ guardian: { id: "g2", name: "Zeca" } }, { guardian: { id: "g3", name: "Ana" } }, { guardian: { id: "g3", name: "Ana" } }],
      [],
    );
    expect(r.abriram).toEqual([]);
    expect(r.naoAbriram.map((p) => p.name)).toEqual(["Ana", "Zeca"]);
  });
});
