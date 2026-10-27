import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  guardianStudent: { findMany: vi.fn() },
  classTeacher: { findMany: vi.fn() },
  comunicado: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));
const sessaoMock = vi.hoisted(() => ({ atual: { sub: "g1", role: "GUARDIAN", schoolId: "s1" } as { sub: string; role: string; schoolId: string } }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => sessaoMock.atual),
  requireRole: vi.fn(async () => sessaoMock.atual),
  AuthError: class extends Error {},
}));
const publicoMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/comunicados", () => ({ getPublicoAlvo: publicoMock }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn() }));

import { GET } from "@/app/api/comunicados/route";
import { alunosSemResposta, situacaoDoComunicado } from "@/lib/comunicados-situacao";
import { countPendentes } from "@/lib/nav-links";

const agora = new Date(2026, 9, 27, 12, 0, 0);
const iso = (d: number) => new Date(2026, 9, d, 9, 0, 0).toISOString();
const circular = { tipo: "CIRCULAR", dataCriacao: iso(20), prazoResposta: null, minhasRespostas: [], alunosAlvo: 3 };

describe("circular: abrir conta como lida", () => {
  it("circular ainda não aberta fica pendente (não lida)", () => {
    expect(situacaoDoComunicado({ ...circular, lidoEm: null }, agora)).toBe("PENDENTE");
  });

  it("circular aberta sai de pendente, mesmo sem resposta e com vários filhos", () => {
    expect(situacaoDoComunicado({ ...circular, lidoEm: iso(21) }, agora)).toBe("LIDO");
    expect(alunosSemResposta({ ...circular, lidoEm: null })).toBe(0);
  });

  it("resposta LIDO antiga também vale como leitura", () => {
    const c = { ...circular, minhasRespostas: [{ alunoId: "a1", resposta: "LIDO" }] };
    expect(situacaoDoComunicado(c, agora)).toBe("LIDO");
  });

  it("autorização continua dependendo de resposta: abrir não basta", () => {
    const c = { ...circular, tipo: "AUTORIZACAO_PASSEIO", alunosAlvo: 1, lidoEm: iso(21) };
    expect(situacaoDoComunicado(c, agora)).toBe("PENDENTE");
  });

  it("contador do menu da família ignora circulares já abertas", () => {
    const lista = [
      { ...circular, lidoEm: iso(21) },
      { ...circular, lidoEm: iso(22) },
      { ...circular, lidoEm: null },
    ];
    expect(countPendentes(lista, "GUARDIAN")).toBe(1);
  });

  it("contador do menu da equipe não conta circular, só o que espera resposta", () => {
    const aberta = { dataCriacao: iso(20), prazoResposta: null, totalRespostas: 1, totalPublicoAlvo: 5 };
    const lista = [
      { ...aberta, tipo: "CIRCULAR" },
      { ...aberta, tipo: "CIRCULAR" },
      { ...aberta, tipo: "AUTORIZACAO_PASSEIO" },
    ];
    expect(countPendentes(lista, "ADMIN")).toBe(1);
    expect(countPendentes(lista, "STAFF")).toBe(1);
  });
});

const base = {
  titulo: "Aviso",
  descricao: "x",
  audience: "SCHOOL",
  classId: null,
  alunoId: null,
  class: null,
  aluno: null,
  criadoPor: { id: "d1", name: "Dir", role: "ADMIN", funcao: null, nomeParaFamilias: null },
  dataCriacao: new Date("2026-10-20T12:00:00Z"),
  prazoResposta: null,
  respostas: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  sessaoMock.atual = { sub: "g1", role: "GUARDIAN", schoolId: "s1" };
});

describe("GET /api/comunicados", () => {
  it("família recebe lidoEm da própria abertura e a lista sai como lida", async () => {
    prismaMock.guardianStudent.findMany.mockResolvedValue([
      { studentId: "a1", student: { classId: "t1" } },
      { studentId: "a2", student: { classId: "t2" } },
    ]);
    const quando = new Date("2026-10-21T10:00:00Z");
    prismaMock.comunicado.findMany.mockResolvedValue([{ ...base, id: "c1", tipo: "CIRCULAR", leituras: [{ userId: "g1", lidoEm: quando }] }]);

    const json = await (await GET()).json();
    const args = prismaMock.comunicado.findMany.mock.calls[0][0];
    expect(args.include.leituras).toEqual({ where: { userId: "g1" }, select: { userId: true, lidoEm: true } });
    expect(json.comunicados[0].lidoEm).toBe(quando.toISOString());
    expect(json.comunicados[0].leituras).toBeUndefined();
    expect(situacaoDoComunicado(json.comunicados[0])).toBe("LIDO");
  });

  it("equipe vê na circular quantas famílias abriram, uma por responsável (irmãos não duplicam)", async () => {
    sessaoMock.atual = { sub: "d1", role: "ADMIN", schoolId: "s1" };
    publicoMock.mockResolvedValue([
      { guardian: { id: "g1", name: "Ana" }, guardianId: "g1", studentId: "a1" },
      { guardian: { id: "g1", name: "Ana" }, guardianId: "g1", studentId: "a2" },
      { guardian: { id: "g1", name: "Ana" }, guardianId: "g1", studentId: "a3" },
      { guardian: { id: "g2", name: "Bruno" }, guardianId: "g2", studentId: "a4" },
    ]);
    prismaMock.comunicado.findMany.mockResolvedValue([
      { ...base, id: "c1", tipo: "CIRCULAR", leituras: [{ userId: "g1", lidoEm: new Date() }] },
    ]);

    const json = await (await GET()).json();
    expect(json.comunicados[0].totalRespostas).toBe(1);
    expect(json.comunicados[0].totalPublicoAlvo).toBe(2);
  });
});
