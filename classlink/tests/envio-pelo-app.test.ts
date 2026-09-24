import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conversaAberta, JANELA_CONVERSA_MS } from "@/lib/envio-acesso";
import { buildTemplatePayload } from "@/lib/whatsapp";
import { MODELOS, limparCacheModelos, modeloDisponivel, payloadCriacao } from "@/lib/whatsapp-modelos";
import { textoAviso } from "@/lib/avisos-equipe";

describe("janela de conversa de 24h", () => {
  const agora = Date.now();
  it("aberta logo depois de a pessoa escrever e fechada depois da margem", () => {
    expect(conversaAberta(new Date(agora - 60_000), agora)).toBe(true);
    expect(conversaAberta(new Date(agora - JANELA_CONVERSA_MS - 1), agora)).toBe(false);
    expect(conversaAberta(null, agora)).toBe(false);
    expect(conversaAberta(undefined, agora)).toBe(false);
  });
});

describe("modelos cadastrados pelo ClassLink", () => {
  it("convite é de utilidade, sem senha e com o botão ACESSO", () => {
    const p = payloadCriacao("convite");
    expect(p.category).toBe("UTILITY");
    expect(p.language).toBe("pt_BR");
    expect(p.name).toBe("convite_acesso_classlink");
    expect(JSON.stringify(p)).not.toMatch(/senha provis[óo]ria: \{\{/i);
    expect(p.components).toContainEqual({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "ACESSO" }] });
    expect(MODELOS.convite.corpo).toContain("{{1}}");
  });

  it("aviso tem 3 variáveis e nenhum botão", () => {
    const p = payloadCriacao("aviso");
    expect(p.components).toHaveLength(1);
    expect(MODELOS.aviso.exemplo).toHaveLength(3);
  });

  it("envio do convite leva o payload do botão de resposta rápida", () => {
    const payload = buildTemplatePayload("5521987654321", { name: "convite_acesso_classlink", language: "pt_BR" }, ["Maria"], ["ACESSO"]);
    const components = (payload.template as { components: unknown[] }).components;
    expect(components).toContainEqual({ type: "body", parameters: [{ type: "text", text: "Maria" }] });
    expect(components).toContainEqual({
      type: "button",
      sub_type: "quick_reply",
      index: "0",
      parameters: [{ type: "payload", payload: "ACESSO" }],
    });
  });

  it("texto livre do aviso resume a mensagem e leva o link", () => {
    const t = textoAviso("Maria", "Bom   dia\nteste", "https://x/y");
    expect(t).toContain("Maria");
    expect(t).toContain('"Bom dia teste"');
    expect(t).toContain("https://x/y");
  });
});

describe("modelo disponível", () => {
  const envOriginal = { ...process.env };
  beforeEach(() => {
    process.env.WHATSAPP_API_TOKEN = "token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    delete process.env.WHATSAPP_TEMPLATE_CONVITE;
    limparCacheModelos();
  });
  afterEach(() => {
    process.env = { ...envOriginal };
    vi.unstubAllGlobals();
  });

  it("sem o ID da conta, só usa o modelo se a escola informou o nome", async () => {
    expect(await modeloDisponivel("convite")).toBeNull();
    process.env.WHATSAPP_TEMPLATE_CONVITE = "meu_convite";
    expect(await modeloDisponivel("convite")).toEqual({ name: "meu_convite", language: "pt_BR" });
  });

  it("com o ID da conta, consulta a Meta e só usa se aprovado", async () => {
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "999";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ name: "convite_acesso_classlink", status: "PENDING", language: "pt_BR" }] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await modeloDisponivel("convite")).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/999/message_templates?name=convite_acesso_classlink");

    limparCacheModelos();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ name: "convite_acesso_classlink", status: "APPROVED", language: "pt_BR" }] })),
    );
    expect(await modeloDisponivel("convite")).toEqual({ name: "convite_acesso_classlink", language: "pt_BR" });
  });
});
