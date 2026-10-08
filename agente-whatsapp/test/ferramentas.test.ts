import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";

import { criarFerramentas } from "../src/ferramentas";
import { tratarMcp } from "../src/mcp";
import type { Env } from "../src/tipos";

const T = "5521988887777";

describe("ferramentas do agente", () => {
  it("o telefone é fixado pelo servidor: argumento 'telefone' do modelo é ignorado", async () => {
    const db = sqliteDb();
    const minhas = criarFerramentas(db, T);
    await minhas.salvar_fato_familia.executar({ fato: "Filha no 7º ano", telefone: "5521000000000" });
    expect(await minhas.ler_memoria_familia.executar({ telefone: "5521000000000" })).toEqual(["Filha no 7º ano"]);
    expect(await criarFerramentas(db, "5521999999999").ler_memoria_familia.executar({})).toEqual([]);
    for (const f of Object.values(minhas)) expect(JSON.stringify(f.def.parametros)).not.toContain("telefone");
  });
  it("salvar fato sensível devolve erro em vez de lançar", async () => {
    const db = sqliteDb();
    const r: any = await criarFerramentas(db, T).salvar_fato_familia.executar({ fato: "cpf 123.456.789-09" });
    expect(r.erro).toBeDefined();
  });
  it("encaminhar_humano abre chamado do telefone da conversa", async () => {
    const db = sqliteDb();
    await criarFerramentas(db, T).encaminhar_humano.executar({ motivo: "sem_base", resumo: "Pediu valores", prioridade: "normal" });
    expect((await db.first<{ telefone: string }>("SELECT telefone FROM chamados"))!.telefone).toBe(T);
  });
  it("consultar e reservar visita", async () => {
    const db = sqliteDb();
    const id = (await db.run("INSERT INTO visitas_horarios (data, turno, vagas) VALUES ('2099-01-10', 'tarde', 2)")).lastId;
    const f = criarFerramentas(db, T);
    expect((await f.consultar_horarios_visita.executar({})) as unknown[]).toHaveLength(1);
    expect(await f.reservar_visita.executar({ horario_id: id, serie: "6º ano" })).toMatchObject({ ok: true });
  });
});

describe("MCP", () => {
  const env = { MCP_TOKEN: "segredo" } as Env;
  const chamar = (db: ReturnType<typeof sqliteDb>, corpo: unknown, token: string | null = "segredo") =>
    tratarMcp(new Request("https://x/mcp", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(corpo) }), env, db);

  it("sem token ou com token errado = 401", async () => {
    const db = sqliteDb();
    expect((await chamar(db, { jsonrpc: "2.0", id: 1, method: "tools/list" }, null)).status).toBe(401);
    expect((await chamar(db, { jsonrpc: "2.0", id: 1, method: "tools/list" }, "errado")).status).toBe(401);
  });
  it("tools/list lista as ferramentas administrativas", async () => {
    const r: any = await (await chamar(sqliteDb(), { jsonrpc: "2.0", id: 1, method: "tools/list" })).json();
    const nomes = r.result.tools.map((t: any) => t.name);
    expect(nomes).toEqual(expect.arrayContaining(["adicionar_conhecimento", "listar_chamados", "decidir_sugestao"]));
  });
  it("adicionar_conhecimento cria item aprovado e buscável", async () => {
    const db = sqliteDb();
    await chamar(db, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "adicionar_conhecimento", arguments: { pergunta: "Tem quadra?", resposta: "Sim." } } });
    const r: any = await (await chamar(db, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "buscar_conhecimento", arguments: { consulta: "quadra" } } })).json();
    expect(r.result.content[0].text).toContain("Sim.");
  });
  it("método desconhecido devolve erro JSON-RPC", async () => {
    const r: any = await (await chamar(sqliteDb(), { jsonrpc: "2.0", id: 4, method: "nada" })).json();
    expect(r.error.code).toBe(-32601);
  });
  it("initialize responde com capacidades de ferramentas", async () => {
    const r: any = await (await chamar(sqliteDb(), { jsonrpc: "2.0", id: 5, method: "initialize", params: {} })).json();
    expect(r.result.capabilities.tools).toBeDefined();
  });
});
