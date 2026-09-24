import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mensagemAcesso, parametrosModeloAcesso } from "@/lib/acesso";
import { buildTemplatePayload, getAccessTemplate, sendAccessViaWhatsApp } from "@/lib/whatsapp";

const dados = { nome: "Maria", url: "https://escola.app/guia", login: "5521987654321", senha: "a1b2c3" };

describe("mensagem de acesso", () => {
  it("inclui link, login e senha provisória", () => {
    const texto = mensagemAcesso(dados);
    expect(texto).toContain("Olá, Maria!");
    expect(texto).toContain("Acesse: https://escola.app/guia");
    expect(texto).toContain("Entrar com: (21) 98765-4321");
    expect(texto).toContain("Senha provisória: a1b2c3");
  });

  it("parâmetros do modelo seguem a ordem {{1}}..{{4}}", () => {
    expect(parametrosModeloAcesso(dados)).toEqual(["Maria", "https://escola.app/guia", "(21) 98765-4321", "a1b2c3"]);
    expect(parametrosModeloAcesso({ ...dados, login: "maria@email.com" })[2]).toBe("maria@email.com");
  });
});

describe("envio de acesso pelo modelo aprovado", () => {
  const envOriginal = { ...process.env };
  beforeEach(() => {
    process.env.WHATSAPP_API_TOKEN = "token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    delete process.env.WHATSAPP_TEMPLATE_ACESSO;
    delete process.env.WHATSAPP_TEMPLATE_IDIOMA;
  });
  afterEach(() => {
    process.env = { ...envOriginal };
    vi.unstubAllGlobals();
  });

  it("não envia (nem cai para texto livre) quando o modelo não está configurado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(getAccessTemplate()).toBeNull();
    await expect(sendAccessViaWhatsApp("(21) 98765-4321", parametrosModeloAcesso(dados))).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("não envia quando a API do WhatsApp não está configurada", async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = "acesso_classlink";
    delete process.env.WHATSAPP_API_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendAccessViaWhatsApp("21987654321", [])).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia o modelo com idioma pt_BR e as variáveis no corpo", async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = "acesso_classlink";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendAccessViaWhatsApp("(21) 98765-4321", parametrosModeloAcesso(dados))).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/123/messages");
    expect(JSON.parse(init.body)).toEqual(
      buildTemplatePayload("5521987654321", { name: "acesso_classlink", language: "pt_BR" }, parametrosModeloAcesso(dados)),
    );
    expect(JSON.parse(init.body)).toMatchObject({
      type: "template",
      template: {
        name: "acesso_classlink",
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Maria" }, {}, {}, { type: "text", text: "a1b2c3" }] }],
      },
    });
  });

  it("propaga o erro da Meta para o chamador registrar", async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = "acesso_classlink";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Template name does not exist" } }) }));
    await expect(sendAccessViaWhatsApp("21987654321", [])).rejects.toThrow("Template name does not exist");
  });
});
