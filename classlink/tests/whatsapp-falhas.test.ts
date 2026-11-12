import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  whatsappFalha: { upsert: vi.fn(), findMany: vi.fn() },
  user: { findMany: vi.fn() },
}));
const achaFamilia = vi.hoisted(() => vi.fn());
const achaEquipe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/whatsapp", () => ({ findGuardianByPhone: achaFamilia, findStaffByPhone: achaEquipe }));

import { explicarCodigoFalha, registrarFalhaEntrega, resumoFalhasRecentes } from "@/lib/whatsapp-falhas";

const AGORA = new Date("2026-11-12T15:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  achaFamilia.mockResolvedValue(null);
  achaEquipe.mockResolvedValue(null);
});

describe("explicarCodigoFalha", () => {
  it("131042 aponta para a cobrança no Meta Business Suite", () => {
    expect(explicarCodigoFalha(131042)).toMatch(/Faturamento/);
  });
  it("código desconhecido ainda explica que a Meta recusou", () => {
    expect(explicarCodigoFalha(999)).toMatch(/recusou/);
    expect(explicarCodigoFalha(null)).toMatch(/recusou/);
  });
});

describe("registrarFalhaEntrega", () => {
  it("liga a falha à família dona do telefone e grava uma vez por mensagem", async () => {
    achaFamilia.mockResolvedValue({ id: "g1", schoolId: "s1" });
    await registrarFalhaEntrega({ mensagemId: "wamid.1", telefone: "5521999990000", codigo: 131042, titulo: "Pagamento" });
    const chamada = prismaMock.whatsappFalha.upsert.mock.calls[0][0];
    expect(chamada.where).toEqual({ mensagemId: "wamid.1" });
    expect(chamada.create).toMatchObject({ schoolId: "s1", userId: "g1", codigo: 131042 });
    expect(chamada.update).toEqual({}); // reentrega do webhook não duplica nem sobrescreve
  });

  it("se não for família, tenta a equipe; sem cadastro, grava mesmo assim", async () => {
    achaEquipe.mockResolvedValueOnce({ id: "p1", schoolId: "s1" });
    await registrarFalhaEntrega({ mensagemId: "wamid.2", telefone: "5521911112222" });
    expect(prismaMock.whatsappFalha.upsert.mock.calls[0][0].create).toMatchObject({ userId: "p1" });

    await registrarFalhaEntrega({ mensagemId: "wamid.3", telefone: "5521900000000" });
    expect(prismaMock.whatsappFalha.upsert.mock.calls[1][0].create).toMatchObject({ userId: null, schoolId: null });
  });
});

describe("resumoFalhasRecentes", () => {
  it("sem falhas: resumo vazio", async () => {
    prismaMock.whatsappFalha.findMany.mockResolvedValue([]);
    expect(await resumoFalhasRecentes("s1", AGORA)).toMatchObject({ total: 0, motivo: null, cobrancaPendente: false });
  });

  it("conta mensagens e pessoas, aponta a cobrança e lista quem não recebeu", async () => {
    prismaMock.whatsappFalha.findMany.mockResolvedValue([
      { userId: "g1", codigo: 131042, createdAt: new Date("2026-11-12T15:39:00Z") },
      { userId: "g1", codigo: 131042, createdAt: new Date("2026-11-12T15:38:00Z") },
      { userId: "g2", codigo: 131042, createdAt: new Date("2026-11-12T15:37:00Z") },
      { userId: null, codigo: 131026, createdAt: new Date("2026-11-12T15:36:00Z") },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "g1", name: "Ana" },
      { id: "g2", name: "Bia" },
    ]);
    const r = await resumoFalhasRecentes("s1", AGORA);
    expect(r).toMatchObject({ total: 4, pessoas: 2, cobrancaPendente: true });
    expect(r.motivo).toMatch(/Faturamento/);
    expect(r.ultimas.map((u) => u.nome)).toEqual(["Ana", "Ana", "Bia", "Número sem cadastro"]);
    // só olha a escola e as últimas 48h
    const filtro = prismaMock.whatsappFalha.findMany.mock.calls[0][0].where;
    expect(filtro.schoolId).toBe("s1");
    expect(filtro.createdAt.gte).toEqual(new Date("2026-11-10T15:00:00Z"));
  });
});
