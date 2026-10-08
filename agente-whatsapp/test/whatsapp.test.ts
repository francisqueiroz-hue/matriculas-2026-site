import { describe, expect, it } from "vitest";
import { enviarTexto } from "../src/whatsapp";
import type { Env } from "../src/tipos";

const env = { WHATSAPP_PHONE_NUMBER_ID: "111", WHATSAPP_API_TOKEN: "tok" } as Env;

describe("enviarTexto", () => {
  it("monta URL, Authorization e corpo; devolve o wamid", async () => {
    let visto: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      visto = { url, init };
      return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }));
    }) as unknown as typeof fetch;
    const r = await enviarTexto(env, "5521988887777", "Olá!", f);
    expect(r.wamid).toBe("wamid.X");
    expect(visto!.url).toMatch(/graph\.facebook\.com\/.+\/111\/messages$/);
    expect((visto!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(visto!.init.body))).toEqual({ messaging_product: "whatsapp", to: "5521988887777", type: "text", text: { body: "Olá!" } });
  });
  it("propaga a mensagem de erro da Meta", async () => {
    const f = (async () => new Response(JSON.stringify({ error: { message: "janela fechada" } }), { status: 400 })) as unknown as typeof fetch;
    await expect(enviarTexto(env, "1", "x", f)).rejects.toThrow("janela fechada");
  });
});
