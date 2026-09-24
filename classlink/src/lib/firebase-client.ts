import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getMessaging, getToken, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

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
  return isFirebaseConfigured() && Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
}

/**
 * Obtém o token FCM do dispositivo. Só pede a permissão de notificação quando
 * `pedirPermissao` é true — navegadores bloqueiam (ou escondem) pedidos feitos sem um
 * clique da pessoa, então o pedido parte do botão "Ativar avisos". Retorna null se
 * indisponível, não configurado ou negado.
 */
export async function requestPushToken(pedirPermissao = false): Promise<string | null> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey || typeof Notification === "undefined") return null;

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  let permission = Notification.permission;
  if (permission === "default" && pedirPermissao) permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register("/sw.js");
  return getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
}
