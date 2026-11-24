import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco, push e WhatsApp simulados: nenhum envio real acontece nestes testes.
const prismaMock = vi.hoisted(() => ({
  school: { findUnique: vi.fn() },
  contrato: { findMany: vi.fn() },
  comunicado: { findMany: vi.fn() },
  respostaComunicado: { findMany: vi.fn() },
  guardianStudent: { findMany: vi.fn() },
  boleto: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  solicitacaoMatricula: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  lembretePendencia: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
}));
const notifyUsers = vi.hoisted(() => vi.fn());
const sendTemplate = vi.hoisted(() => vi.fn());
const sendText = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/push", () => ({ notifyUsers, origemPublica: () => "https://app.exemplo.com" }));
vi.mock("@/lib/whatsapp", () => ({
  isWhatsAppConfigured: () => true,
  normalizePhoneBR: (p: string) => p,
  sendWhatsAppTextMessage: sendText,
  sendWhatsAppTemplateMessage: sendTemplate,
}));
vi.mock("@/lib/whatsapp-modelos", () => ({ modeloDisponivel: async () => ({ name: "aviso", language: "pt_BR" }) }));
vi.mock("@/lib/avisos-equipe", () => ({
  deveAvisarPorWhatsApp: (d: { avisosWhatsApp: boolean; aparelhosComPush: number }) => d.avisosWhatsApp || d.aparelhosComPush === 0,
  parametrosModeloAviso: (r: string, t: string, l: string) => [r, t, l],
}));

import { devolverEnvioFalho, executarLembretesDaEscola, registrarStatusLembrete } from "@/lib/lembretes-server";

const QUARTA = new Date("2026-11-04T13:00:00Z");
const DOMINGO = new Date("2026-11-08T13:00:00Z");
const config = (ativos: boolean) => ({
  lembretesAtivos: ativos,
  lembretesTipos: ["CONTRATO", "COMUNICADO", "BOLETO", "REMATRICULA"],
  lembretesDiasInicio: 3,
  lembretesIntervaloDias: 3,
  lembretesMaxEnvios: 4,
});

const ATIVO = { active: true, deletedAt: null, role: "GUARDIAN" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.school.findUnique.mockResolvedValue(config(true));
  // Um contrato aguardando assinatura há 5 dias, de uma aluna com mãe e pai vinculados.
  prismaMock.contrato.findMany.mockImplementation(async (args: { where: { status?: { in: string[] }; anoLetivo?: number } }) =>
    args.where.status?.in.includes("AGUARDANDO_ASSINATURA")
      ? [
          {
            id: "c1",
            anoLetivo: 2027,
            status: "AGUARDANDO_ASSINATURA",
            updatedAt: new Date("2026-10-30T12:00:00Z"),
            student: { name: "Ana Souza", guardians: [{ guardianId: "mae", guardian: ATIVO }, { guardianId: "pai", guardian: ATIVO }] },
          },
        ]
      : [],
  );
  prismaMock.comunicado.findMany.mockResolvedValue([]);
  prismaMock.respostaComunicado.findMany.mockResolvedValue([]);
  prismaMock.guardianStudent.findMany.mockResolvedValue([]);
  prismaMock.boleto.findMany.mockResolvedValue([]);
  prismaMock.student.findMany.mockResolvedValue([]);
  prismaMock.solicitacaoMatricula.findMany.mockResolvedValue([]);
  prismaMock.lembretePendencia.findMany.mockResolvedValue([]);
  prismaMock.lembretePendencia.createMany.mockResolvedValue({ count: 2 });
  prismaMock.lembretePendencia.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.user.findUnique.mockResolvedValue({ phone: "5521999990000", avisosWhatsApp: false, whatsappUltimaMensagemEm: null, _count: { pushTokens: 0 } });
  notifyUsers.mockResolvedValue({ aparelhos: 1, enviados: 1, erros: [] });
  sendTemplate.mockResolvedValue({ externalId: "wamid.modelo" });
  sendText.mockResolvedValue({ externalId: "wamid.texto" });
});

