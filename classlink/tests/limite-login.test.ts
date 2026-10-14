import { describe, it, expect } from "vitest";
import {
  MAX_FALHAS,
  JANELA_MS,
  BLOQUEIO_MS,
  situacaoLogin,
  registrarFalha,
  mensagemBloqueio,
  chaveLogin,
  type RegistroLogin,
} from "@/lib/limite-login";

const t0 = new Date("2026-10-14T12:00:00Z");
const depois = (ms: number) => new Date(t0.getTime() + ms);

function falhar(reg: RegistroLogin | null, n: number, inicio = t0): RegistroLogin | null {
  let atual = reg;
  for (let i = 0; i < n; i++) atual = registrarFalha(atual, new Date(inicio.getTime() + i * 1000));
  return atual;
}

describe("limite de tentativas de login", () => {
  it("sem registro não bloqueia", () => {
    expect(situacaoLogin(null, t0)).toEqual({ bloqueado: false });
  });

  it("não bloqueia antes do limite e bloqueia na 5ª falha", () => {
    expect(situacaoLogin(falhar(null, MAX_FALHAS - 1), depois(10_000)).bloqueado).toBe(false);
    const reg = falhar(null, MAX_FALHAS)!;
    const s = situacaoLogin(reg, depois(10_000));
    expect(s.bloqueado).toBe(true);
    expect(reg.bloqueadoAte).not.toBeNull();
  });

  it("informa os segundos restantes, arredondando para cima", () => {
    const reg = falhar(null, MAX_FALHAS)!; // última falha em t0+4s
    const s = situacaoLogin(reg, depois(4_000 + 1));
    expect(s).toEqual({ bloqueado: true, segundos: Math.ceil((BLOQUEIO_MS - 1) / 1000) });
  });

  it("libera depois do tempo de bloqueio", () => {
    const reg = falhar(null, MAX_FALHAS)!;
    expect(situacaoLogin(reg, depois(4_000 + BLOQUEIO_MS)).bloqueado).toBe(false);
  });

  it("após o bloqueio expirar, a contagem recomeça do zero", () => {
    const reg = falhar(null, MAX_FALHAS)!;
    const novo = registrarFalha(reg, depois(4_000 + BLOQUEIO_MS + 1000));
    expect(novo.falhas).toBe(1);
    expect(novo.bloqueadoAte).toBeNull();
  });

  it("falhas fora da janela de 15 minutos não se acumulam", () => {
    const antigo = registrarFalha(null, t0);
    const novo = registrarFalha(antigo, depois(JANELA_MS + 1));
    expect(novo.falhas).toBe(1);
  });

  it("falhas dentro da janela se acumulam", () => {
    const reg = falhar(null, 3)!;
    expect(registrarFalha(reg, depois(60_000)).falhas).toBe(4);
  });

  it("mensagem fala em minutos, no singular e no plural", () => {
    expect(mensagemBloqueio(30)).toBe("Muitas tentativas. Tente novamente em 1 minuto.");
    expect(mensagemBloqueio(61)).toBe("Muitas tentativas. Tente novamente em 2 minutos.");
    expect(mensagemBloqueio(900)).toBe("Muitas tentativas. Tente novamente em 15 minutos.");
  });

  it("a chave é um hash estável que não contém o identificador", () => {
    const a = chaveLogin({ type: "email", value: "pai@escola.com" }, "segredo");
    expect(a).toBe(chaveLogin({ type: "email", value: "pai@escola.com" }, "segredo"));
    expect(a).not.toContain("pai@escola.com");
    expect(a).not.toBe(chaveLogin({ type: "email", value: "mae@escola.com" }, "segredo"));
    expect(a).not.toBe(chaveLogin({ type: "email", value: "pai@escola.com" }, "outro"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
