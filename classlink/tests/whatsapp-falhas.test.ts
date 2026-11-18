import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  whatsappFalha: { upsert: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  user: { findMany: vi.fn() },
  lembretePendencia: { findMany: vi.fn(async () => [] as { responsavelId: string; ultimoEnvioStatusEm: Date | null }[]) },
  school: { findUnique: vi.fn(async () => null as { whatsappEntregueEm: Date | null } | null), updateMany: vi.fn() },
}));
const achaFamilia = vi.hoisted(() => vi.fn());
const achaEquipe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/whatsapp", () => ({ findGuardianByPhone: achaFamilia, findStaffByPhone: achaEquipe }));

import {
  bloqueioPorCobranca,
  explicarCodigoFalha,
  falhasDasMensagens,
  registrarEntregaConfirmada,
  registrarFalhaEntrega,
  resumoFalhasRecentes,
  ultimaEntregaDosStatus,
} from "@/lib/whatsapp-falhas";

const AGORA = new Date("2026-11-12T15:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  achaFamilia.mockResolvedValue(null);
  achaEquipe.mockResolvedValue(null);
  prismaMock.school.findUnique.mockResolvedValue(null);
  prismaMock.lembretePendencia.findMany.mockResolvedValue([]);
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

  it("cobrança quitada: recusas 131042 anteriores a uma entrega confirmada saem do quadro", async () => {
    prismaMock.whatsappFalha.findMany.mockResolvedValue([
      { userId: "g1", codigo: 131042, createdAt: new Date("2026-11-11T15:39:00Z") },
      { userId: "g2", codigo: 131026, createdAt: new Date("2026-11-11T15:38:00Z") },
    ]);
    prismaMock.school.findUnique.mockResolvedValue({ whatsappEntregueEm: new Date("2026-11-12T12:40:00Z") });
    prismaMock.lembretePendencia.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "g2", name: "Bia" }]);
    const r = await resumoFalhasRecentes("s1", AGORA);
    // O número sem WhatsApp (131026) continua: a entrega a outras famílias não resolve o caso dela.
    expect(r).toMatchObject({ total: 1, pessoas: 1, cobrancaPendente: false });
    expect(r.ultimas.map((u) => u.nome)).toEqual(["Bia"]);
  });

  it("família cujo lembrete foi entregue depois da falha sai do quadro", async () => {
    prismaMock.whatsappFalha.findMany.mockResolvedValue([
      { userId: "g1", codigo: 131047, createdAt: new Date("2026-11-11T15:39:00Z") },
      { userId: "g2", codigo: 131047, createdAt: new Date("2026-11-11T15:38:00Z") },
    ]);
    prismaMock.school.findUnique.mockResolvedValue({ whatsappEntregueEm: null });
    prismaMock.lembretePendencia.findMany.mockResolvedValue([
      { responsavelId: "g1", ultimoEnvioStatusEm: new Date("2026-11-12T12:40:00Z") },
      { responsavelId: "g2", ultimoEnvioStatusEm: new Date("2026-11-10T12:40:00Z") }, // antes da falha: não conta
    ]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "g2", name: "Bia" }]);
    const r = await resumoFalhasRecentes("s1", AGORA);
    expect(r.ultimas.map((u) => u.nome)).toEqual(["Bia"]);
  });

  it("só recuperadas: quadro some", async () => {
    prismaMock.whatsappFalha.findMany.mockResolvedValue([{ userId: "g1", codigo: 131042, createdAt: new Date("2026-11-11T15:39:00Z") }]);
    prismaMock.school.findUnique.mockResolvedValue({ whatsappEntregueEm: new Date("2026-11-12T12:40:00Z") });
    prismaMock.lembretePendencia.findMany.mockResolvedValue([]);
    expect(await resumoFalhasRecentes("s1", AGORA)).toMatchObject({ total: 0, cobrancaPendente: false });
  });
});

describe("bloqueioPorCobranca", () => {
  it("recusa por pagamento pendente nas últimas 24h bloqueia o canal da escola", async () => {
    const em = new Date("2026-11-12T12:39:00Z");
    prismaMock.whatsappFalha.findFirst.mockResolvedValue({ createdAt: em });
    expect(await bloqueioPorCobranca("s1", AGORA)).toEqual({ desde: em });
    const where = prismaMock.whatsappFalha.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ schoolId: "s1", codigo: 131042 });
    expect(where.createdAt.gte).toEqual(new Date("2026-11-11T15:00:00Z"));
  });
  it("sem recusa recente (conta quitada): canal liberado", async () => {
    prismaMock.whatsappFalha.findFirst.mockResolvedValue(null);
    expect(await bloqueioPorCobranca("s1", AGORA)).toBeNull();
  });
  it("entrega confirmada depois da recusa (conta paga): o aviso some na hora, sem esperar 24 h", async () => {
    prismaMock.whatsappFalha.findFirst.mockResolvedValue({ createdAt: new Date("2026-11-12T12:39:00Z") });
    prismaMock.school.findUnique.mockResolvedValueOnce({ whatsappEntregueEm: new Date("2026-11-12T14:00:00Z") });
    expect(await bloqueioPorCobranca("s1", AGORA)).toBeNull();
  });
  it("entrega antiga (antes da recusa) não libera", async () => {
    const em = new Date("2026-11-12T12:39:00Z");
    prismaMock.whatsappFalha.findFirst.mockResolvedValue({ createdAt: em });
    prismaMock.school.findUnique.mockResolvedValueOnce({ whatsappEntregueEm: new Date("2026-11-12T10:00:00Z") });
    expect(await bloqueioPorCobranca("s1", AGORA)).toEqual({ desde: em });
  });
});

describe("entrega confirmada pelo webhook", () => {
  it("pega o horário mais recente entre delivered/read e ignora sent/failed", () => {
    const r = ultimaEntregaDosStatus(
      [
        { status: "sent", timestamp: "1762958000" },
        { status: "delivered", timestamp: "1762950000" },
        { status: "read", timestamp: "1762955000" },
        { status: "failed", timestamp: "1762959000" },
      ],
      AGORA,
    );
    expect(r).toEqual(new Date(1762955000 * 1000));
  });
  it("sem entrega: null", () => {
    expect(ultimaEntregaDosStatus([{ status: "failed", timestamp: "1" }], AGORA)).toBeNull();
  });
  it("grava só se for mais nova que a registrada", async () => {
    const em = new Date("2026-11-17T15:40:00Z");
    await registrarEntregaConfirmada(em);
    expect(prismaMock.school.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ whatsappEntregueEm: null }, { whatsappEntregueEm: { lt: em } }] },
      data: { whatsappEntregueEm: em },
    });
  });
});

describe("falhasDasMensagens", () => {
  it("explica a falha de cada mensagem pelo id do WhatsApp", async () => {
    prismaMock.whatsappFalha.findMany.mockResolvedValue([{ mensagemId: "wamid.1", codigo: 131042 }]);
    const mapa = await falhasDasMensagens(["wamid.1", "wamid.2"]);
    expect(mapa.get("wamid.1")).toMatch(/Pagamento pendente/);
    expect(mapa.has("wamid.2")).toBe(false);
  });
  it("sem mensagens de WhatsApp, nem consulta o banco", async () => {
    expect((await falhasDasMensagens([])).size).toBe(0);
    expect(prismaMock.whatsappFalha.findMany).not.toHaveBeenCalled();
  });
});
