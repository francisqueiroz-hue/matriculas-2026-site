import { NextResponse } from "next/server";

/**
 * Service worker único do app: cache básico de app-shell (offline mínimo) +
 * mensagens em segundo plano do Firebase Cloud Messaging. Servido dinamicamente
 * para poder injetar a config pública do Firebase sem build step separado.
 */
export async function GET() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  const body = `
const CACHE_NAME = "classlink-shell-v1";
const APP_SHELL = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Network-first para navegação/API, cache-first para assets estáticos já vistos.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

// Clique no aviso de mensagem nova (mostrado pelo painel): foca a aba do ClassLink e abre a conversa.
self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  if (data.origem !== "classlink-aviso" || !data.url) return;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      const alvo = new URL(data.url, self.location.origin).href;
      for (const janela of janelas) {
        if (new URL(janela.url).origin === self.location.origin && "focus" in janela) {
          return janela.focus().then((j) => (j && "navigate" in j ? j.navigate(alvo) : undefined));
        }
      }
      return self.clients.openWindow(alvo);
    }),
  );
});

if (${Boolean(firebaseConfig.apiKey)}) {
  importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

  firebase.initializeApp(${JSON.stringify(firebaseConfig)});
  const messaging = firebase.messaging();

  // Mensagens com "notification" (as que o servidor envia) já são exibidas pelo próprio
  // SDK do Firebase — mostrar de novo aqui duplicava o aviso. Só exibe as de dados puros.
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const data = payload.data || {};
    self.registration.showNotification(data.title || "ClassLink", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      data: data.url ? { url: data.url, origem: "classlink-aviso" } : undefined,
    });
  });
}
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
    },
  });
}
