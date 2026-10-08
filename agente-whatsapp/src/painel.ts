import { validarAcesso } from "./acesso";
import { adicionar } from "./conhecimento";
import { assumir, definirLiaLigada, devolver, historico, liaLigada, liaPausada, listarConversas } from "./conversa";
import type { Db } from "./db";
import { decidirSugestao, listarChamados, listarSugestoes, resolverChamado } from "./fila";
import { usoDoMes } from "./limites";
import { SENSIVEL } from "./memoria";
import { PAINEL_ARQUIVOS } from "./painel-html";
import { salvarAssinatura } from "./push";
import type { Env } from "./tipos";

export interface DepsPainel {
  validar?: (req: Request) => Promise<{ email: string } | null>;
}

const json = (dado: unknown, status = 200) => new Response(JSON.stringify(dado), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const erro = (msg: string, status: number) => json({ erro: msg }, status);
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

function pagina(caminho: string): Response | null {
  const nome = caminho === "/painel" || caminho === "/painel/" ? "index.html" : caminho.replace(/^\/painel\//, "");
  const arq = PAINEL_ARQUIVOS[nome];
  return arq ? new Response(arq.corpo, { headers: { "content-type": arq.tipo, "cache-control": "no-cache" } }) : null;
}

/** Página, manifest e service worker são públicos (sem dados); toda a API exige o login do dono pelo Cloudflare Access. */
export async function tratarPainel(req: Request, env: Env, db: Db, deps: DepsPainel = {}): Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/painel/api/")) return (req.method === "GET" && pagina(url.pathname)) || erro("não encontrado", 404);

  if (!(await (deps.validar ?? ((r) => validarAcesso(r, env)))(req))) return erro("não autorizado", 401);
  // Exigir JSON impede que um formulário de outro site dispare ações com o login do dono.
  let corpo: Record<string, any> = {};
  if (req.method === "POST") {
    const site = req.headers.get("sec-fetch-site");
    const origem = req.headers.get("origin");
    if ((site && site !== "same-origin" && site !== "none") || (origem && origem !== url.origin)) return erro("origem não permitida", 403);
    if ((req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") return erro("use application/json", 415);
    corpo = (await req.json().catch(() => ({}))) ?? {};
  } else if (req.method !== "GET") return erro("método não permitido", 405);

  const rota = url.pathname.slice("/painel/api".length).split("/").filter(Boolean);
  const [a, b, c] = rota;
  const post = req.method === "POST";

  if (a === "resumo" && !post) {
    const uso = await usoDoMes(db);
    const abertos = await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM chamados WHERE status = 'aberto'");
    const lim = Number(env.LIMITE_MENSAGENS_MES);
    return json({ mensagensMes: uso.mensagens, limiteMensagens: Number.isFinite(lim) && env.LIMITE_MENSAGENS_MES ? lim : 900, tokensHoje: uso.tokensHoje, chamadosAbertos: abertos?.n ?? 0, liaLigada: await liaLigada(db), vapidPublicKey: env.VAPID_PUBLIC_KEY ?? "" });
  }
  if (a === "lia" && post) {
    if (typeof corpo.ligada !== "boolean") return erro("informe ligada: true|false", 400);
    await definirLiaLigada(db, corpo.ligada);
    return json({ ok: true });
  }
  if (a === "conversas" && !b && !post) return json(await listarConversas(db));
  if (a === "conversas" && b) {
    if (!/^\d{8,15}$/.test(b)) return erro("telefone inválido", 400);
    if (!c && !post) return json({ mensagens: await historico(db, b, 100), chamados: (await listarChamados(db)).filter((x) => x.telefone === b), pausada: await liaPausada(db, b) });
    if (c === "assumir" && post) return (await assumir(db, b), json({ ok: true }));
    if (c === "devolver" && post) return (await devolver(db, b), json({ ok: true }));
  }
  if (a === "chamados" && !b && !post) return json(await listarChamados(db, url.searchParams.get("status") ?? undefined));
  if (a === "chamados" && b && c === "resolver" && post) return (await resolverChamado(db, Number(b)), json({ ok: true }));
  if (a === "sugestoes" && !b && !post) return json(await listarSugestoes(db));
  if (a === "sugestoes" && b && c === "decidir" && post) {
    if (typeof corpo.aprovar !== "boolean") return erro("informe aprovar: true|false", 400);
    const resposta = typeof corpo.resposta === "string" ? corpo.resposta.slice(0, 2000) : undefined;
    if (resposta && SENSIVEL.test(resposta)) return erro("a base não pode ter CPF ou e-mail", 400);
    await decidirSugestao(db, Number(b), corpo.aprovar, resposta);
    return json({ ok: true });
  }
  if (a === "base" && !post) return json(await db.all("SELECT id, pergunta, resposta FROM base WHERE aprovado = 1 ORDER BY id DESC LIMIT 200"));
  if (a === "base" && post) {
    const pergunta = texto(corpo.pergunta, 300);
    const resposta = texto(corpo.resposta, 2000);
    if (!pergunta || !resposta) return erro("informe pergunta e resposta", 400);
    if (SENSIVEL.test(pergunta + " " + resposta)) return erro("a base não pode ter CPF ou e-mail", 400);
    return json({ id: await adicionar(db, pergunta, resposta, true) });
  }
  if (a === "push" && post) {
    if (typeof corpo.endpoint !== "string" || !corpo.endpoint.startsWith("https://") || !corpo.keys?.p256dh || !corpo.keys?.auth) return erro("assinatura inválida", 400);
    await salvarAssinatura(db, { endpoint: corpo.endpoint, keys: { p256dh: String(corpo.keys.p256dh), auth: String(corpo.keys.auth) } });
    return json({ ok: true });
  }
  return erro("não encontrado", 404);
}
