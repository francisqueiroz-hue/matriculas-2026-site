import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

let cachedApp: App | null | undefined;
let erroConfiguracao: string | null = null;

/** Motivo de o Firebase Admin não ter iniciado (ex.: chave privada mal colada), sem expor valores. */
export function erroFirebaseAdmin(): string | null {
  getFirebaseAdminApp();
  return erroConfiguracao;
}

/**
 * Aceita a chave privada colada de vários jeitos na Vercel e devolve o PEM correto:
 * com ou sem aspas/vírgula do JSON, com "\n" literais, com quebras de linha trocadas por
 * espaços, ou até o arquivo JSON da conta de serviço inteiro.
 */
export function normalizarChavePrivada(valor: string | undefined): string | undefined {
  let chave = valor?.trim();
  if (!chave) return undefined;
  if (chave.startsWith("{")) {
    try {
      const json = JSON.parse(chave) as { private_key?: string };
      if (json.private_key) chave = json.private_key.trim();
    } catch {
      // não é JSON válido; segue tentando como texto
    }
  }
  chave = chave.replace(/^"private_key"\s*:\s*/, "").replace(/,$/, "").trim();
  chave = chave.replace(/^["']+|["']+$/g, "");
  chave = chave.replace(/\\+r/g, "").replace(/\\+n/g, "\n").replace(/\r/g, "");

  const pem = chave.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!pem) return chave;
  const corpo = pem[2].replace(/[^A-Za-z0-9+/=]/g, "");
  const linhas = corpo.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${pem[1]}-----\n${linhas.join("\n")}\n-----END ${pem[1]}-----\n`;
}

/**
 * Instância única do Firebase Admin SDK, compartilhada entre push (FCM) e
 * armazenamento de mídia (Storage) — os dois usam a mesma conta de serviço.
 * Retorna null se as credenciais não estiverem configuradas (features
 * dependentes devem degradar graciosamente, nunca derrubar a aplicação).
 */
export function getFirebaseAdminApp(): App | null {
  if (cachedApp !== undefined) return cachedApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizarChavePrivada(process.env.FIREBASE_PRIVATE_KEY);
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKey) {
    cachedApp = null;
    return null;
  }

  try {
    cachedApp = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket });
  } catch (err) {
    // Chave privada colada errada (sem as linhas BEGIN/END, aspas extras, etc.) não pode
    // derrubar as rotas que dependem do Firebase — elas degradam como "não configurado".
    erroConfiguracao = err instanceof Error ? err.message : "credenciais inválidas";
    console.error("Firebase Admin não iniciou — confira FIREBASE_PRIVATE_KEY/FIREBASE_CLIENT_EMAIL", err);
    cachedApp = null;
  }
  return cachedApp;
}
