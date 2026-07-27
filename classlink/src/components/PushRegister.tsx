"use client";

import { useEffect } from "react";
import { requestPushToken } from "@/lib/firebase-client";
import { apiFetch } from "@/lib/api-client";

/** Registra silenciosamente o token de push do dispositivo, se o navegador suportar e o Firebase estiver configurado. */
export function PushRegister() {
  useEffect(() => {
    requestPushToken()
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
