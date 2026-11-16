import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Nada sai para a rede: o fetch do e-mail e o https do Banco Inter são simulados.
const httpsRequest = vi.hoisted(() => vi.fn());
vi.mock("node:https", () => ({ default: { request: httpsRequest, Agent: class {} } }));
vi.mock("node:fs", () => ({ readFileSync: () => "conteudo" }));

import { sendEmailMessage, sendPlainEmail, TEMPO_LIMITE_EMAIL_MS } from "@/lib/email";
import { consultarCobranca, TEMPO_LIMITE_INTER_MS } from "@/lib/banco-inter";

describe("e-mail (Mailgun) com tempo limite", () => {
  beforeEach(() => {
    process.env.MAILGUN_API_KEY = "chave";
    process.env.MAILGUN_DOMAIN = "mg.escola.com";
    process.env.EMAIL_FROM = "Escola <nao-responda@mg.escola.com>";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("toda chamada leva um sinal de tempo limite", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "<m1>" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmailMessage({ to: "pai@x.com", subject: "s", text: "t", conversationId: "c1" });
    await sendPlainEmail({ to: "pai@x.com", subject: "s", text: "t" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(TEMPO_LIMITE_EMAIL_MS).toBeLessThanOrEqual(20_000);
  });

  it("Mailgun que não responde vira erro claro, sem prender a tela", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );
    await expect(sendPlainEmail({ to: "pai@x.com", subject: "s", text: "t" })).rejects.toThrow("O serviço de e-mail não respondeu a tempo");
  });

  it("queda de rede vira erro claro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(sendEmailMessage({ to: "pai@x.com", subject: "s", text: "t", conversationId: "c1" })).rejects.toThrow(
      "Não foi possível falar com o serviço de e-mail",
    );
  });

  it("resposta de erro sem JSON não quebra: mostra a mensagem padrão", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
    await expect(sendEmailMessage({ to: "pai@x.com", subject: "s", text: "t", conversationId: "c1" })).rejects.toThrow("Falha ao enviar e-mail");
  });
});

describe("Banco Inter com tempo limite", () => {
  beforeEach(() => {
    Object.assign(process.env, {
      BANCO_INTER_CLIENT_ID: "id",
      BANCO_INTER_CLIENT_SECRET: "segredo",
      BANCO_INTER_CERT_PATH: "/c.crt",
      BANCO_INTER_KEY_PATH: "/c.key",
      BANCO_INTER_CONTA_CORRENTE: "123",
    });
  });

  it("banco que não responde: a requisição é encerrada com erro claro", async () => {
    let tempoPedido = 0;
    httpsRequest.mockImplementation(() => {
      const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
      req.write = vi.fn();
      req.end = vi.fn();
      req.setTimeout = (ms: number, cb: () => void) => {
        tempoPedido = ms;
        setImmediate(cb); // simula o banco mudo até estourar o tempo
      };
      req.destroy = (err: Error) => req.emit("error", err);
      return req;
    });
    await expect(consultarCobranca("cod-1")).rejects.toThrow("O Banco Inter não respondeu a tempo");
    expect(tempoPedido).toBe(TEMPO_LIMITE_INTER_MS);
  });
});
