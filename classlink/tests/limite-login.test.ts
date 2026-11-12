import { describe, it, expect } from "vitest";
import {
  POLITICA_LOGIN_CONTA,
  POLITICA_LOGIN_IP,
  POLITICA_ESQUECI_CONTA,
  POLITICA_ESQUECI_IP,
  mensagemBloqueio,
  chaveLogin,
  chaveTentativa,
  chaveIp,
} from "@/lib/limite-login";
import { ipDaRequisicao } from "@/lib/ip-requisicao";

describe("políticas de limite", () => {
  it("login por conta: 5 tentativas em 15 minutos, bloqueio de 15 minutos", () => {
    expect(POLITICA_LOGIN_CONTA).toEqual({ max: 5, janelaMs: 15 * 60_000, bloqueioMs: 15 * 60_000 });
  });

  it("IP é mais folgado que a conta (a escola pode sair por um IP só)", () => {
    expect(POLITICA_LOGIN_IP.max).toBeGreaterThan(POLITICA_LOGIN_CONTA.max);
  });

  it("esqueci a senha é bem restrito, e o IP um pouco mais folgado que a conta", () => {
    expect(POLITICA_ESQUECI_CONTA.max).toBeLessThanOrEqual(3);
    expect(POLITICA_ESQUECI_IP.max).toBeGreaterThan(POLITICA_ESQUECI_CONTA.max);
    expect(POLITICA_ESQUECI_CONTA.bloqueioMs).toBeGreaterThanOrEqual(60 * 60_000);
  });
});

describe("mensagemBloqueio", () => {
  it("arredonda para cima e usa singular/plural", () => {
    expect(mensagemBloqueio(1)).toBe("Muitas tentativas. Tente novamente em 1 minuto.");
    expect(mensagemBloqueio(61)).toBe("Muitas tentativas. Tente novamente em 2 minutos.");
    expect(mensagemBloqueio(900)).toBe("Muitas tentativas. Tente novamente em 15 minutos.");
  });
});

describe("chaves dos contadores", () => {
  const email = { type: "email", value: "pai@escola.com" } as const;

  it("é um HMAC hexadecimal que não contém o dado em texto", () => {
    const chave = chaveLogin(email, "segredo");
    expect(chave).toMatch(/^[0-9a-f]{64}$/);
    expect(chave).not.toContain("pai");
  });

  it("depende do segredo e do identificador", () => {
    expect(chaveLogin(email, "a")).not.toBe(chaveLogin(email, "b"));
    expect(chaveLogin(email, "a")).not.toBe(chaveLogin({ type: "email", value: "outro@escola.com" }, "a"));
  });

  it("o mesmo identificador tem contadores separados para login e para esqueci a senha", () => {
    expect(chaveTentativa("login", email, "s")).not.toBe(chaveTentativa("esqueci", email, "s"));
    expect(chaveLogin(email, "s")).toBe(chaveTentativa("login", email, "s"));
  });

  it("chave por IP não repete a de conta e separa os escopos", () => {
    expect(chaveIp("login", "1.2.3.4", "s")).toMatch(/^[0-9a-f]{64}$/);
    expect(chaveIp("login", "1.2.3.4", "s")).not.toBe(chaveIp("esqueci", "1.2.3.4", "s"));
    expect(chaveIp("login", "1.2.3.4", "s")).not.toBe(chaveIp("login", "1.2.3.5", "s"));
  });
});

describe("ipDaRequisicao", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("prefere o cabeçalho que a Vercel escreve", () => {
    expect(ipDaRequisicao(h({ "x-vercel-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8", "x-forwarded-for": "7.7.7.7" }))).toBe("9.9.9.9");
  });

  it("cai para x-real-ip e depois para o primeiro de x-forwarded-for", () => {
    expect(ipDaRequisicao(h({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "7.7.7.7" }))).toBe("8.8.8.8");
    expect(ipDaRequisicao(h({ "x-forwarded-for": "7.7.7.7, 10.0.0.1" }))).toBe("7.7.7.7");
  });

  it("sem IP devolve null (quem chama pula o limite por IP)", () => {
    expect(ipDaRequisicao(h({}))).toBeNull();
  });

  it("ignora valor absurdamente longo", () => {
    expect(ipDaRequisicao(h({ "x-real-ip": "a".repeat(200) }))).toBeNull();
  });
});
