/**
 * Variáveis públicas do Firebase (NEXT_PUBLIC_FIREBASE_*). Ao colar na Vercel é comum vir
 * junto um caractere invisível (espaço de largura zero, BOM) ou aspas curvas “ ” — o
 * navegador então recusa o cabeçalho da requisição ("TypeError: Type error" no iPhone).
 * Nenhum desses valores tem caracteres fora do ASCII visível, então dá para limpar com segurança.
 */
export function limparValorPublico(valor: string | undefined): string | undefined {
  const v = valor
    ?.replace(/[^\x21-\x7E]/g, "") // só ASCII visível: remove espaços, invisíveis e aspas curvas
    .replace(/^["'`]+|["'`]+$/g, "");
  return v || undefined;
}

/** Formatos esperados (só para diagnóstico; nada aqui é segredo). */
const FORMATOS: Record<string, RegExp> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: /^AIza[0-9A-Za-z_-]{35}$/,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: /^[a-z0-9-]{4,40}$/,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: /^\d{6,20}$/,
  NEXT_PUBLIC_FIREBASE_APP_ID: /^1:\d+:web:[0-9a-f]+$/,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: /^[A-Za-z0-9_-]{80,90}$/,
};

/**
 * Variáveis preenchidas com algum problema: caracteres a mais (que o app limpa sozinho, mas
 * convém corrigir na Vercel) ou formato inesperado mesmo depois de limpar.
 */
export function problemasConfigPublica(env: Record<string, string | undefined>): { nome: string; problema: string }[] {
  const problemas: { nome: string; problema: string }[] = [];
  for (const [nome, formato] of Object.entries(FORMATOS)) {
    const bruto = env[nome];
    if (!bruto?.trim()) continue;
    const limpo = limparValorPublico(bruto) ?? "";
    if (!formato.test(limpo)) problemas.push({ nome, problema: "formato inesperado — confira se colou o valor certo" });
    else if (limpo !== bruto) problemas.push({ nome, problema: "tem espaço, aspas ou caractere invisível a mais" });
  }
  return problemas;
}

type Env = Record<string, string | undefined>;

export interface ResultadoTesteFirebase {
  ok: boolean;
  /** Cada conferência com o resultado; nenhuma inclui valores das variáveis. */
  itens: { titulo: string; ok: boolean; detalhe?: string }[];
}

/** Conferências que dá para fazer sem chamar o Google: as variáveis são do mesmo projeto? */
export function conferirMesmoProjeto(env: Env): ResultadoTesteFirebase["itens"] {
  const itens: ResultadoTesteFirebase["itens"] = [];
  const projetoPublico = limparValorPublico(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const projetoServidor = env.FIREBASE_PROJECT_ID?.trim();
  if (projetoPublico && projetoServidor) {
    itens.push({
      titulo: "PROJECT_ID público igual ao da conta de serviço",
      ok: projetoPublico === projetoServidor,
      detalhe: "NEXT_PUBLIC_FIREBASE_PROJECT_ID e FIREBASE_PROJECT_ID devem ser o mesmo projeto.",
    });
  }
  const appId = limparValorPublico(env.NEXT_PUBLIC_FIREBASE_APP_ID);
  const sender = limparValorPublico(env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
  const senderDoAppId = appId?.match(/^1:(\d+):web:/)?.[1];
  if (senderDoAppId && sender) {
    itens.push({
      titulo: "APP_ID e MESSAGING_SENDER_ID do mesmo projeto",
      ok: senderDoAppId === sender,
      detalhe: "O número no meio do APP_ID (1:NÚMERO:web:...) deve ser igual ao MESSAGING_SENDER_ID.",
    });
  }
  return itens;
}

/** FID no formato aceito pelo Firebase Installations (22 caracteres, começa com c/d/e/f). */
function novoFid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(17));
  bytes[0] = 0b01110000 | (bytes[0] & 0b00001111);
  return Buffer.from(bytes).toString("base64url").slice(0, 22);
}

/**
 * Faz no servidor o mesmo pedido que o celular faz ao registrar o aparelho (criar uma
 * "instalação" no Firebase), inclusive com o endereço do site como origem. Mostra a resposta
 * do Google — é o que diferencia chave de outro projeto, chave restrita ou API desativada.
 */
export async function testarChaveNoGoogle(env: Env, origem: string, fetchImpl: typeof fetch = fetch): Promise<ResultadoTesteFirebase["itens"][number]> {
  const apiKey = limparValorPublico(env.NEXT_PUBLIC_FIREBASE_API_KEY);
  const projectId = limparValorPublico(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const appId = limparValorPublico(env.NEXT_PUBLIC_FIREBASE_APP_ID);
  const titulo = "Google aceita a chave para registrar aparelhos";
  if (!apiKey || !projectId || !appId) return { titulo, ok: false, detalhe: "Faltam API_KEY, PROJECT_ID ou APP_ID." };

  const base = `https://firebaseinstallations.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/installations`;
  try {
    const res = await fetchImpl(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-goog-api-key": apiKey,
        Referer: `${origem}/`,
      },
      body: JSON.stringify({ fid: novoFid(), authVersion: "FIS_v2", appId, sdkVersion: "w:0.6.4" }),
      signal: AbortSignal.timeout(10_000),
    });
    const dados = (await res.json().catch(() => ({}))) as { error?: { message?: string }; fid?: string; refreshToken?: string };
    if (res.ok) {
      // Instalação só de teste: apaga em seguida (melhor esforço).
      if (dados.fid && dados.refreshToken) {
        await fetchImpl(`${base}/${dados.fid}`, {
          method: "DELETE",
          headers: { "x-goog-api-key": apiKey, Authorization: `FIS_v2 ${dados.refreshToken}`, Referer: `${origem}/` },
          signal: AbortSignal.timeout(10_000),
        }).catch(() => undefined);
      }
      return { titulo, ok: true };
    }
    return { titulo, ok: false, detalhe: `${res.status}: ${dados.error?.message ?? "sem detalhe"} — ${explicarErroGoogle(res.status, dados.error?.message ?? "")}` };
  } catch (err) {
    return { titulo, ok: false, detalhe: `Não foi possível falar com o Google (${err instanceof Error ? err.message : String(err)}).` };
  }
}

/** Tradução do erro do Google para o que fazer. */
export function explicarErroGoogle(status: number, mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("api key not valid")) return "a chave não existe: copie de novo o apiKey do app Web no Firebase.";
  if (m.includes("has not been used") || m.includes("is disabled")) return "a API Firebase Installations está desativada: ative-a no Google Cloud (APIs e serviços → Biblioteca).";
  if (m.includes("referer") || m.includes("blocked")) return "a chave tem restrição: no Google Cloud (APIs e serviços → Credenciais), libere este site e as APIs Firebase Installations e Firebase Cloud Messaging.";
  if (status === 403) return "a chave é de outro projeto ou o APP_ID/PROJECT_ID não combinam: copie as variáveis do mesmo bloco de configuração do app Web.";
  return "confira as variáveis NEXT_PUBLIC_FIREBASE_* na Vercel.";
}
