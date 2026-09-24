"use client";

import { useEffect } from "react";
import { requestPushToken } from "@/lib/firebase-client";
import { apiFetch } from "@/lib/api-client";

/**
 * Registra silenciosamente o token de push do dispositivo quando a permissão de
 * notificação já foi dada (o pedido em si parte do botão "Ativar avisos"), se o
 * navegador suportar e o Firebase estiver configurado. Roda a cada abertura do painel
 * para manter o token atualizado no servidor.
 */
export function PushRegister() {
  useEffect(() => {
    requestPushToken(false)
      .then((token) => {
        if (!token) return;
        return apiFetch("/api/push/register", { method: "POST", body: JSON.stringify({ token }) });
      })
      .catch(() => {
        // notificações são um extra; falha silenciosa não deve afetar o uso do app
      });
  }, []);

  return null;
}
