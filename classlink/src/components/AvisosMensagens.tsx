"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiJson } from "@/lib/api-client";

interface UltimaMensagem {
  id: string;
  remetente: string;
  texto: string;
  viaWhatsApp: boolean;
  url: string;
}

interface Resumo {
  total: number;
  familias: number;
  equipe: number;
  ultima: UltimaMensagem | null;
}

const MensagensNaoLidasContext = createContext<Resumo>({ total: 0, familias: 0, equipe: 0, ultima: null });

/** Quantidade de mensagens não lidas (famílias + equipe), para os contadores do menu. */
export function useMensagensNaoLidas() {
  return useContext(MensagensNaoLidasContext);
}

const INTERVALO_VISIVEL_MS = 15_000;
const INTERVALO_OCULTO_MS = 30_000;
const DISPENSOU_AVISOS_KEY = "classlink-avisos-mensagens-dispensado";

/** Bip curto gerado no navegador (sem arquivo de áudio). Falha em silêncio se o navegador bloquear. */
function tocarSom() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
    osc.onended = () => ctx.close();
  } catch {
    // sem som: o aviso visual continua
  }
}

async function mostrarNotificacao(msg: UltimaMensagem, total: number) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const titulo = `${msg.viaWhatsApp ? "WhatsApp" : "Mensagem"} de ${msg.remetente}`;
  const opcoes: NotificationOptions = {
    body: total > 1 ? `${msg.texto}\n(${total} mensagens não lidas)` : msg.texto,
    icon: "/icons/icon-192.png",
    tag: "classlink-mensagens", // substitui o aviso anterior em vez de empilhar
    data: { url: msg.url, origem: "classlink-aviso" },
  };
  try {
    // Pelo service worker (necessário no Android; o clique abre a conversa — ver sw.js).
    const registro = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registro) {
      await registro.showNotification(titulo, opcoes);
      return;
    }
  } catch {
    // tenta a API direta abaixo
  }
  const n = new Notification(titulo, opcoes);
  n.onclick = () => {
    window.focus();
    window.location.href = msg.url;
    n.close();
  };
}

/**
 * Acompanha as mensagens não lidas em todo o painel: contador no menu, número no título
 * da aba ("(2) ClassLink"), notificação do navegador com som quando a aba não está em
 * foco e um aviso na tela quando a mensagem chega em outra página. Funciona sem Firebase.
 */
export function AvisosMensagensProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [resumo, setResumo] = useState<Resumo>({ total: 0, familias: 0, equipe: 0, ultima: null });
  const [aviso, setAviso] = useState<UltimaMensagem | null>(null);
  const ultimaVista = useRef<string | null | undefined>(undefined); // undefined = ainda não carregou
  const tituloOriginal = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const verificar = useCallback(async () => {
    let dados: Resumo;
    try {
      dados = await apiJson<Resumo>("/api/notificacoes/mensagens");
    } catch {
      return; // sem conexão ou sessão expirada: tenta de novo no próximo ciclo
    }
    setResumo(dados);

    const idNova = dados.ultima?.id ?? null;
    const primeiraCarga = ultimaVista.current === undefined;
    const mudou = idNova !== null && idNova !== ultimaVista.current;
    ultimaVista.current = idNova;
    if (primeiraCarga || !mudou || !dados.ultima) return;

    // Mensagem nova. Se a pessoa já está olhando essa conversa, não precisa avisar.
    const naConversa = pathnameRef.current === dados.ultima.url.split("?")[0];
    if (naConversa && document.visibilityState === "visible") return;

    tocarSom();
    if (document.visibilityState === "visible") {
      setAviso(dados.ultima);
    } else {
      void mostrarNotificacao(dados.ultima, dados.total);
    }
  }, []);

  // Consulta periódica (mais espaçada com a aba em segundo plano) e ao voltar para a aba.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let ativo = true;
    const ciclo = async () => {
      await verificar();
      if (!ativo) return;
      timer = setTimeout(ciclo, document.visibilityState === "visible" ? INTERVALO_VISIVEL_MS : INTERVALO_OCULTO_MS);
    };
    void ciclo();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void verificar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      ativo = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [verificar]);

  // Ao trocar de página (ex.: abrir a conversa, que marca como lida), atualiza o contador.
  useEffect(() => {
    const t = setTimeout(() => void verificar(), 1500);
    return () => clearTimeout(t);
  }, [pathname, verificar]);

  // Número de não lidas no título da aba — visível mesmo com outra aba aberta.
  useEffect(() => {
    if (tituloOriginal.current === null) tituloOriginal.current = document.title.replace(/^\(\d+\)\s*/, "");
    const base = document.title.replace(/^\(\d+\)\s*/, "") || tituloOriginal.current;
    document.title = resumo.total > 0 ? `(${resumo.total}) ${base}` : base;
  }, [resumo.total, pathname]);

  // Aviso na tela some sozinho depois de alguns segundos.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 12_000);
    return () => clearTimeout(t);
  }, [aviso]);

  return (
    <MensagensNaoLidasContext.Provider value={resumo}>
      {children}

      {aviso && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-slate-900">
              {aviso.viaWhatsApp ? "💬 WhatsApp" : "✉️ Mensagem"} de {aviso.remetente}
            </p>
            <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className="text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>
          <p className="mt-1 line-clamp-2 text-slate-600">{aviso.texto}</p>
          <Link
            href={aviso.url}
            onClick={() => {
              setAviso(null);
              router.refresh();
            }}
            className="mt-2 inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Abrir conversa
          </Link>
        </div>
      )}
    </MensagensNaoLidasContext.Provider>
  );
}

/**
 * Convite para ativar as notificações do navegador (precisa de um clique da pessoa). Some
 * se ela já decidiu ou tocou em "Agora não". Sem permissão, o contador do menu, o número no
 * título da aba e o aviso na tela continuam funcionando.
 */
export function ConviteAtivarAvisos() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    try {
      if (localStorage.getItem(DISPENSOU_AVISOS_KEY)) return;
    } catch {
      // segue e mostra o convite
    }
    const t = setTimeout(() => setVisivel(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!visivel) return null;

  async function ativar() {
    setVisivel(false);
    try {
      const resultado = await Notification.requestPermission();
      if (resultado === "granted") tocarSom();
    } catch {
      // navegador sem suporte
    }
  }

  function dispensar() {
    setVisivel(false);
    try {
      localStorage.setItem(DISPENSOU_AVISOS_KEY, "1");
    } catch {
      // ignora
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
      <p>🔔 Ative os avisos para saber na hora quando chegar uma mensagem, mesmo com o ClassLink em outra aba.</p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={ativar}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Ativar avisos
        </button>
        <button type="button" onClick={dispensar} className="rounded-md px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100">
          Agora não
        </button>
      </div>
    </div>
  );
}
