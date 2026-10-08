import { describe, expect, it } from "vitest";
import { claude, ErroProvedor, escolherProvedor, provedorFake, workersAi } from "../src/provedor";
import type { Env } from "../src/tipos";

const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

describe("claude()", () => {
  it("envia cabeçalhos, modelo e converte tool_use em chamadas", async () => {
    let visto: { url: string; init: RequestInit } | undefined;
    const fetchFalso = (async (url: string, init: RequestInit) => {
      visto = { url, init };
      return resp({
        content: [{ type: "text", text: "Vou buscar." }, { type: "tool_use", id: "t1", name: "buscar_conhecimento", input: { consulta: "matrícula" } }],
        usage: { input_tokens: 100, output_tokens: 20 },
      });
    }) as unknown as typeof fetch;
    const p = claude("chave", "claude-haiku-5-5", fetchFalso);
    const r = await p.gerar({ sistema: "Você é a Lia.", mensagens: [{ papel: "user", conteudo: "oi" }] });
    const corpo = JSON.parse(String(visto!.init.body));
    expect(visto!.url).toBe("https://api.anthropic.com/v1/messages");
    expect((visto!.init.headers as Record<string, string>)["x-api-key"]).toBe("chave");
    expect(corpo.model).toBe("claude-haiku-5-5");
    expect(corpo.temperature).toBeUndefined();
    expect(corpo.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(r.texto).toBe("Vou buscar.");
    expect(r.chamadas).toEqual([{ id: "t1", nome: "buscar_conhecimento", args: { consulta: "matrícula" } }]);
    expect(r.tokens).toBe(120);
  });

  it("devolve resultados de ferramenta como tool_result do usuário", async () => {
    let corpo: any;
    const fetchFalso = (async (_u: string, init: RequestInit) => {
      corpo = JSON.parse(String(init.body));
      return resp({ content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } });
    }) as unknown as typeof fetch;
    await claude("k", "m", fetchFalso).gerar({
      sistema: "s",
      mensagens: [
        { papel: "user", conteudo: "oi" },
        { papel: "assistant", conteudo: "", chamadas: [{ id: "t1", nome: "f", args: {} }] },
        { papel: "tool", conteudo: "resultado", idChamada: "t1" },
      ],
    });
    expect(corpo.messages[1].content[0]).toMatchObject({ type: "tool_use", id: "t1" });
    expect(corpo.messages[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "resultado" }] });
  });

  it("429 e 5xx viram ErroProvedor", async () => {
    const fetchFalso = (async () => resp({ error: { message: "limite" } }, 429)) as unknown as typeof fetch;
    await expect(claude("k", "m", fetchFalso).gerar({ sistema: "s", mensagens: [] })).rejects.toBeInstanceOf(ErroProvedor);
  });
});

describe("workersAi()", () => {
  it("chama ai.run com o modelo e devolve o texto", async () => {
    let args: any[] = [];
    const ai = { run: async (...a: any[]) => { args = a; return { response: "Olá!" }; } } as unknown as Ai;
    const r = await workersAi(ai, "@cf/meta/modelo").gerar({ sistema: "s", mensagens: [{ papel: "user", conteudo: "oi" }] });
    expect(args[0]).toBe("@cf/meta/modelo");
    expect(args[1].messages[0]).toEqual({ role: "system", content: "s" });
    expect(r.texto).toBe("Olá!");
    expect(r.chamadas).toEqual([]);
  });
});

describe("escolherProvedor / fake", () => {
  it("respeita env.PROVEDOR e exige a chave do Claude", () => {
    const base = { AI: {} as Ai, MODELO: "m" } as Env;
    expect(() => escolherProvedor({ ...base, PROVEDOR: "claude" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(escolherProvedor({ ...base, PROVEDOR: "workers-ai" })).toBeDefined();
  });
  it("provedorFake devolve o roteiro em ordem", async () => {
    const f = provedorFake([{ texto: "a", chamadas: [], tokens: 0 }, { texto: "b", chamadas: [], tokens: 0 }]);
    expect((await f.gerar({ sistema: "", mensagens: [] })).texto).toBe("a");
    expect((await f.gerar({ sistema: "", mensagens: [] })).texto).toBe("b");
  });
});
