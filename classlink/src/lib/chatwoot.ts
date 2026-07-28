/**
 * Cliente da API do Chatwoot (chatwoot.com/developers/api) — usado para enviar mensagens
 * por WhatsApp e e-mail através dos inboxes configurados no Chatwoot, e para vincular cada
 * responsável a um contato do Chatwoot (via o campo `identifier`, que guarda o id do
 * usuário no ClassLink e evita qualquer casamento por telefone/e-mail em texto livre).
 *
 * ⚠️ Os nomes de campo seguem a API pública do Chatwoot no momento da implementação.
 * Confira a documentação oficial antes de usar em produção — assim como outras integrações
 * bancárias/de terceiros neste projeto, essa superfície fica isolada neste arquivo.
 */

/** Normaliza um telefone brasileiro em qualquer formato para E.164 sem "+" (formato usado como source_id do WhatsApp). */
export function normalizePhoneBR(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

export function isChatwootConfigured() {
  return Boolean(
    process.env.CHATWOOT_BASE_URL && process.env.CHATWOOT_ACCOUNT_ID && process.env.CHATWOOT_API_ACCESS_TOKEN,
  );
}

export function isChatwootChannelConfigured(canal: "WHATSAPP" | "EMAIL") {
  if (!isChatwootConfigured()) return false;
  return Boolean(canal === "WHATSAPP" ? process.env.CHATWOOT_INBOX_ID_WHATSAPP : process.env.CHATWOOT_INBOX_ID_EMAIL);
}

function inboxIdFor(canal: "WHATSAPP" | "EMAIL"): string {
  return canal === "WHATSAPP" ? env("CHATWOOT_INBOX_ID_WHATSAPP") : env("CHATWOOT_INBOX_ID_EMAIL");
}

async function chatwootFetch(path: string, init?: RequestInit) {
  const baseUrl = env("CHATWOOT_BASE_URL").replace(/\/$/, "");
  const accountId = env("CHATWOOT_ACCOUNT_ID");
  const token = env("CHATWOOT_API_ACCESS_TOKEN");

  const response = await fetch(`${baseUrl}/api/v1/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      api_access_token: token,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message ?? `Chatwoot retornou ${response.status} em ${path}`);
  }
  return data;
}

/** Busca o contato pelo identifier (id do responsável no ClassLink) ou cria um novo. */
async function findOrCreateContact(guardian: { id: string; name: string; phone: string | null; email: string }): Promise<number> {
  const busca = await chatwootFetch(`/contacts/search?q=${encodeURIComponent(guardian.id)}`);
  const existente = (busca?.payload ?? []).find((c: { identifier?: string }) => c.identifier === guardian.id);
  if (existente) return existente.id;

  const criado = await chatwootFetch("/contacts", {
    method: "POST",
    body: JSON.stringify({
      identifier: guardian.id,
      name: guardian.name,
      email: guardian.email,
      phone_number: guardian.phone || undefined,
    }),
  });
  return criado.payload.contact.id;
}

/** Garante que o contato tem um "contact_inbox" (vínculo com o canal) e retorna o source_id usado nele. */
async function ensureContactInbox(contactId: number, inboxId: string, sourceId: string): Promise<string> {
  const contato = await chatwootFetch(`/contacts/${contactId}`);
  const existente = (contato?.payload?.contact_inboxes ?? []).find(
    (ci: { inbox: { id: number } }) => String(ci.inbox.id) === inboxId,
  );
  if (existente) return existente.source_id;

  const criado = await chatwootFetch(`/contacts/${contactId}/contact_inboxes`, {
    method: "POST",
    body: JSON.stringify({ inbox_id: Number(inboxId), source_id: sourceId }),
  });
  return criado.contact_inbox?.source_id ?? sourceId;
}

async function findOrCreateConversation(contactId: number, inboxId: string, sourceId: string): Promise<number> {
  const conversas = await chatwootFetch(`/contacts/${contactId}/conversations`);
  const existente = (conversas?.payload ?? []).find(
    (c: { inbox_id: number; status: string }) => String(c.inbox_id) === inboxId && c.status !== "resolved",
  );
  if (existente) return existente.id;

  const criada = await chatwootFetch("/conversations", {
    method: "POST",
    body: JSON.stringify({ contact_id: contactId, inbox_id: Number(inboxId), source_id: sourceId }),
  });
  return criada.id;
}

/**
 * Envia uma mensagem a um responsável pelo WhatsApp ou e-mail via Chatwoot, criando o
 * contato/conversa no Chatwoot na primeira vez que for necessário. `sourceId` é o telefone
 * (E.164 sem "+", para WhatsApp) ou o e-mail (para e-mail) do responsável.
 */
export async function sendChatwootMessage(input: {
  canal: "WHATSAPP" | "EMAIL";
  guardian: { id: string; name: string; phone: string | null; email: string };
  sourceId: string;
  content: string;
}): Promise<{ contactId: number; conversationId: number; externalId: string }> {
  const inboxId = inboxIdFor(input.canal);
  const contactId = await findOrCreateContact(input.guardian);
  const source = await ensureContactInbox(contactId, inboxId, input.sourceId);
  const conversationId = await findOrCreateConversation(contactId, inboxId, source);

  const mensagem = await chatwootFetch(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: input.content, message_type: "outgoing" }),
  });

  return { contactId, conversationId, externalId: String(mensagem.id) };
}

export interface ChatwootIncomingMessage {
  externalId: string;
  content: string;
}

/**
 * Busca as mensagens recebidas do responsável (message_type "incoming") numa conversa do
 * Chatwoot. Usado para sincronizar por polling em vez de depender de webhook — o plano
 * gratuito do Chatwoot Cloud não inclui webhooks, só os planos pagos.
 */
export async function fetchChatwootIncomingMessages(chatwootConversationId: number): Promise<ChatwootIncomingMessage[]> {
  const data = await chatwootFetch(`/conversations/${chatwootConversationId}/messages`);
  const mensagens: { id: number; content: string | null; message_type: number | string }[] = data?.payload ?? data ?? [];

  return mensagens
    .filter((m) => (m.message_type === "incoming" || m.message_type === 0) && m.content)
    .map((m) => ({ externalId: String(m.id), content: m.content as string }));
}
