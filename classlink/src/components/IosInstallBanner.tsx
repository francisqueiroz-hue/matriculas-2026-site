"use client";

import { useEffect, useState } from "react";
import { shouldShowIosInstallBanner } from "@/lib/device";

const DISMISS_KEY = "classlink-ios-install-dismissed";

/**
 * No iPhone/iPad, notificações push do ClassLink só chegam depois que a pessoa
 * "Adiciona à Tela de Início" o site (restrição do próprio iOS, não do nosso
 * código). Este aviso aparece só nesse cenário — iOS, ainda pelo navegador — e
 * fica escondido pra sempre naquele aparelho assim que a pessoa fechar.
 */
export function IosInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const nav = window.navigator as Navigator & { standalone?: boolean };
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;

    setVisible(shouldShowIosInstallBanner(navigator.userAgent, isStandalone));
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p>
        📲 Para receber avisos do ClassLink no seu iPhone, toque no ícone de{" "}
        <strong>Compartilhar</strong> do Safari e depois em{" "}
        <strong>&quot;Adicionar à Tela de Início&quot;</strong>. Depois disso, abra o ClassLink por
        esse ícone (não mais pelo navegador) para as notificações funcionarem.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar aviso"
        className="shrink-0 rounded-md px-2 py-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
      >
        ✕
      </button>
    </div>
  );
}
