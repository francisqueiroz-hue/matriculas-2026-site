import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyUsers = vi.fn();
const sendText = vi.fn();
const sendTemplate = vi.fn();
const modeloDisponivel = vi.fn();
let configurado = true;

vi.mock("@/lib/push", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
vi.mock("@/lib/whatsapp-modelos", () => ({ modeloDisponivel: (...a: unknown[]) => modeloDisponivel(...a) }));
vi.mock("@/lib/whatsapp", () => ({
  isWhatsAppConfigured: () => configurado,
  normalizePhoneBR: (p: string) => {
    const d = p.replace(/\D/g, "");
    return d.length >= 10 ? (d.startsWith("55") ? d : `55${d}`) : null;
  },
  sendWhatsAppTextMessage: (...a: unknown[]) => sendText(...a),
  sendWhatsAppTemplateMessage: (...a: unknown[]) => sendTemplate(...a),
}));
vi.mock("@/lib/avisos-equipe", () => ({
  parametrosModeloAviso: (r: string, t: string, l: string) => [r, t, l],
}));

import { avisarNovoBoleto, dataBR, linkWhatsAppCobranca, mensagemCobrancaBoleto, textoNovoBoleto } from "@/lib/boleto-aviso";

const venc = new Date(2026, 9, 10, 12, 0, 0);
const base = { alunoNome: "Davi", valor: 1234.5, vencimento: venc, origem: "https://app.exemplo.com" };

beforeEach(() => {
  vi.clearAllMocks();
  configurado = true;
  notifyUsers.mockResolvedValue({});
  sendText.mockResolvedValue({ externalId: "x" });
  sendTemplate.mockResolvedValue({ externalId: "y" });
  modeloDisponivel.mockResolvedValue({ name: "aviso_mensagem_classlink", language: "pt_BR" });
});

describe("textos", () => {
  it("formata data e texto do aviso", () => {
    expect(dataBR(venc)).toBe("10/10/2026");
    const t = textoNovoBoleto("Davi", 1234.5, venc);
    expect(t).toContain("Davi");
    expect(t).toContain("10/10/2026");
    expect(t).toMatch(/1\.234,50/);
  });

  it("cobrança: vencido x a vencer, sem desconto nem multa", () => {
    const a = mensagemCobrancaBoleto({ responsavel: "Maria Silva", aluno: "Davi", valor: 100, vencimento: venc, vencido: true });
    const b = mensagemCobrancaBoleto({ responsavel: "Maria Silva", aluno: "Davi", valor: 100, vencimento: venc, vencido: false });
    expect(a).toContain("Olá, Maria!");
    expect(a).toContain("vencida");
    expect(b).toContain("vence em");
    expect(a + b).not.toMatch(/desconto|multa|juros/i);
  });

  it("link wa.me só com telefone válido", () => {
    expect(linkWhatsAppCobranca("(21) 99999-1234", "oi a&b")).toBe("https://wa.me/5521999991234?text=oi%20a%26b");
    expect(linkWhatsAppCobranca("123", "oi")).toBeNull();
    expect(linkWhatsAppCobranca(null, "oi")).toBeNull();
  });
});

describe("avisarNovoBoleto", () => {
  const janelaAberta = { id: "u1", phone: "21999991234", whatsappUltimaMensagemEm: new Date() };
  const janelaFechada = { id: "u1", phone: "21999991234", whatsappUltimaMensagemEm: null };

  it("janela aberta: push + texto livre", async () => {
    const r = await avisarNovoBoleto({ ...base, responsavel: janelaAberta });
    expect(r).toEqual({ push: true, whatsapp: "texto" });
    expect(sendText).toHaveBeenCalledOnce();
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("janela fechada: usa o modelo aprovado com link do Financeiro", async () => {
    const r = await avisarNovoBoleto({ ...base, responsavel: janelaFechada });
    expect(r.whatsapp).toBe("modelo");
    expect(sendTemplate.mock.calls[0][2][2]).toBe("https://app.exemplo.com/dashboard/financeiro");
  });

  it("sem modelo aprovado ou sem WhatsApp configurado: só push", async () => {
    modeloDisponivel.mockResolvedValue(null);
    expect((await avisarNovoBoleto({ ...base, responsavel: janelaFechada })).whatsapp).toBe("indisponivel");
    configurado = false;
    expect((await avisarNovoBoleto({ ...base, responsavel: janelaAberta })).whatsapp).toBe("indisponivel");
    expect(sendText).not.toHaveBeenCalled();
  });

  it("sem telefone válido: não envia WhatsApp", async () => {
    const r = await avisarNovoBoleto({ ...base, responsavel: { ...janelaAberta, phone: null } });
    expect(r.whatsapp).toBe("indisponivel");
  });

  it("nunca lança: falhas de push e WhatsApp são absorvidas", async () => {
    notifyUsers.mockRejectedValue(new Error("fcm"));
    sendText.mockRejectedValue(new Error("meta"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await avisarNovoBoleto({ ...base, responsavel: janelaAberta });
    expect(r).toEqual({ push: false, whatsapp: "falhou" });
    spy.mockRestore();
  });
});