describe("executarLembretesDaEscola", () => {
  it("desligado: registra as pendências mas não envia nada", async () => {
    prismaMock.school.findUnique.mockResolvedValue(config(false));
    const r = await executarLembretesDaEscola("s1", QUARTA);
    expect(r).toMatchObject({ ativos: false, pendencias: 2, familiasProntas: 2, enviadas: 0 });
    expect(prismaMock.lembretePendencia.createMany).toHaveBeenCalledTimes(1);
    expect(notifyUsers).not.toHaveBeenCalled();
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("domingo: não envia", async () => {
    const r = await executarLembretesDaEscola("s1", DOMINGO);
    expect(r.domingo).toBe(true);
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("ligado: uma mensagem por responsável e o envio fica registrado", async () => {
    const r = await executarLembretesDaEscola("s1", QUARTA);
    expect(r).toMatchObject({ enviadas: 2, porPush: 2, porWhatsApp: 0 });
    expect(notifyUsers).toHaveBeenCalledTimes(2);
    expect(notifyUsers.mock.calls[0][1]).toMatchObject({ url: "/dashboard/contratos" });
    const registro = prismaMock.lembretePendencia.updateMany.mock.calls.find((c) => c[0].data.envios);
    expect(registro?.[0].data).toEqual({
      envios: { increment: 1 },
      ultimoEnvioEm: QUARTA,
      ultimoEnvioMensagemId: null,
      ultimoEnvioStatus: null,
      ultimoEnvioStatusEm: null,
      ultimoEnvioFalha: null,
    });
  });

  it("tempo da rotina acabando: não começa família nova e ela fica para o próximo dia", async () => {
    const r = await executarLembretesDaEscola("s1", QUARTA, { encerrarEm: Date.now() - 1 });
    expect(r).toMatchObject({ familiasProntas: 2, enviadas: 0, adiadas: 2 });
    expect(notifyUsers).not.toHaveBeenCalled();
    expect(prismaMock.lembretePendencia.updateMany.mock.calls.some((c) => c[0].data.envios)).toBe(false);
  });

  it("com tempo de sobra: envia normalmente e nada fica adiado", async () => {
    const r = await executarLembretesDaEscola("s1", QUARTA, { encerrarEm: Date.now() + 60_000 });
    expect(r).toMatchObject({ enviadas: 2, adiadas: 0 });
  });

  it("sem notificação no celular: vai pelo modelo aprovado do WhatsApp", async () => {
    notifyUsers.mockResolvedValue({ aparelhos: 0, enviados: 0, erros: [] });
    const r = await executarLembretesDaEscola("s1", QUARTA);
    expect(r).toMatchObject({ enviadas: 2, porWhatsApp: 2 });
    expect(sendTemplate).toHaveBeenCalledTimes(2);
    expect(sendTemplate.mock.calls[0][2][2]).toBe("https://app.exemplo.com/dashboard/contratos");
  });

  it("sem canal nenhum: não conta como enviado (tenta de novo no próximo dia)", async () => {
    notifyUsers.mockResolvedValue({ aparelhos: 0, enviados: 0, erros: [] });
    prismaMock.user.findUnique.mockResolvedValue({ phone: null, avisosWhatsApp: false, whatsappUltimaMensagemEm: null, _count: { pushTokens: 0 } });
    const r = await executarLembretesDaEscola("s1", QUARTA);
    expect(r).toMatchObject({ enviadas: 0, semCanal: 2 });
    expect(prismaMock.lembretePendencia.updateMany.mock.calls.some((c) => c[0].data.envios)).toBe(false);
  });

  it("família lembrada há 1 dia não recebe de novo", async () => {
    prismaMock.lembretePendencia.findMany.mockResolvedValue([
      { tipo: "CONTRATO", referenciaId: "c1", responsavelId: "mae", pendenteDesde: new Date("2026-10-30T12:00:00Z"), envios: 1, ultimoEnvioEm: new Date("2026-11-03T13:00:00Z"), resolvidoEm: null },
    ]);
    const r = await executarLembretesDaEscola("s1", QUARTA);
    expect(r.enviadas).toBe(1); // só o pai
    expect(notifyUsers).toHaveBeenCalledWith(["pai"], expect.anything());
  });

  it("boleto: lembra só o 1º responsável e não manda para conta inativa", async () => {
    prismaMock.contrato.findMany.mockResolvedValue([]);
    prismaMock.boleto.findMany.mockResolvedValue([
      {
        id: "b1",
        vencimento: new Date("2026-11-05T15:00:00Z"),
        createdAt: new Date("2026-11-01T07:00:00Z"),
        student: { name: "Ana Souza", guardians: [{ guardianId: "mae", guardian: ATIVO }] },
      },
      {
        id: "b2",
        vencimento: new Date("2026-11-05T15:00:00Z"),
        createdAt: new Date("2026-11-01T07:00:00Z"),
        student: { name: "Bia", guardians: [{ guardianId: "x", guardian: { ...ATIVO, active: false } }] },
      },
    ]);
    const r = await executarLembretesDaEscola("s1", QUARTA);
    expect(r.enviadas).toBe(1);
    const aviso = notifyUsers.mock.calls[0][1] as { body: string };
    expect(aviso.body).toContain("pagar a mensalidade de Ana, que vence amanhã (05/11/2026)");
    expect(aviso.body).not.toMatch(/R\$/);
  });

  it("regra do responsável financeiro: contrato e boleto novos lembram só o destinatário; sem destinatário, ninguém", async () => {
    const doisResponsaveis = [
      { guardianId: "mae", responsavelFinanceiro: true, guardian: ATIVO },
      { guardianId: "pai", responsavelFinanceiro: false, guardian: ATIVO },
    ];
    const base = { anoLetivo: 2027, status: "AGUARDANDO_ASSINATURA", updatedAt: new Date("2026-10-30T12:00:00Z"), porResponsavelFinanceiro: true };
    prismaMock.contrato.findMany.mockImplementation(async (args: { where: { status?: { in: string[] } } }) =>
      args.where.status?.in.includes("AGUARDANDO_ASSINATURA")
        ? [
            { ...base, id: "c1", destinatarioId: "mae", student: { name: "Ana Souza", guardians: doisResponsaveis } },
            { ...base, id: "c2", destinatarioId: null, student: { name: "Bia Lima", guardians: doisResponsaveis } },
          ]
        : [],
    );
    prismaMock.boleto.findMany.mockResolvedValue([
      {
        id: "b1",
        vencimento: new Date("2026-11-05T15:00:00Z"),
        createdAt: new Date("2026-11-01T07:00:00Z"),
        porResponsavelFinanceiro: true,
        destinatarioId: "pai",
        student: { name: "Caio", guardians: doisResponsaveis },
      },
    ]);
    await executarLembretesDaEscola("s1", QUARTA);
    const destinatarios = notifyUsers.mock.calls.map((c) => (c[0] as string[])[0]).sort();
    expect(destinatarios).toEqual(["mae", "pai"]);
    const paraMae = notifyUsers.mock.calls.find((c) => (c[0] as string[])[0] === "mae")?.[1] as { body: string };
    expect(paraMae.body).toContain("Ana");
    expect(paraMae.body).not.toContain("Bia");
  });

  it("WhatsApp: guarda o id da mensagem no envio, para a falha de entrega poder devolvê-lo", async () => {
    notifyUsers.mockResolvedValue({ aparelhos: 0, enviados: 0, erros: [] });
    await executarLembretesDaEscola("s1", QUARTA);
    const registro = prismaMock.lembretePendencia.updateMany.mock.calls.find((c) => c[0].data.envios);
    expect(registro?.[0].data).toMatchObject({ envios: { increment: 1 }, ultimoEnvioMensagemId: "wamid.modelo", ultimoEnvioStatus: "ENVIADO" });
  });

  it("push: não guarda id de mensagem", async () => {
    await executarLembretesDaEscola("s1", QUARTA);
    const registro = prismaMock.lembretePendencia.updateMany.mock.calls.find((c) => c[0].data.envios);
    expect(registro?.[0].data.ultimoEnvioMensagemId).toBeNull();
  });
});

describe("devolverEnvioFalho (entrega recusada pela Meta, ex.: 131042)", () => {
  it("devolve o envio gasto, libera nova tentativa e guarda o motivo para a direção", async () => {
    prismaMock.lembretePendencia.updateMany.mockResolvedValue({ count: 2 });
    const em = new Date("2026-11-18T15:40:00Z");
    await expect(devolverEnvioFalho("wamid.modelo", { motivo: "Número sem WhatsApp.", em })).resolves.toBe(2);
    expect(prismaMock.lembretePendencia.updateMany).toHaveBeenCalledWith({
      where: { ultimoEnvioMensagemId: "wamid.modelo", envios: { gt: 0 } },
      data: {
        envios: { decrement: 1 },
        ultimoEnvioEm: null,
        ultimoEnvioMensagemId: null,
        ultimoEnvioStatus: "FALHOU",
        ultimoEnvioStatusEm: em,
        ultimoEnvioFalha: "Número sem WhatsApp.",
      },
    });
  });

  it("mensagem que não era lembrete: não muda nada", async () => {
    prismaMock.lembretePendencia.updateMany.mockResolvedValue({ count: 0 });
    await expect(devolverEnvioFalho("wamid.outra")).resolves.toBe(0);
  });
});

describe("registrarStatusLembrete (webhook de status da Meta)", () => {
  const em = new Date("2026-11-18T15:41:00Z");

  it("entregue: só avança quem ainda estava como enviado", async () => {
    prismaMock.lembretePendencia.updateMany.mockResolvedValue({ count: 1 });
    await expect(registrarStatusLembrete("wamid.x", "delivered", em)).resolves.toBe(1);
    expect(prismaMock.lembretePendencia.updateMany).toHaveBeenCalledWith({
      where: { ultimoEnvioMensagemId: "wamid.x", OR: [{ ultimoEnvioStatus: null }, { ultimoEnvioStatus: { in: ["ENVIADO"] } }] },
      data: { ultimoEnvioStatus: "ENTREGUE", ultimoEnvioStatusEm: em },
    });
  });

  it("lido: avança de enviado ou entregue, e um entregue atrasado não desfaz o lido", async () => {
    prismaMock.lembretePendencia.updateMany.mockResolvedValue({ count: 1 });
    await registrarStatusLembrete("wamid.x", "read", em);
    expect(prismaMock.lembretePendencia.updateMany).toHaveBeenCalledWith({
      where: { ultimoEnvioMensagemId: "wamid.x", OR: [{ ultimoEnvioStatus: null }, { ultimoEnvioStatus: { in: ["ENVIADO", "ENTREGUE"] } }] },
      data: { ultimoEnvioStatus: "LIDO", ultimoEnvioStatusEm: em },
    });
  });
});
