"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { requestPushToken } from "@/lib/firebase-client";
import { isIosDevice } from "@/lib/device";

type Estado = "carregando" | "instalar-iphone" | "sem-suporte" | "bloqueado" | "pendente" | "ativo";

interface ResultadoTeste {
  ok: boolean;
  motivo?: string;
  aparelhos?: number;
  enviados?: number;
  erros?: string[];
}

function estadoAtual(): Estado {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const instalado = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  if (isIosDevice(navigator.userAgent) && !instalado) return "instalar-iphone";
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) return "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  return Notification.permission === "granted" ? "ativo" : "pendente";
}

/**
 * Notificações neste aparelho: mostra o que falta (instalar no iPhone, permitir, desbloquear
 * nos Ajustes) e um botão de teste, que registra o aparelho e manda uma notificação de verdade.
 */
export function NotificacoesAparelho() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const iphone = typeof navigator !== "undefined" && isIosDevice(navigator.userAgent);

  useEffect(() => {
    // Depende de APIs do navegador: só dá para saber depois da montagem.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado(estadoAtual());
  }, []);

  async function registrarETestar() {
    setEnviando(true);
    setMensagem(null);
    try {
      const token = await requestPushToken(false);
      if (!token) {
        setMensagem({ tipo: "erro", texto: "As notificações deste app ainda não estão configuradas neste navegador. Feche e abra o ClassLink e tente de novo." });
        return;
      }
      try {
        await apiJson("/api/push/register", { method: "POST", body: JSON.stringify({ token }) });
      } catch (err) {
        throw new Error(`Salvar o aparelho — ${err instanceof Error ? err.message : String(err)}`);
      }
      const r = await apiJson<ResultadoTeste>("/api/push/teste", { method: "POST" }).catch((err: unknown) => {
        throw new Error(`Envio de teste — ${err instanceof Error ? err.message : String(err)}`);
      });
      if (r.ok) {
        setMensagem({
          tipo: "ok",
          texto: iphone
            ? "Notificação enviada! Para ver como chega, saia do ClassLink (volte à tela inicial) e aguarde alguns segundos."
            : "Notificação enviada! Ela deve aparecer em alguns segundos.",
        });
      } else {
        setMensagem({ tipo: "erro", texto: r.motivo ?? `O envio falhou${r.erros?.length ? ` (${r.erros.join(", ")})` : ""}.` });
      }
    } catch (err) {
      // Mostra a etapa e o erro técnico: é o que permite descobrir o problema no aparelho da pessoa.
      const detalhe = err instanceof Error ? (err.name === "ErroPush" || err.message.includes(" — ") ? err.message : `${err.name}: ${err.message}`) : String(err);
      setMensagem({ tipo: "erro", texto: `Não deu certo. Detalhe para o suporte: ${detalhe}` });
    } finally {
      setEnviando(false);
    }
  }

  async function ativar() {
    // O pedido de permissão precisa ser a primeira coisa do toque (exigência do iPhone).
    const resultado = await Notification.requestPermission();
    setEstado(estadoAtual());
    if (resultado === "granted") await registrarETestar();
  }

  if (estado === "carregando") return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">Notificações neste aparelho</h2>

      {estado === "instalar-iphone" && (
        <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <p>No iPhone, as notificações só funcionam com o ClassLink instalado na tela de início:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Abra o ClassLink no <strong>Safari</strong> e toque em <strong>Compartilhar</strong> (quadrado com seta).
            </li>
            <li>
              Toque em <strong>&quot;Adicionar à Tela de Início&quot;</strong>.
            </li>
            <li>
              Abra o ClassLink <strong>pelo ícone</strong> e volte a esta página (Minha conta) para ativar.
            </li>
          </ol>
        </div>
      )}

      {estado === "sem-suporte" && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Este navegador não aceita notificações. No celular, use o ClassLink instalado na tela de início (iPhone com
          iOS 16.4 ou mais recente) ou o Chrome no Android.
        </p>
      )}

      {estado === "bloqueado" && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          As notificações foram bloqueadas neste aparelho.{" "}
          {iphone ? (
            <>
              Para liberar, abra <strong>Ajustes → Notificações → ClassLink</strong> e ative{" "}
              <strong>Permitir Notificações</strong>.
            </>
          ) : (
            <>Para liberar, toque no cadeado ao lado do endereço do site e permita as notificações.</>
          )}
        </p>
      )}

      {estado === "pendente" && (
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          <p>Receba um aviso no celular quando chegar mensagem ou comunicado, mesmo com o ClassLink fechado.</p>
          <button
            type="button"
            onClick={ativar}
            disabled={enviando}
            className="mt-3 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            🔔 Ativar notificações
          </button>
        </div>
      )}

      {estado === "ativo" && (
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          <p>✅ Notificações permitidas neste aparelho.</p>
          <button
            type="button"
            onClick={registrarETestar}
            disabled={enviando}
            className="mt-3 rounded-md border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            {enviando ? "Enviando…" : "Enviar notificação de teste"}
          </button>
        </div>
      )}

      {mensagem && (
        <p role="status" className={`mt-2 text-sm ${mensagem.tipo === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
