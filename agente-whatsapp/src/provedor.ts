import type { Env } from "./tipos";

export interface FerramentaDef {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
}
export interface Chamada {
  id: string;
  nome: string;
  args: Record<string, unknown>;
}
export type Msg =
  | { papel: "user"; conteudo: string }
  | { papel: "assistant"; conteudo: string; chamadas?: Chamada[] }
  | { papel: "tool"; conteudo: string; idChamada: string; nome?: string };
export interface Resposta {
  texto: string;
  chamadas: Chamada[];
  tokens: number;
}
export interface Requisicao {
  sistema: string;
  mensagens: Msg[];
  ferramentas?: FerramentaDef[];
  /** Pede saída em JSON puro (triagem, aprendizado). */
  json?: boolean;
}
export interface Provedor {
  gerar(req: Requisicao): Promise<Resposta>;
}

export class ErroProvedor extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ErroProvedor";
  }
}

const SO_JSON = "\n\nResponda SOMENTE com um objeto JSON válido, sem texto antes ou depois.";

/**
 * Workers AI. Formato de ferramentas (`tools`/`tool_calls`) e id do modelo seguem o catálogo
 * atual da Cloudflare — confirmar ao escolher `MODELO` (plano, Task 5).
 */
export function workersAi(ai: Ai, modelo: string): Provedor {
  return {
    async gerar(req) {
      const messages: Record<string, unknown>[] = [{ role: "system", content: req.sistema + (req.json ? SO_JSON : "") }];
      for (const m of req.mensagens) {
        if (m.papel === "tool") messages.push({ role: "tool", name: m.nome, content: m.conteudo });
        else messages.push({ role: m.papel, content: m.conteudo });
      }
      const tools = req.ferramentas?.map((f) => ({ name: f.nome, description: f.descricao, parameters: f.parametros }));
      let saida: any;
      try {
        saida = await (ai as unknown as { run(m: string, a: unknown): Promise<unknown> }).run(modelo, { messages, ...(tools?.length ? { tools } : {}), max_tokens: 700 });
      } catch (e) {
        throw new ErroProvedor(`Workers AI falhou: ${(e as Error).message}`);
      }
      const chamadas: Chamada[] = (saida?.tool_calls ?? []).map((c: any, i: number) => ({
        id: String(c.id ?? `c${i}`),
        nome: String(c.name),
        args: typeof c.arguments === "string" ? safeJson(c.arguments) : (c.arguments ?? {}),
      }));
      return { texto: String(saida?.response ?? ""), chamadas, tokens: Number(saida?.usage?.total_tokens ?? 0) };
    },
  };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Claude (opcional, pago) via Messages API; sem temperature/top_p, tool_choice automático. */
export function claude(chave: string, modelo: string, fetchImpl: typeof fetch = fetch): Provedor {
  return {
    async gerar(req) {
      const messages: unknown[] = [];
      for (const m of req.mensagens) {
        if (m.papel === "user") messages.push({ role: "user", content: m.conteudo });
        else if (m.papel === "assistant") {
          const blocos: unknown[] = [];
          if (m.conteudo) blocos.push({ type: "text", text: m.conteudo });
          for (const c of m.chamadas ?? []) blocos.push({ type: "tool_use", id: c.id, name: c.nome, input: c.args });
          messages.push({ role: "assistant", content: blocos.length ? blocos : m.conteudo });
        } else {
          const bloco = { type: "tool_result", tool_use_id: m.idChamada, content: m.conteudo };
          const ultimo = messages[messages.length - 1] as { role: string; content: unknown[] } | undefined;
          if (ultimo?.role === "user" && Array.isArray(ultimo.content) && (ultimo.content[0] as any)?.type === "tool_result") ultimo.content.push(bloco);
          else messages.push({ role: "user", content: [bloco] });
        }
      }
      const corpo: Record<string, unknown> = {
        model: modelo,
        max_tokens: 1024,
        system: [{ type: "text", text: req.sistema + (req.json ? SO_JSON : ""), cache_control: { type: "ephemeral" } }],
        messages,
      };
      if (req.ferramentas?.length) corpo.tools = req.ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.parametros }));
      const r = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados: any = await r.json().catch(() => ({}));
      if (!r.ok) throw new ErroProvedor(dados?.error?.message ?? `Claude HTTP ${r.status}`, r.status);
      const blocos: any[] = dados.content ?? [];
      return {
        texto: blocos.filter((b) => b.type === "text").map((b) => b.text).join(""),
        chamadas: blocos.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, nome: b.name, args: b.input ?? {} })),
        tokens: Number(dados.usage?.input_tokens ?? 0) + Number(dados.usage?.output_tokens ?? 0),
      };
    },
  };
}

export function escolherProvedor(env: Env): Provedor {
  if (env.PROVEDOR === "claude") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada para PROVEDOR=claude");
    return claude(env.ANTHROPIC_API_KEY, env.MODELO);
  }
  return workersAi(env.AI, env.MODELO);
}

/** Só para testes: devolve o roteiro em ordem (ou calcula a resposta por requisição). */
export function provedorFake(roteiro: Resposta[] | ((req: Requisicao) => Resposta | Promise<Resposta>)): Provedor & { chamadas: Requisicao[] } {
  const chamadas: Requisicao[] = [];
  let i = 0;
  return {
    chamadas,
    async gerar(req) {
      chamadas.push(req);
      if (typeof roteiro === "function") return roteiro(req);
      const r = roteiro[Math.min(i++, roteiro.length - 1)];
      if (!r) throw new Error("provedorFake sem roteiro");
      return r;
    },
  };
}
