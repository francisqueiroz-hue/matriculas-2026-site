import type { Db } from "./db";
import type { MensagemEntrada } from "./tipos";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** HMAC-SHA256 do corpo bruto (X-Hub-Signature-256), comparado em tempo constante. */
export async function verificarAssinatura(corpo: string, cabecalho: string | null, segredo: string): Promise<boolean> {
  if (!segredo || !cabecalho) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bruta = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const esperado = "sha256=" + [...bruta].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (esperado.length !== cabecalho.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ cabecalho.charCodeAt(i);
  return diff === 0;
}

export function verificarDesafio(params: URLSearchParams, token: string): string | null {
  const desafio = params.get("hub.challenge");
  if (params.get("hub.mode") === "subscribe" && token && params.get("hub.verify_token") === token && desafio) return desafio;
  return null;
}

function mudancas(payload: unknown, campo: string, phoneNumberId: string): Json[] {
  return lista(obj(payload)?.entry)
    .flatMap((e) => lista(obj(e)?.changes))
    .map(obj)
    .filter((c): c is Json => !!c && c.field === campo)
    .map((c) => obj(c.value))
    .filter((v): v is Json => !!v && obj(v.metadata)?.phone_number_id === phoneNumberId);
}

function textoDe(m: Json): string {
  if (m.type === "text") return String(obj(m.text)?.body ?? "");
  if (m.type === "button") return String(obj(m.button)?.payload ?? obj(m.button)?.text ?? "");
  if (m.type === "interactive") {
    const r = obj(obj(m.interactive)?.button_reply) ?? obj(obj(m.interactive)?.list_reply);
    return String(r?.title ?? r?.id ?? "");
  }
  return "";
}

/** Só mensagens do número público; qualquer outro `phone_number_id` é ignorado. */
export function extrairMensagens(payload: unknown, phoneNumberId: string): MensagemEntrada[] {
  return mudancas(payload, "messages", phoneNumberId)
    .flatMap((v) => lista(v.messages))
    .map(obj)
    .filter((m): m is Json => !!m && typeof m.id === "string" && typeof m.from === "string")
    .map((m) => ({ wamid: String(m.id), de: String(m.from), tipo: String(m.type ?? "unknown"), texto: textoDe(m), ts: Number(m.timestamp) || 0 }));
}

export interface Eco {
  para: string;
  wamid: string;
  texto: string;
  ts: number;
}

/**
 * Respostas digitadas no app (coexistência). Nome do campo e formato seguem fontes de
 * terceiros — confirmar na documentação oficial da Meta (Task 0 do plano).
 */
export function extrairEcos(payload: unknown, phoneNumberId: string): Eco[] {
  return mudancas(payload, "smb_message_echoes", phoneNumberId)
    .flatMap((v) => lista(v.message_echoes))
    .map(obj)
    .filter((m): m is Json => !!m && typeof m.id === "string" && typeof m.to === "string")
    .map((m) => ({ para: String(m.to), wamid: String(m.id), texto: textoDe(m), ts: Number(m.timestamp) || 0 }));
}

/** true só na primeira vez que o `wamid` é visto (a chave primária decide, mesmo em paralelo). */
export async function marcarProcessada(db: Db, wamid: string): Promise<boolean> {
  const r = await db.run("INSERT INTO processadas (wamid, em) VALUES (?, ?) ON CONFLICT(wamid) DO NOTHING", [wamid, Date.now()]);
  return r.changes === 1;
}
