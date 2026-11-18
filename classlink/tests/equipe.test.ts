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

describe("regras de 18/11/2026: enquete interna, mensagem para a equipe e boletim em PDF", () => {
  const p = (role: "ADMIN" | "STAFF" | "GUARDIAN", funcao: import("@prisma/client").FuncaoEquipe | null, isCoordenacao = false) => ({ role, funcao, isCoordenacao });

  it("direção e coordenação criam enquete interna, escrevem para a equipe e exportam o boletim; secretaria não", async () => {
    const m = await import("@/lib/equipe");
    for (const fn of [m.podeCriarEnqueteInterna, m.podeEscreverParaEquipe, m.podeExportarBoletim]) {
      expect(fn(p("ADMIN", "DIRECAO"))).toBe(true);
      expect(fn(p("ADMIN", null))).toBe(true); // diretor de cadastro antigo
      expect(fn(p("STAFF", "COORDENACAO", true))).toBe(true);
      expect(fn(p("ADMIN", "SECRETARIA"))).toBe(false);
      expect(fn(p("STAFF", "PROFESSOR"))).toBe(false);
      expect(fn(p("STAFF", "AUXILIAR"))).toBe(false);
      expect(fn(p("GUARDIAN", null))).toBe(false);
    }
  });

  it("professores, auxiliares, coordenação e secretaria respondem a enquete interna; direção e famílias não", async () => {
    const { respondeEnqueteInterna } = await import("@/lib/equipe");
    expect(respondeEnqueteInterna(p("STAFF", "PROFESSOR"))).toBe(true);
    expect(respondeEnqueteInterna(p("STAFF", "AUXILIAR"))).toBe(true);
    expect(respondeEnqueteInterna(p("STAFF", null))).toBe(true);
    expect(respondeEnqueteInterna(p("STAFF", "COORDENACAO", true))).toBe(true);
    expect(respondeEnqueteInterna(p("ADMIN", "SECRETARIA"))).toBe(true);
    expect(respondeEnqueteInterna(p("ADMIN", null))).toBe(false);
    expect(respondeEnqueteInterna(p("ADMIN", "DIRECAO"))).toBe(false);
    expect(respondeEnqueteInterna(p("GUARDIAN", null))).toBe(false);
  });
});
