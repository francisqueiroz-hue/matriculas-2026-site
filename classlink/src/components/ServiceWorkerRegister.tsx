"use client";

import { useEffect } from "react";
// Configura o Zod sem o teste de eval antes de qualquer tela validar dados (ver zod-sem-eval).
import "@/lib/zod-sem-eval";

/** Registra o service worker de app-shell (cache offline mínimo) em qualquer página. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sem service worker o app funciona normalmente; só não há instalação/offline.
      });
    }
  }, []);

  return null;
}
