import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Aviso único de definição das turmas: banco, push e WhatsApp simulados (nenhum envio real).
const prismaMock = vi.hoisted(() => ({
  school: { findUnique: vi.fn() },
  contrato: { findMany: vi.fn() },
  comunicado: { findMany: vi.fn() },
  respostaComunicado: { findMany: vi.fn() },
  guardianStudent: { findMany: vi.fn() },
  boleto: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  solicitacaoMatricula: { findMany: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  lembretePendencia: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
  avisoTurmasEnvio: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), updateMany: vi.fn() },
}));
const notifyUsers = vi.hoisted(() => vi.fn());
const sendTemplate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/push", () => ({ notifyUsers, origemPublica: () => "https://app.exemplo.com" }));
vi.mock("@/lib/whatsapp", () => ({
  isWhatsAppConfigured: () => true,
  normalizePhoneBR: (p: string) => p,
  sendWhatsAppTextMessage: vi.fn(),
  sendWhatsAppTemplateMessage: sendTemplate,
}));
vi.mock("@/lib/whatsapp-modelos", () => ({ modeloDisponivel: async () => ({ name: "aviso", language: "pt_BR" }) }));
vi.mock("@/lib/avisos-equipe", () => ({
  deveAvisarPorWhatsApp: (d: { avisosWhatsApp: boolean; aparelhosComPush: number }) => d.avisosWhatsApp || d.aparelhosComPush === 0,
  parametrosModeloAviso: (r: string, t: string, l: string) => [r, t, l],
}));
const requireDirecao = vi.hoisted(() => vi.fn(async () => ({ sub: "dir1", role: "ADMIN", schoolId: "s1", name: "Direção" })));
vi.mock("@/lib/session", () => ({ requireDirecao, AuthError: class extends Error {} }));

import { executarLembretesDaEscola } from "@/lib/lembretes-server";
import { falhaAvisoTurmas, registrarStatusAvisoTurmas } from "@/lib/aviso-turmas-server";
import { POST as enviarManual } from "@/app/api/admin/aviso-turmas/enviar/route";
import { PUT as salvarAviso } from "@/app/api/admin/aviso-turmas/route";

const QUINTA = new Date("2026-11-26T15:00:00Z");
const DOMINGO = new Date("2026-11-29T15:00:00Z");
const ATIVO = { active: true, deletedAt: null, role: "GUARDIAN" };
const escola = (o: { lembretes?: boolean; aviso?: boolean; texto?: string | null } = {}) => ({
  lembretesAtivos: o.lembretes ?? true,
  lembretesTipos: ["CONTRATO", "COMUNICADO", "BOLETO", "REMATRICULA"],
  lembretesDiasInicio: 3,
  lembretesIntervaloDias: 3,
  lembretesMaxEnvios: 4,
  avisoTurmasAtivo: o.aviso ?? true,
  avisoTurmasTitulo: null,
  avisoTurmasTexto: o.texto ?? null,
});
// Contrato de Ana aguardando assinatura há semanas; mãe e pai já receberam os 4 lembretes.
const registro = (responsavelId: string) => ({
  tipo: "CONTRATO",
  referenciaId: "c1",
  responsavelId,
  pendenteDesde: new Date("2026-11-01T12:00:00Z"),
  envios: 4,
  ultimoEnvioEm: new Date("2026-11-20T15:00:00Z"),
  resolvidoEm: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  prismaMock.school.findUnique.mockResolvedValue(escola());
  prismaMock.contrato.findMany.mockImplementation(async (args: { where: { status?: { in: string[] } } }) =>
    args.where.status?.in.includes("AGUARDANDO_ASSINATURA")
      ? [
          {
            id: "c1",
            anoLetivo: 2027,
            status: "AGUARDANDO_ASSINATURA",
            updatedAt: new Date("2026-11-01T12:00:00Z"),
            student: { name: "Ana Souza", guardians: [{ guardianId: "mae", guardian: ATIVO }, { guardianId: "pai", guardian: ATIVO }] },
          },
        ]
      : [],
  );
  for (const m of [prismaMock.comunicado, prismaMock.respostaComunicado, prismaMock.guardianStudent, prismaMock.boleto, prismaMock.student, prismaMock.solicitacaoMatricula]) {
    m.findMany.mockResolvedValue([]);
  }
  prismaMock.lembretePendencia.findMany.mockResolvedValue([registro("mae"), registro("pai")]);
  prismaMock.lembretePendencia.createMany.mockResolvedValue({ count: 0 });
  prismaMock.lembretePendencia.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.avisoTurmasEnvio.findMany.mockResolvedValue([]);
  prismaMock.avisoTurmasEnvio.create.mockImplementation(async (args: { data: { responsavelId: string } }) => ({ id: `av-${args.data.responsavelId}` }));
  prismaMock.avisoTurmasEnvio.update.mockResolvedValue({});
  prismaMock.avisoTurmasEnvio.delete.mockResolvedValue({});
  prismaMock.user.findUnique.mockResolvedValue({ phone: "5521999990000", avisosWhatsApp: false, whatsappUltimaMensagemEm: null, _count: { pushTokens: 0 } });
  notifyUsers.mockResolvedValue({ aparelhos: 1, enviados: 1, erros: [] });
  sendTemplate.mockResolvedValue({ externalId: "wamid.aviso" });
});

