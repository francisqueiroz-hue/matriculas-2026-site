import { describe, expect, it } from "vitest";
import {
  FICHA_VAZIA,
  alteracoesSaude,
  autorizadoSchema,
  avisoAlteracaoFamilia,
  descreverAutorizado,
  fichaTemDados,
  planejarAutorizados,
  salvarSaudeSchema,
  VERSAO_TERMO_SAUDE,
} from "@/lib/ficha-saude";

describe("validação", () => {
  it("apara textos, vazio vira null e recusa texto longo demais", () => {
    const r = salvarSaudeSchema.parse({ ficha: { alergias: "  amendoim ", medicamentos: "" } });
    expect(r.ficha?.alergias).toBe("amendoim");
    expect(r.ficha?.medicamentos).toBeNull();
    expect(salvarSaudeSchema.safeParse({ ficha: { alergias: "x".repeat(1001) } }).success).toBe(false);
  });

  it("telefone guarda só os dígitos, sem o 55, e recusa número sem DDD", () => {
    expect(autorizadoSchema.parse({ nome: "Maria Souza", telefone: "+55 (21) 99876-5432" }).telefone).toBe("21998765432");
    expect(autorizadoSchema.safeParse({ nome: "Maria Souza", telefone: "99876-5432" }).success).toBe(false);
  });

  it("nome com pelo menos 3 letras e no máximo 10 pessoas", () => {
    expect(autorizadoSchema.safeParse({ nome: " a " }).success).toBe(false);
    const muitos = Array.from({ length: 11 }, (_, i) => ({ nome: `Pessoa ${i}` }));
    expect(salvarSaudeSchema.safeParse({ autorizados: muitos }).success).toBe(false);
  });

  it("aceite só vale com a versão atual do termo", () => {
    expect(salvarSaudeSchema.safeParse({ consentimento: { aceito: true, versaoTexto: "antiga" } }).success).toBe(false);
    expect(salvarSaudeSchema.safeParse({ consentimento: { aceito: true, versaoTexto: VERSAO_TERMO_SAUDE } }).success).toBe(true);
    expect(salvarSaudeSchema.safeParse({}).success).toBe(false);
  });
});

describe("histórico", () => {
  it("uma linha por campo que mudou, com antes e depois", () => {
    const antes = { ...FICHA_VAZIA, alergias: "leite" };
    const depois = { ...FICHA_VAZIA, alergias: "leite e ovo", medicamentos: "bombinha" };
    expect(alteracoesSaude(antes, depois)).toEqual([
      { campo: "saude.alergias", valorAnterior: "leite", valorNovo: "leite e ovo" },
      { campo: "saude.medicamentos", valorAnterior: null, valorNovo: "bombinha" },
    ]);
    expect(alteracoesSaude(antes, antes)).toEqual([]);
  });

  it("fichaTemDados ignora campos em branco", () => {
    expect(fichaTemDados(FICHA_VAZIA)).toBe(false);
    expect(fichaTemDados({ ...FICHA_VAZIA, condicoes: "  " })).toBe(false);
    expect(fichaTemDados({ ...FICHA_VAZIA, condicoes: "asma" })).toBe(true);
  });
});

describe("pessoas autorizadas", () => {
  const avo = { id: "p1", nome: "Maria Souza", parentesco: "avó", telefone: "21998765432", documento: null, observacao: null };
  const tio = { id: "p2", nome: "João Souza", parentesco: "tio", telefone: null, documento: null, observacao: null };

  it("inclui, altera e remove comparando com a lista enviada", () => {
    const plano = planejarAutorizados(
      [avo, tio],
      [
        { id: "p1", nome: "Maria Souza", parentesco: "avó", telefone: "21911112222" },
        { nome: "Van do Zé", parentesco: "transporte" },
      ],
    );
    expect(plano.criar).toHaveLength(1);
    expect(plano.atualizar.map((a) => a.id)).toEqual(["p1"]);
    expect(plano.remover).toEqual(["p2"]);
    expect(plano.alteracoes.map((a) => [a.valorAnterior === null, a.valorNovo === null])).toEqual([
      [false, false],
      [true, false],
      [false, true],
    ]);
  });

  it("sem mudança não gera nada", () => {
    expect(planejarAutorizados([avo], [{ ...avo }]).alteracoes).toEqual([]);
  });

  it("recusa id de pessoa que não é deste aluno", () => {
    expect(() => planejarAutorizados([avo], [{ id: "outro", nome: "Fulano" }])).toThrow();
  });

  it("descreve a pessoa para o histórico", () => {
    expect(descreverAutorizado(avo)).toBe("Maria Souza (avó) · tel. 21998765432");
  });
});

it("aviso à escola diz o que a família mudou", () => {
  const a = avisoAlteracaoFamilia("Lia Souza", "Ana Souza", [
    { campo: "saude.alergias", valorAnterior: null, valorNovo: "ovo" },
    { campo: "autorizado", valorAnterior: null, valorNovo: "Maria" },
    { campo: "autorizado", valorAnterior: "João", valorNovo: null },
  ]);
  expect(a.title).toBe("Ficha de saúde de Lia atualizada pela família");
  expect(a.body).toBe("Ana Souza alterou: alergias, pessoas autorizadas a buscar. Confira e atualize os protocolos da escola.");
});

describe("menu", async () => {
  const { agruparLinks, getNavLinks } = await import("@/lib/nav-links");
  const temSaude = (u: Parameters<typeof getNavLinks>[0]) => getNavLinks(u).some((l) => l.href === "/dashboard/saude");
  it("direção, coordenação e família têm 'Saúde e autorizados'; professor não", () => {
    expect(temSaude({ role: "ADMIN", isCoordenacao: false, funcao: "DIRECAO" })).toBe(true);
    expect(temSaude({ role: "STAFF", isCoordenacao: true })).toBe(true);
    expect(temSaude({ role: "GUARDIAN", isCoordenacao: false })).toBe(true);
    expect(temSaude({ role: "STAFF", isCoordenacao: false })).toBe(false);
  });
  it("na escola fica em Secretaria; na família, em Meu(s) filho(s)", () => {
    const secao = (u: Parameters<typeof getNavLinks>[0]) =>
      agruparLinks(getNavLinks(u)).find((g) => g.links.some((l) => l.href === "/dashboard/saude"))?.titulo;
    expect(secao({ role: "ADMIN", isCoordenacao: false, funcao: "DIRECAO" })).toBe("Secretaria");
    expect(secao({ role: "GUARDIAN", isCoordenacao: false })).toBe("Meu(s) filho(s)");
  });
});
