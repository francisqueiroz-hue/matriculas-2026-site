"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "classlink-android-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * No Android/Chrome (e navegadores baseados em Chromium), o navegador dispara o
 * evento "beforeinstallprompt" quando o PWA pode ser instalado. Guardamos esse
 * evento e oferecemos um botão que chama o instalador nativo do próprio
 * navegador — diferente do iOS, aqui dá pra instalar com um toque, sem passo a
 * passo manual. O evento só dispara quando o app ainda não está instalado, então
 * o banner já some sozinho depois disso.
 */
export function AndroidInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || localStorage.getItem(DISMISS_KEY)) return;

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      localStorage.setItem(DISMISS_KEY, "1");
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferredPrompt) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstalling(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDeferredPrompt(null);
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
      <p>📲 Instale o ClassLink na tela do seu celular pra abrir mais rápido e não perder os avisos.</p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {installing ? "Instalando..." : "Instalar"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar aviso"
          className="rounded-md px-2 py-1 text-indigo-700 hover:bg-indigo-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
