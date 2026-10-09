import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getMessaging, getToken, isSupported, type Messaging } from "firebase/messaging";
import { limparValorPublico as limpar } from "@/lib/firebase-config-publica";

const firebaseConfig: FirebaseOptions = {
  apiKey: limpar(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: limpar(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: limpar(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: limpar(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: limpar(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: limpar(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};
const VAPID_KEY = limpar(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);

function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let messagingPromise: Promise<Messaging | null> | null = null;

function getMessagingInstance(): Promise<Messaging | null> {
  if (!isFirebaseConfigured()) return Promise.resolve(null);
  if (!messagingPromise) {
    messagingPromise = isSupported().then((supported) => {
      if (!supported) return null;
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      return getMessaging(app);
    });
  }
  return messagingPromise;
}

export function isPushConfigured() {
  return isFirebaseConfigured() && Boolean(VAPID_KEY);
}

/** Falha ao registrar o aparelho, com a etapa em que aconteceu (aparece no teste da página Conta). */
export class ErroPush extends Error {
  constructor(
    readonly etapa: string,
    causa: unknown,
  ) {
    // Primeira linha da pilha ajuda a saber qual função do navegador recusou (o Safari só diz "Type error").
    const origem = causa instanceof Error ? causa.stack?.split("\n").find((l) => l.trim())?.trim().slice(0, 80) : undefined;
    const detalhe = causa instanceof Error ? `${causa.name}: ${causa.message}${origem ? ` [${origem}]` : ""}` : String(causa);
    super(`${etapa} — ${detalhe}`);
    this.name = "ErroPush";
  }
}

async function etapa<T>(nome: string, acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (err) {
    throw new ErroPush(nome, err);
  }
}

function comPrazo<T>(promessa: Promise<T>, ms: number, mensagem: string): Promise<T> {
  return Promise.race([promessa, new Promise<T>((_, rejeitar) => setTimeout(() => rejeitar(new Error(mensagem)), ms))]);
}

/** Converte a chave VAPID (base64url) e confere se é uma chave P-256 pública (65 bytes, começa com 0x04). */
export function chaveVapid(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error(`chave inválida (${bytes.length} bytes). Confira NEXT_PUBLIC_FIREBASE_VAPID_KEY na Vercel: é a "chave pública" do par de chaves Web Push no Firebase`);
  }
  return bytes;
}

/** Garante a inscrição de push do aparelho (o Firebase reaproveita a existente). */
async function garantirInscricao(registration: ServiceWorkerRegistration, chave: Uint8Array<ArrayBuffer>, refazer: boolean) {
  const atual = await registration.pushManager.getSubscription();
  if (atual && !refazer) return;
  if (atual) await atual.unsubscribe().catch(() => false);
  await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
}

/**
 * Service worker já ativo do app. Tenta registrar/atualizar o /sw.js, mas, se a atualização
 * falhar (o Safari às vezes rejeita), segue com o que já está instalado.
 */
async function serviceWorkerAtivo(): Promise<ServiceWorkerRegistration> {
  let erroRegistro: unknown = null;
  await navigator.serviceWorker.register("/sw.js").catch((err) => {
    erroRegistro = err;
  });
  const existente = await navigator.serviceWorker.getRegistration("/");
  if (!existente) throw erroRegistro ?? new Error("service worker não registrado");
  return comPrazo(navigator.serviceWorker.ready, 15_000, "service worker não ficou ativo");
}

/**
 * Obtém o token FCM do dispositivo. Só pede a permissão de notificação quando
 * `pedirPermissao` é true — navegadores bloqueiam (ou escondem) pedidos feitos sem um
 * clique da pessoa, então o pedido parte do botão "Ativar avisos". Retorna null se
 * indisponível, não configurado ou negado; lança ErroPush (com a etapa) se algo falhar.
 */
export async function requestPushToken(pedirPermissao = false): Promise<string | null> {
  if (!VAPID_KEY || typeof Notification === "undefined" || !("serviceWorker" in navigator)) return null;

  const messaging = await etapa("Suporte do navegador", getMessagingInstance);
  if (!messaging) return null;

  let permission = Notification.permission;
  if (permission === "default" && pedirPermissao) permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await etapa("Service worker", serviceWorkerAtivo);
  const chave = await etapa("Chave pública (VAPID)", async () => chaveVapid(VAPID_KEY));
  await etapa("Inscrição no push do aparelho", () => garantirInscricao(registration, chave, false));

  const obterToken = () =>
    comPrazo(getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }), 30_000, "tempo esgotado");
  try {
    return await obterToken();
  } catch (primeiroErro) {
    // Inscrição antiga/corrompida (comum depois de reinstalar o app no iPhone): refaz do zero e tenta uma vez mais.
    console.warn("Registro do aparelho falhou; refazendo a inscrição", primeiroErro);
    await etapa("Refazer inscrição no push", () => garantirInscricao(registration, chave, true));
    return etapa("Registro no Firebase", obterToken);
  }
}
