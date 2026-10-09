import { describe, expect, it } from "vitest";
import { nomeInstitucional, nomeParaQuemVe } from "@/lib/nome-institucional";

const direcao = { name: "Francis Ribeiro", role: "ADMIN" as const, isCoordenacao: false, funcao: "DIRECAO" as const, nomeParaFamilias: null };
const coord = { name: "Célia", role: "STAFF" as const, isCoordenacao: true, funcao: "COORDENACAO" as const, nomeParaFamilias: null };
const secretaria = { ...direcao, nomeParaFamilias: "Secretaria" };
const familia = { name: "Carlos", role: "GUARDIAN" as const, isCoordenacao: false, funcao: null, nomeParaFamilias: null };

describe("nome que as famílias veem", () => {
  it("cargo quando não há nome definido; nome definido quando houver", () => {
    expect(nomeInstitucional(direcao)).toBe("Direção");
    expect(nomeInstitucional(coord)).toBe("Coordenação");
    expect(nomeInstitucional(secretaria)).toBe("Secretaria");
    expect(nomeInstitucional({ ...direcao, nomeParaFamilias: "   " })).toBe("Direção");
    expect(nomeInstitucional(familia)).toBe("Carlos");
  });

  it("família vê o institucional; equipe vê o nome real", () => {
    expect(nomeParaQuemVe(secretaria, "GUARDIAN")).toBe("Secretaria");
    expect(nomeParaQuemVe(secretaria, "ADMIN")).toBe("Francis Ribeiro");
    expect(nomeParaQuemVe(coord, "STAFF")).toBe("Célia");
  });
});
