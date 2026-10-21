import { NextResponse } from "next/server";
import { limparValorPublico } from "@/lib/firebase-config-publica";
import { FONTE_REGRAS_CACHE_SW } from "@/lib/sw-cache";

/**
 * Service worker único do app: cache de arquivos estáticos públicos (offline mínimo) +
 * mensagens em segundo plano do Firebase Cloud Messaging. Servido dinamicamente
 * para poder injetar a config pública do Firebase sem build step separado.
 */
export async function GET() {
  const firebaseConfig = {
    apiKey: limparValorPublico(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) ?? "",
    authDomain: limparValorPublico(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ?? "",
    projectId: limparValorPublico(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) ?? "",
    storageBucket: limparValorPublico(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ?? "",
    messagingSenderId: limparValorPublico(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) ?? "",
    appId: limparValorPublico(process.env.NEXT_PUBLIC_FIREBASE_APP_ID) ?? "",
  };

  const body = `
// v2: a v1 guardava páginas e dados do /dashboard (dados pessoais). Trocar o nome faz o
// "activate" abaixo apagar a cache v1 nos aparelhos que já tinham o app instalado.
const CACHE_NAME = "classlink-shell-v2";
const APP_SHELL = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];
${FONTE_REGRAS_CACHE_SW}
// Pré-carrega o app-shell item a item, pelas mesmas regras do fetch abaixo. A falha de um
// item não impede a instalação (o service worker novo precisa entrar para apagar a v1).
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((caminho) =>
            fetch(caminho, { cache: "no-cache" })
              .then((response) => (respostaPodeIrParaCache(response) ? cache.put(caminho, response) : undefined))
              .catch(() => {}),
          ),
        ),
      )
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
      self.clients.claim(),
    ]),
  );
});

// Só arquivos estáticos e públicos passam por aqui (regras em requisicaoPodeIrParaCache):
// network-first — busca na rede e guarda uma cópia; sem rede, usa a cópia guardada.
// Páginas, dados de página (RSC), /dashboard e /api não são interceptados: a rede responde
// direto e nada disso é guardado no aparelho.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!requisicaoPodeIrParaCache(request, self.location.origin)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (respostaPodeIrParaCache(response)) {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((guardada) => guardada || Response.error())),
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
      // Sem cache HTTP: uma versão nova do service worker chega logo aos aparelhos.
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
