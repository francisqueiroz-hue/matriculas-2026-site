import { isWhatsAppConfigured } from "@/lib/whatsapp";

/**
 * Modelos (templates) de mensagem que o próprio ClassLink cadastra na Meta e usa.
 *
 * A Meta só entrega mensagem iniciada pela escola (fora das 24h após a pessoa escrever)
 * se ela usar um modelo aprovado. Os dois modelos abaixo não têm dados sensíveis (sem
 * senha), então são da categoria Utilidade e costumam ser aprovados rápido:
 *  - convite: avisa que o acesso foi criado; o botão "ACESSO" faz a pessoa responder, o
 *    que abre a janela de 24h — e o webhook devolve login e senha na hora;
 *  - aviso: avisa a equipe de mensagem nova no ClassLink.
 *
 * Para cadastrar e consultar, é preciso o ID da conta do WhatsApp Business
 * (WHATSAPP_BUSINESS_ACCOUNT_ID, em Meta for Developers → WhatsApp → Configuração da API).
 */

export type TipoModelo = "convite" | "aviso";

export interface DefinicaoModelo {
  tipo: TipoModelo;
  /** Variável de ambiente que permite usar um modelo com outro nome (já aprovado). */
  variavel: string;
  nomePadrao: string;
  corpo: string;
  exemplo: string[];
  botoes: string[];
}

export const MODELOS: Record<TipoModelo, DefinicaoModelo> = {
  convite: {
    tipo: "convite",
    variavel: "WHATSAPP_TEMPLATE_CONVITE",
    nomePadrao: "convite_acesso_classlink",
    corpo:
      "Olá, {{1}}! A escola cadastrou você no ClassLink, o aplicativo de comunicação da escola.\n\n" +
      "Para receber agora seu login e sua senha provisória, toque no botão ACESSO abaixo.",
    exemplo: ["Maria"],
    botoes: ["ACESSO"],
  },
  aviso: {
    tipo: "aviso",
    variavel: "WHATSAPP_TEMPLATE_AVISO",
    nomePadrao: "aviso_mensagem_classlink",
    corpo:
      "Você recebeu uma nova mensagem no ClassLink de {{1}}:\n\n\"{{2}}\"\n\nPara responder, abra: {{3}}\n\nAviso automático da escola.",
    exemplo: ["Maria Silva", "Bom dia! O Davi vai sair mais cedo hoje", "https://classlink.escola/dashboard/mensagens/abc123"],
    botoes: [],
  },
};

export const IDIOMA_MODELOS = () => process.env.WHATSAPP_TEMPLATE_IDIOMA?.trim() || "pt_BR";

export interface StatusModelo {
  tipo: TipoModelo;
  nome: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "NAO_CADASTRADO" | "DESCONHECIDO";
  motivo?: string | null;
}

function base() {
  return (process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v21.0").replace(/\/$/, "");
}

export function wabaId(): string | null {
  return process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || null;
}

export function nomeDoModelo(tipo: TipoModelo): string {
  const def = MODELOS[tipo];
  return process.env[def.variavel]?.trim() || def.nomePadrao;
}

/** Corpo do cadastro do modelo na Graph API (POST /{waba}/message_templates). */
export function payloadCriacao(tipo: TipoModelo) {
  const def = MODELOS[tipo];
  const components: Record<string, unknown>[] = [
    { type: "BODY", text: def.corpo, example: { body_text: [def.exemplo] } },
  ];
  if (def.botoes.length > 0) {
    components.push({ type: "BUTTONS", buttons: def.botoes.map((text) => ({ type: "QUICK_REPLY", text })) });
  }
  return { name: nomeDoModelo(tipo), language: IDIOMA_MODELOS(), category: "UTILITY", components };
}

// Cache curto por instância: o status muda raramente e cada envio consultaria a Meta.
const cache = new Map<string, { status: StatusModelo; em: number }>();
const CACHE_MS = 5 * 60 * 1000;

export function limparCacheModelos() {
  cache.clear();
}

export async function consultarModelo(tipo: TipoModelo): Promise<StatusModelo> {
  const nome = nomeDoModelo(tipo);
  const waba = wabaId();
  if (!waba || !isWhatsAppConfigured()) return { tipo, nome, status: "DESCONHECIDO" };

  const chave = `${waba}:${nome}`;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.status;

  try {
    const url = `${base()}/${waba}/message_templates?name=${encodeURIComponent(nome)}&fields=name,status,language,rejected_reason`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
    const idioma = IDIOMA_MODELOS();
    const itens: { name: string; status: string; language: string; rejected_reason?: string }[] = data?.data ?? [];
    const item = itens.find((i) => i.name === nome && i.language === idioma) ?? itens.find((i) => i.name === nome);
    const status: StatusModelo = item
      ? { tipo, nome, status: (item.status as StatusModelo["status"]) ?? "DESCONHECIDO", motivo: item.rejected_reason ?? null }
      : { tipo, nome, status: "NAO_CADASTRADO" };
    cache.set(chave, { status, em: Date.now() });
    return status;
  } catch (err) {
    console.error(`Falha ao consultar o modelo ${nome} na Meta`, err);
    return { tipo, nome, status: "DESCONHECIDO", motivo: err instanceof Error ? err.message : null };
  }
}

/**
 * Modelo pronto para uso: aprovado na Meta ou, sem o ID da conta para consultar, informado
 * explicitamente pela variável de ambiente (a escola garante que está aprovado).
 */
export async function modeloDisponivel(tipo: TipoModelo): Promise<{ name: string; language: string } | null> {
  if (!isWhatsAppConfigured()) return null;
  const def = MODELOS[tipo];
  const nome = nomeDoModelo(tipo);
  if (!wabaId()) return process.env[def.variavel]?.trim() ? { name: nome, language: IDIOMA_MODELOS() } : null;
  const status = await consultarModelo(tipo);
  if (status.status === "APPROVED") return { name: nome, language: IDIOMA_MODELOS() };
  // Se a consulta falhar mas a escola informou o nome, confia na variável.
  if (status.status === "DESCONHECIDO" && process.env[def.variavel]?.trim()) return { name: nome, language: IDIOMA_MODELOS() };
  return null;
}

/** Cadastra na Meta os modelos que ainda não existem. Os que já existem ficam como estão. */
export async function cadastrarModelos(): Promise<StatusModelo[]> {
  const waba = wabaId();
  if (!waba) throw new Error("Informe WHATSAPP_BUSINESS_ACCOUNT_ID (ID da conta do WhatsApp Business) na Vercel.");
  if (!isWhatsAppConfigured()) throw new Error("API do WhatsApp não configurada (WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID).");

  const resultado: StatusModelo[] = [];
  for (const tipo of Object.keys(MODELOS) as TipoModelo[]) {
    limparCacheModelos();
    const atual = await consultarModelo(tipo);
    if (atual.status !== "NAO_CADASTRADO" && atual.status !== "DESCONHECIDO") {
      resultado.push(atual);
      continue;
    }
    const res = await fetch(`${base()}/${waba}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payloadCriacao(tipo)),
    });
    const data = await res.json();
    if (!res.ok) {
      resultado.push({ tipo, nome: nomeDoModelo(tipo), status: "DESCONHECIDO", motivo: data?.error?.error_user_msg ?? data?.error?.message ?? `HTTP ${res.status}` });
      continue;
    }
    resultado.push({ tipo, nome: nomeDoModelo(tipo), status: (data?.status as StatusModelo["status"]) ?? "PENDING" });
  }
  limparCacheModelos();
  return resultado;
}
