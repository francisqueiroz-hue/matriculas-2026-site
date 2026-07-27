"use client";

import { useEffect } from "react";

/** Registra o service worker de app-shell (cache offline mínimo) em qualquer página. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
