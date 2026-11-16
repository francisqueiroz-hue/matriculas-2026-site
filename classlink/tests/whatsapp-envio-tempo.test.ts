import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ErroWhatsApp, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from "@/lib/whatsapp";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WHATSAPP_API_TOKEN", "t");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("envio ao WhatsApp não prende a tela", () => {
  it("toda chamada à Meta tem tempo limite", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    expect(await sendWhatsAppTextMessage("5521987654321", "Olá")).toEqual({ externalId: "wamid.1" });
    await sendWhatsAppTemplateMessage("5521987654321", { name: "m", language: "pt_BR" }, ["a"]);
    for (const [, init] of fetchMock.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("Meta sem resposta: erro claro em vez de esperar indefinidamente", async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    const erro = await sendWhatsAppTextMessage("5521987654321", "Olá").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroWhatsApp);
    expect(erro.message).toMatch(/não respondeu a tempo/);
  });

  it("recusa da Meta traz o código (ex.: 131042, pagamento pendente)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 131042, message: "Business eligibility payment issue" } }), { status: 400 }),
    );
    const erro = await sendWhatsAppTextMessage("5521987654321", "Olá").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroWhatsApp);
    expect(erro.codigo).toBe(131042);
  });

  it("resposta que não é JSON (ex.: página de erro) não quebra o tratamento", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
    const erro = await sendWhatsAppTextMessage("5521987654321", "Olá").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroWhatsApp);
    expect(erro.message).toMatch(/HTTP 502/);
  });
});
