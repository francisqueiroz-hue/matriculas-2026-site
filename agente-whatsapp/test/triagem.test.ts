import { describe, expect, it } from "vitest";
import casos from "./triagem-casos.json";
import { provedorFake } from "../src/provedor";
import { acolhimento, triar } from "../src/triagem";

const sempreTrivial = () => provedorFake(() => ({ texto: '{"categoria":null,"risco":"baixo","confianca":0.99}', chamadas: [], tokens: 0 }));
const quebrado = () => ({ gerar: async () => { throw new Error("fora do ar"); } });

describe("triagem — regras duras", () => {
  for (const [categoria, frases] of Object.entries(casos.delicadas)) {
    it(`${categoria}: nenhuma das ${frases.length} frases recebe resposta de conteúdo (vazamento = 0)`, async () => {
      for (const frase of frases) {
        const d = await triar(frase, sempreTrivial());
        expect(d.acao, frase).toBe("acolher");
      }
    });
  }
  it("risco à criança é urgente", async () => {
    const d = await triar("meu filho disse que quer se matar", sempreTrivial());
    expect(d).toMatchObject({ acao: "acolher", categoria: "risco_crianca", prioridade: "urgente" });
  });
});

describe("triagem — triviais e falha segura", () => {
  it("frases triviais são respondidas quando o classificador concorda", async () => {
    for (const frase of casos.triviais) expect((await triar(frase, sempreTrivial())).acao, frase).toBe("responder");
  });
  it("erro do provedor = acolher (falha segura)", async () => {
    expect((await triar("qual o horário?", quebrado())).acao).toBe("acolher");
  });
  it("JSON inválido do classificador = acolher", async () => {
    const p = provedorFake(() => ({ texto: "não sei", chamadas: [], tokens: 0 }));
    expect((await triar("qual o horário?", p)).acao).toBe("acolher");
  });
  it("confiança baixa ou risco médio = acolher", async () => {
    const baixa = provedorFake(() => ({ texto: '{"categoria":null,"risco":"baixo","confianca":0.4}', chamadas: [], tokens: 0 }));
    const medio = provedorFake(() => ({ texto: '{"categoria":null,"risco":"medio","confianca":0.95}', chamadas: [], tokens: 0 }));
    expect((await triar("pergunta estranha", baixa)).acao).toBe("acolher");
    expect((await triar("pergunta estranha", medio)).acao).toBe("acolher");
  });
  it("o classificador pode escalar o que as regras não pegaram", async () => {
    const p = provedorFake(() => ({ texto: '{"categoria":"saude","risco":"alto","confianca":0.9}', chamadas: [], tokens: 0 }));
    expect(await triar("ele não está bem desde ontem", p)).toMatchObject({ acao: "acolher", categoria: "saude" });
  });
  it("texto vazio não chama o provedor e pede para escalar", async () => {
    const p = provedorFake(() => ({ texto: "", chamadas: [], tokens: 0 }));
    await triar("   ", p);
    expect(p.chamadas).toHaveLength(0);
  });
  it("acolhimento é texto fixo, sem conteúdo inventado, em todas as categorias", () => {
    for (const c of Object.keys(casos.delicadas)) {
      const t = acolhimento(c as never);
      expect(t).toContain("Lia");
      expect(t).not.toMatch(/R\$|\d{1,2}\/\d{1,2}/);
    }
  });
});
