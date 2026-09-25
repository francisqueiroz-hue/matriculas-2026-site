import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

let cachedApp: App | null | undefined;
let erroConfiguracao: string | null = null;

/** Motivo de o Firebase Admin não ter iniciado (ex.: chave privada mal colada), sem expor valores. */
export function erroFirebaseAdmin(): string | null {
  getFirebaseAdminApp();
  return erroConfiguracao;
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
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
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
