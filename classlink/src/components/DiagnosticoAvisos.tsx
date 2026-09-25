"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

interface Diagnostico {
  push: { navegador: boolean; chaveVapid: boolean; servidor: boolean; servidorErro: string | null; dispositivosRegistrados: number };
  whatsapp: {
    api: boolean;
    webhookAssinatura: boolean;
    webhookVerificacao: boolean;
    modeloAcesso: string | null;
    contaBusiness: boolean;
    modelos: { convite: StatusModelo; aviso: StatusModelo };
    equipeComAvisoWhatsApp: number;
  };
}

interface StatusModelo {
  tipo: "convite" | "aviso";
  nome: string;
  status: string;
  motivo?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "aprovado",
  PENDING: "em análise na Meta",
  REJECTED: "recusado pela Meta",
  PAUSED: "pausado pela Meta",
  DISABLED: "desativado pela Meta",
  NAO_CADASTRADO: "ainda não cadastrado",
  DESCONHECIDO: "situação desconhecida",
};

const MODELO_TITULO = { convite: "Modelo de convite (envio do acesso)", aviso: "Modelo de aviso à equipe" };

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
  const [erro, setErro] = useState<string | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [retorno, setRetorno] = useState<string | null>(null);

  const carregar = useCallback(() => {
    apiJson<Diagnostico>("/api/admin/diagnostico")
      .then((dados) => {
        setD(dados);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Falha ao carregar"));
  }, []);

  useEffect(carregar, [carregar]);

  async function cadastrarModelos() {
    setCadastrando(true);
    setRetorno(null);
    try {
      const res = await apiJson<{ modelos: StatusModelo[] }>("/api/admin/whatsapp/modelos", { method: "POST" });
      setRetorno(
        res.modelos
          .map((m) => `${m.nome}: ${STATUS_LABEL[m.status] ?? m.status}${m.motivo ? ` (${m.motivo})` : ""}`)
          .join(" · "),
      );
      carregar();
    } catch (err) {
      setRetorno(err instanceof Error ? err.message : "Falha ao cadastrar os modelos");
    } finally {
      setCadastrando(false);
    }
  }

  if (!d) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">Configuração dos avisos</h2>
        {erro ? (
          <p className="mt-1 text-red-600">
            Não foi possível conferir a configuração ({erro}).{" "}
            <button type="button" onClick={carregar} className="font-semibold underline">
              Tentar de novo
            </button>
          </p>
        ) : (
          <p className="mt-1 text-slate-500">Conferindo...</p>
        )}
      </section>
    );
  }
  const modelos = [d.whatsapp.modelos.convite, d.whatsapp.modelos.aviso];
  const faltaCadastrar = modelos.some((m) => m.status === "NAO_CADASTRADO" || m.status === "DESCONHECIDO");

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
            <Item
              ok={d.push.servidor}
              titulo="Conta de serviço do Firebase"
              dica={
                d.push.servidorErro
                  ? `As variáveis estão preenchidas, mas a chave foi recusada (${d.push.servidorErro}). Cole de novo o valor de "private_key" do arquivo JSON inteiro, de -----BEGIN PRIVATE KEY----- até -----END PRIVATE KEY-----, sem aspas.`
                  : "Preencha FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY (README, passo 5)."
              }
            />
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
              ok={d.whatsapp.contaBusiness}
              titulo="ID da conta do WhatsApp Business"
              dica="Preencha WHATSAPP_BUSINESS_ACCOUNT_ID (Meta for Developers → WhatsApp → Configuração da API) para o ClassLink cadastrar e acompanhar os modelos."
            />
            {modelos.map((m) => (
              <Item
                key={m.tipo}
                ok={m.status === "APPROVED"}
                titulo={`${MODELO_TITULO[m.tipo]}: ${STATUS_LABEL[m.status] ?? m.status}`}
                dica={
                  m.status === "PENDING"
                    ? "A Meta está analisando; costuma levar de minutos a algumas horas. Enquanto isso, só quem escreveu para a escola nas últimas 24h recebe."
                    : m.status === "REJECTED"
                      ? `Motivo: ${m.motivo ?? "não informado"}.`
                      : `Cadastre pelo botão abaixo (nome: ${m.nome}).`
                }
              />
            ))}
            <li className="text-xs text-slate-500">Pessoas da equipe com aviso no WhatsApp ativado: {d.whatsapp.equipeComAvisoWhatsApp}</li>
          </ul>
          {d.whatsapp.api && d.whatsapp.contaBusiness && faltaCadastrar && (
            <button
              type="button"
              disabled={cadastrando}
              onClick={cadastrarModelos}
              className="mt-3 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {cadastrando ? "Cadastrando..." : "Cadastrar modelos na Meta"}
            </button>
          )}
          {retorno && <p className="mt-2 text-xs text-slate-600">{retorno}</p>}
        </div>
      </div>
    </section>
  );
}
