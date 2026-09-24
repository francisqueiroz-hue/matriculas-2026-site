"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

interface Diagnostico {
  push: { navegador: boolean; chaveVapid: boolean; servidor: boolean; dispositivosRegistrados: number };
  whatsapp: {
    api: boolean;
    webhookAssinatura: boolean;
    webhookVerificacao: boolean;
    modeloAcesso: string | null;
    modeloAviso: string | null;
    equipeComAvisoWhatsApp: number;
  };
}

function Item({ ok, titulo, dica }: { ok: boolean; titulo: string; dica: string }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true">{ok ? "✅" : "⚠️"}</span>
      <span>
        <span className="font-medium">{titulo}</span>
        {!ok && <span className="block text-xs text-slate-500">{dica}</span>}
      </span>
    </li>
  );
}

/** Quadro "o que está configurado" para os avisos — sem mostrar nenhum segredo. */
export function DiagnosticoAvisos() {
  const [d, setD] = useState<Diagnostico | null>(null);

  useEffect(() => {
    apiJson<Diagnostico>("/api/admin/diagnostico").then(setD).catch(() => setD(null));
  }, []);

  if (!d) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="font-semibold">Configuração dos avisos</h2>
      <p className="mt-1 text-xs text-slate-500">
        Confere as variáveis cadastradas na Vercel (sem mostrar valores). Depois de alterar alguma, faça um novo deploy.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Push (navegador fechado / celular)</h3>
          <ul className="space-y-1.5">
            <Item ok={d.push.navegador} titulo="Firebase no navegador" dica="Preencha as variáveis NEXT_PUBLIC_FIREBASE_* (README, passo 2)." />
            <Item ok={d.push.chaveVapid} titulo="Chave VAPID" dica="Preencha NEXT_PUBLIC_FIREBASE_VAPID_KEY (README, passo 3)." />
            <Item ok={d.push.servidor} titulo="Conta de serviço do Firebase" dica="Preencha FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY (README, passo 5)." />
            <li className="text-xs text-slate-500">Dispositivos registrados para push: {d.push.dispositivosRegistrados}</li>
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">WhatsApp</h3>
          <ul className="space-y-1.5">
            <Item ok={d.whatsapp.api} titulo="API do WhatsApp" dica="Preencha WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID." />
            <Item
              ok={d.whatsapp.webhookAssinatura && d.whatsapp.webhookVerificacao}
              titulo="Webhook (receber mensagens)"
              dica="Preencha WHATSAPP_APP_SECRET e WHATSAPP_VERIFY_TOKEN e cadastre o webhook na Meta."
            />
            <Item
              ok={Boolean(d.whatsapp.modeloAcesso)}
              titulo={`Modelo de acesso${d.whatsapp.modeloAcesso ? `: ${d.whatsapp.modeloAcesso}` : ""}`}
              dica="Opcional: WHATSAPP_TEMPLATE_ACESSO permite enviar senhas em lote. O pedido por “ACESSO” funciona sem ele."
            />
            <Item
              ok={Boolean(d.whatsapp.modeloAviso)}
              titulo={`Modelo de aviso à equipe${d.whatsapp.modeloAviso ? `: ${d.whatsapp.modeloAviso}` : ""}`}
              dica="Crie e aprove o modelo de aviso e preencha WHATSAPP_TEMPLATE_AVISO (README)."
            />
            <li className="text-xs text-slate-500">Pessoas da equipe com aviso no WhatsApp ativado: {d.whatsapp.equipeComAvisoWhatsApp}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
