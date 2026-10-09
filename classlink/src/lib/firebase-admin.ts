import { limparValorPublico } from "@/lib/firebase-config-publica";
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
 * Projeto, e-mail e chave da conta de serviço. Se FIREBASE_PRIVATE_KEY tiver o arquivo JSON
 * inteiro, o e-mail e o projeto vêm dele — assim chave e e-mail são sempre do mesmo arquivo
 * (e-mail de outra conta dá "invalid_grant: account not found"). Espaço, aspas ou caractere
 * invisível colados junto também fazem o Google recusar a conta, então são removidos.
 */
export function credenciaisDaConta(env: Record<string, string | undefined>) {
  let doJson: { client_email?: string; project_id?: string } = {};
  const bruto = env.FIREBASE_PRIVATE_KEY?.trim();
  if (bruto?.startsWith("{")) {
    try {
      doJson = JSON.parse(bruto) as typeof doJson;
    } catch {
      // não é JSON válido: usa as variáveis separadas
    }
  }
  return {
    projectId: limparValorPublico(doJson.project_id) ?? limparValorPublico(env.FIREBASE_PROJECT_ID),
    clientEmail: limparValorPublico(doJson.client_email) ?? limparValorPublico(env.FIREBASE_CLIENT_EMAIL),
    privateKey: normalizarChavePrivada(env.FIREBASE_PRIVATE_KEY),
  };
}

/**
 * Instância única do Firebase Admin SDK, compartilhada entre push (FCM) e
 * armazenamento de mídia (Storage) — os dois usam a mesma conta de serviço.
 * Retorna null se as credenciais não estiverem configuradas (features
 * dependentes devem degradar graciosamente, nunca derrubar a aplicação).
 */
export function getFirebaseAdminApp(): App | null {
  if (cachedApp !== undefined) return cachedApp;

  const { projectId, clientEmail, privateKey } = credenciaisDaConta(process.env);
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

/**
 * Confere com o Google se a conta de serviço é aceita (pede um token de acesso de verdade).
 * O cert() só valida o formato; uma chave apagada no Google Cloud ou um e-mail que não é o
 * da mesma chave só aparece aqui.
 */
export async function testarContaDeServico(): Promise<{ ok: boolean; detalhe?: string }> {
  const app = getFirebaseAdminApp();
  if (!app) return { ok: false, detalhe: erroConfiguracao ?? "Conta de serviço não configurada." };
  try {
    await app.options.credential?.getAccessToken();
    return { ok: true };
  } catch (err) {
    return { ok: false, detalhe: err instanceof Error ? err.message : String(err) };
  }
}