describe("aviso automático (junto com os lembretes)", () => {
  it("limite atingido: cada responsável recebe o aviso uma vez, com a chave única gravada antes do envio", async () => {
    const r = await executarLembretesDaEscola("s1", QUINTA);
    expect(r.enviadas).toBe(0); // nenhum lembrete: os dois já estão no limite
    expect(r.avisoTurmas).toMatchObject({ ativo: true, prontos: 2, enviados: 2 });
    const criados = prismaMock.avisoTurmasEnvio.create.mock.calls.map((c) => c[0].data);
    expect(criados.map((d) => d.chaveAutomatico).sort()).toEqual(["s1:mae", "s1:pai"]);
    expect(criados[0]).toMatchObject({ automatico: true, titulo: "Organização das turmas de 2027" });
    expect(criados[0].texto).toContain("Para incluirmos Ana nesse planejamento");
    expect(notifyUsers).toHaveBeenCalledWith(["mae"], expect.objectContaining({ title: "Organização das turmas de 2027", url: "/dashboard/contratos" }));
    expect(prismaMock.avisoTurmasEnvio.update).toHaveBeenCalledWith({
      where: { id: "av-mae" },
      data: { canal: "push", mensagemId: null, status: null, statusEm: null },
    });
  });

  it("texto editado pela direção é o que sai", async () => {
    prismaMock.school.findUnique.mockResolvedValue(escola({ texto: "Oi! Falta a matrícula de {alunos} para fecharmos as turmas de {ano}." }));
    await executarLembretesDaEscola("s1", QUINTA);
    expect(notifyUsers.mock.calls[0][1].body).toBe("Oi! Falta a matrícula de Ana para fecharmos as turmas de 2027.");
  });

  it("quem já recebeu (automático ou manual) não recebe de novo", async () => {
    prismaMock.avisoTurmasEnvio.findMany.mockResolvedValue([{ responsavelId: "mae" }]);
    const r = await executarLembretesDaEscola("s1", QUINTA);
    expect(r.avisoTurmas).toMatchObject({ prontos: 1, enviados: 1 });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers).toHaveBeenCalledWith(["pai"], expect.anything());
    // Só conta como recebido o que não falhou.
    expect(prismaMock.avisoTurmasEnvio.findMany.mock.calls[0][0].where).toMatchObject({ OR: [{ status: null }, { status: { not: "FALHOU" } }] });
  });

  it("duas execuções ao mesmo tempo: a chave única impede o segundo envio", async () => {
    prismaMock.avisoTurmasEnvio.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const r = await executarLembretesDaEscola("s1", QUINTA);
    expect(r.avisoTurmas?.enviados).toBe(0);
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("sem canal: apaga a reserva e tenta no próximo envio", async () => {
    notifyUsers.mockResolvedValue({ aparelhos: 0, enviados: 0, erros: [] });
    prismaMock.user.findUnique.mockResolvedValue({ phone: null, avisosWhatsApp: false, whatsappUltimaMensagemEm: null, _count: { pushTokens: 0 } });
    const r = await executarLembretesDaEscola("s1", QUINTA);
    expect(r.avisoTurmas).toMatchObject({ enviados: 0, semCanal: 2 });
    expect(prismaMock.avisoTurmasEnvio.delete).toHaveBeenCalledTimes(2);
  });

  it("WhatsApp: guarda o id da mensagem para acompanhar a entrega", async () => {
    notifyUsers.mockResolvedValue({ aparelhos: 0, enviados: 0, erros: [] });
    await executarLembretesDaEscola("s1", QUINTA);
    expect(sendTemplate.mock.calls[0][2][2]).toBe("https://app.exemplo.com/dashboard/contratos");
    expect(prismaMock.avisoTurmasEnvio.update.mock.calls[0][0].data).toMatchObject({ canal: "whatsapp", mensagemId: "wamid.aviso", status: "ENVIADO" });
  });

  it("aviso desligado, lembretes desligados ou domingo: nada sai", async () => {
    prismaMock.school.findUnique.mockResolvedValue(escola({ aviso: false }));
    expect((await executarLembretesDaEscola("s1", QUINTA)).avisoTurmas?.enviados).toBe(0);
    prismaMock.school.findUnique.mockResolvedValue(escola({ lembretes: false }));
    await executarLembretesDaEscola("s1", QUINTA);
    prismaMock.school.findUnique.mockResolvedValue(escola());
    await executarLembretesDaEscola("s1", DOMINGO);
    expect(notifyUsers).not.toHaveBeenCalled();
    expect(prismaMock.avisoTurmasEnvio.create).not.toHaveBeenCalled();
  });

  it("4º lembrete saiu ontem: o aviso espera o intervalo da família", async () => {
    prismaMock.lembretePendencia.findMany.mockResolvedValue([
      { ...registro("mae"), ultimoEnvioEm: new Date("2026-11-25T15:00:00Z") },
      { ...registro("pai"), ultimoEnvioEm: new Date("2026-11-25T15:00:00Z") },
    ]);
    const r = await executarLembretesDaEscola("s1", QUINTA);
    expect(r.avisoTurmas).toMatchObject({ prontos: 0, enviados: 0 });
  });
});

describe("status da entrega pelo webhook da Meta", () => {
  it("falha: marca, guarda o motivo e libera a chave para nova tentativa", async () => {
    prismaMock.avisoTurmasEnvio.updateMany.mockResolvedValue({ count: 1 });
    const em = new Date("2026-11-26T15:10:00Z");
    await expect(falhaAvisoTurmas("wamid.aviso", { motivo: "Número sem WhatsApp.", em })).resolves.toBe(1);
    expect(prismaMock.avisoTurmasEnvio.updateMany).toHaveBeenCalledWith({
      where: { mensagemId: "wamid.aviso" },
      data: { status: "FALHOU", statusEm: em, falha: "Número sem WhatsApp.", chaveAutomatico: null },
    });
  });

  it("lido: só avança de enviado/entregue", async () => {
    prismaMock.avisoTurmasEnvio.updateMany.mockResolvedValue({ count: 1 });
    const em = new Date();
    await registrarStatusAvisoTurmas("wamid.aviso", "read", em);
    expect(prismaMock.avisoTurmasEnvio.updateMany).toHaveBeenCalledWith({
      where: { mensagemId: "wamid.aviso", status: { in: ["ENVIADO", "ENTREGUE"] } },
      data: { status: "LIDO", statusEm: em },
    });
  });
});

describe("direção: texto e envio manual", () => {
  const req = (url: string, method: string, corpo: unknown) => new NextRequest(`http://t${url}`, { method, body: JSON.stringify(corpo) });
  const familia = { id: "mae", studentLinks: [{ student: { name: "Ana Souza" } }] };

  it("salva o texto; vazio volta ao padrão", async () => {
    const update = vi.fn(async () => ({ avisoTurmasAtivo: true }));
    (prismaMock.school as unknown as { update: typeof update }).update = update;
    const res = await salvarAviso(req("/api/admin/aviso-turmas", "PUT", { ativo: true, titulo: "", texto: "Olá {alunos}" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1" }, data: { avisoTurmasAtivo: true, avisoTurmasTitulo: null, avisoTurmasTexto: "Olá {alunos}" } }));
  });

  it("envia com texto só para esta família, registrado como manual", async () => {
    prismaMock.user.findFirst.mockResolvedValue(familia);
    const res = await enviarManual(req("/api/admin/aviso-turmas/enviar", "POST", { responsavelId: "mae", titulo: "Turmas {ano}", texto: "Ana, {alunos}: conversa conosco." }));
    expect(res.status).toBe(201);
    expect(prismaMock.avisoTurmasEnvio.create.mock.calls[0][0].data).toMatchObject({
      automatico: false,
      enviadoPorId: "dir1",
      titulo: "Turmas 2027",
      texto: "Ana, Ana: conversa conosco.",
    });
    expect(prismaMock.avisoTurmasEnvio.create.mock.calls[0][0].data).not.toHaveProperty("chaveAutomatico");
  });

  it("alunos citados vêm dos contratos não assinados; sem contrato pendente, os alunos do responsável", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "mae", studentLinks: [{ student: { name: "Ana Souza" } }, { student: { name: "Bia Souza" } }] });
    await enviarManual(req("/api/admin/aviso-turmas/enviar", "POST", { responsavelId: "mae", texto: "Turmas: {alunos}." }));
    expect(prismaMock.avisoTurmasEnvio.create.mock.calls[0][0].data.texto).toBe("Turmas: Ana.");
    expect(prismaMock.boleto.findMany).not.toHaveBeenCalled(); // só contratos

    prismaMock.contrato.findMany.mockResolvedValue([]);
    await enviarManual(req("/api/admin/aviso-turmas/enviar", "POST", { responsavelId: "mae", texto: "Turmas: {alunos}.", repetir: true }));
    expect(prismaMock.avisoTurmasEnvio.create.mock.calls[1][0].data.texto).toBe("Turmas: Ana e Bia.");
  });

  it("família que já recebeu: pede confirmação antes de repetir", async () => {
    prismaMock.user.findFirst.mockResolvedValue(familia);
    prismaMock.avisoTurmasEnvio.findMany.mockResolvedValue([{ responsavelId: "mae" }]);
    const res = await enviarManual(req("/api/admin/aviso-turmas/enviar", "POST", { responsavelId: "mae" }));
    expect(res.status).toBe(409);
    expect((await res.json()).jaRecebeu).toBe(true);
    expect(notifyUsers).not.toHaveBeenCalled();

    const deNovo = await enviarManual(req("/api/admin/aviso-turmas/enviar", "POST", { responsavelId: "mae", repetir: true }));
    expect(deNovo.status).toBe(201);
    expect(notifyUsers).toHaveBeenCalledTimes(1);
  });

  it("responsável de outra escola ou inexistente: 404", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await enviarManual(req("/api/admin/aviso-turmas/enviar", "POST", { responsavelId: "x" }));
    expect(res.status).toBe(404);
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ schoolId: "s1", role: "GUARDIAN" });
  });

  it("sem canal: avisa a direção e não deixa registro", async () => {
    prismaMock.user.findFirst.mockResolvedValue(familia);
    notifyUsers.mockResolvedValue({ aparelhos: 0, enviados: 0, erros: [] });
    prismaMock.user.findUnique.mockResolvedValue({ phone: null, avisosWhatsApp: false, whatsappUltimaMensagemEm: null, _count: { pushTokens: 0 } });
    const res = await enviarManual(req("/api/admin/aviso-turmas/enviar", "POST", { responsavelId: "mae" }));
    expect(res.status).toBe(422);
    expect(prismaMock.avisoTurmasEnvio.delete).toHaveBeenCalledTimes(1);
  });

  it("só a direção: a checagem de acesso vem antes de tudo", async () => {
    requireDirecao.mockRejectedValueOnce(Object.assign(new Error("Só a direção"), { status: 403 }));
    await enviarManual(req("/api/admin/aviso-turmas/enviar", "POST", { responsavelId: "mae" })).catch(() => undefined);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});
