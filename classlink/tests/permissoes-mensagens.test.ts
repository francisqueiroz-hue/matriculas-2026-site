import { describe, expect, it } from "vitest";
import { cargoParaExibir, perfilMensagens, podeConversar } from "@/lib/permissoes-mensagens";

const direcao = { role: "ADMIN" as const, isCoordenacao: false, funcao: "DIRECAO" as const };
const coordenacao = { role: "STAFF" as const, isCoordenacao: true, funcao: "COORDENACAO" as const };
const coordAntiga = { role: "STAFF" as const, isCoordenacao: true, funcao: null };
const professor = { role: "STAFF" as const, isCoordenacao: false, funcao: "PROFESSOR" as const };
const auxiliar = { role: "STAFF" as const, isCoordenacao: false, funcao: "AUXILIAR" as const };
const profAntigo = { role: "STAFF" as const, isCoordenacao: false, funcao: null };
const familia = { role: "GUARDIAN" as const, isCoordenacao: false, funcao: null };

describe("perfil nas mensagens", () => {
  it("direção e coordenação são gestão; professor e auxiliar não", () => {
    expect(perfilMensagens(direcao)).toBe("gestao");
    expect(perfilMensagens({ ...direcao, funcao: null })).toBe("gestao");
    expect(perfilMensagens(coordenacao)).toBe("gestao");
    expect(perfilMensagens(coordAntiga)).toBe("gestao");
    expect(perfilMensagens(professor)).toBe("professor");
    expect(perfilMensagens(auxiliar)).toBe("professor");
    expect(perfilMensagens(profAntigo)).toBe("professor");
    expect(perfilMensagens(familia)).toBe("familia");
  });

  it("cargo exibido", () => {
    expect(cargoParaExibir(coordenacao)).toBe("Coordenação");
    expect(cargoParaExibir(direcao)).toBe("Direção");
    expect(cargoParaExibir(familia)).toBe("Responsável");
  });
});

describe("quem conversa com quem", () => {
  const casos: [string, string, boolean][] = [
    ["familia", "gestao", true],
    ["familia", "professor", false],
    ["familia", "familia", false],
    ["gestao", "gestao", true],
    ["gestao", "professor", true],
    ["professor", "professor", false],
  ];
  for (const [a, b, esperado] of casos) {
    it(`${a} ↔ ${b}: ${esperado ? "pode" : "não pode"}`, () => {
      expect(podeConversar(a as never, b as never)).toBe(esperado);
      expect(podeConversar(b as never, a as never)).toBe(esperado);
    });
  }
});
