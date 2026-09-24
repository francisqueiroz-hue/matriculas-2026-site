import { describe, expect, it } from "vitest";
import { funcaoDoUsuario, perfilDaFuncao } from "@/lib/equipe";
import { createUserSchema } from "@/lib/validators";

describe("função da equipe", () => {
  it("define o perfil de acesso", () => {
    expect(perfilDaFuncao("DIRECAO")).toEqual({ role: "ADMIN", isCoordenacao: false });
    expect(perfilDaFuncao("COORDENACAO")).toEqual({ role: "STAFF", isCoordenacao: true });
    expect(perfilDaFuncao("PROFESSOR")).toEqual({ role: "STAFF", isCoordenacao: false });
    expect(perfilDaFuncao("AUXILIAR")).toEqual({ role: "STAFF", isCoordenacao: false });
  });

  it("deduz a função de cadastros antigos pelo perfil", () => {
    expect(funcaoDoUsuario({ funcao: null, role: "ADMIN", isCoordenacao: false })).toBe("DIRECAO");
    expect(funcaoDoUsuario({ funcao: null, role: "STAFF", isCoordenacao: true })).toBe("COORDENACAO");
    expect(funcaoDoUsuario({ funcao: null, role: "STAFF", isCoordenacao: false })).toBe("PROFESSOR");
    expect(funcaoDoUsuario({ funcao: "AUXILIAR", role: "STAFF", isCoordenacao: false })).toBe("AUXILIAR");
    expect(funcaoDoUsuario({ funcao: null, role: "GUARDIAN", isCoordenacao: false })).toBeNull();
  });
});

describe("cadastro da equipe igual ao dos responsáveis", () => {
  it("aceita só nome + celular, sem e-mail nem senha", () => {
    const dados = createUserSchema.parse({ name: "Joana", phone: "(21) 97777-1111", email: "", password: "", funcao: "AUXILIAR" });
    expect(dados.email).toBeUndefined();
    expect(dados.password).toBeUndefined();
  });

  it("exige celular ou e-mail", () => {
    expect(() => createUserSchema.parse({ name: "Joana", funcao: "PROFESSOR" })).toThrow();
  });

  it("recusa função desconhecida e senha curta quando informada", () => {
    expect(() => createUserSchema.parse({ name: "Joana", phone: "21977771111", funcao: "DIRETOR" })).toThrow();
    expect(() => createUserSchema.parse({ name: "Joana", phone: "21977771111", funcao: "PROFESSOR", password: "123" })).toThrow();
  });
});
