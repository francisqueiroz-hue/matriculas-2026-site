import type { Db } from "./db";
import { criarFerramentasAdmin } from "./ferramentas";
import type { Env } from "./tipos";

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

/**
 * Servidor MCP mínimo (JSON-RPC sobre HTTP): initialize, tools/list, tools/call.
 * Versão do protocolo e transporte seguem a especificação MCP vigente — confirmar antes do go-live.
 */
export async function tratarMcp(req: Request, env: Env, db: Db): Promise<Response> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!env.MCP_TOKEN || !iguais(token, env.MCP_TOKEN)) return json({ error: "não autorizado" }, 401);
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);

  const msg: any = await req.json().catch(() => null);
  if (!msg || msg.jsonrpc !== "2.0") return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "requisição inválida" } }, 400);
  const id = msg.id ?? null;
  const ok = (result: unknown) => json({ jsonrpc: "2.0", id, result });
  const erro = (code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });

  if (msg.method?.startsWith("notifications/")) return new Response(null, { status: 202 });
  const ferramentas = criarFerramentasAdmin(db);
  switch (msg.method) {
    case "initialize":
      return ok({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "lia", version: "0.1.0" } });
    case "tools/list":
      return ok({ tools: Object.values(ferramentas).map((f) => ({ name: f.def.nome, description: f.def.descricao, inputSchema: f.def.parametros })) });
    case "tools/call": {
      const f = ferramentas[msg.params?.name];
      if (!f) return erro(-32602, "ferramenta desconhecida");
      try {
        const r = await f.executar(msg.params?.arguments ?? {});
        return ok({ content: [{ type: "text", text: JSON.stringify(r) }] });
      } catch (e) {
        return ok({ isError: true, content: [{ type: "text", text: (e as Error).message }] });
      }
    }
    default:
      return erro(-32601, "método não encontrado");
  }
}
