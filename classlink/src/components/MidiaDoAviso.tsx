"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Anexo de um aviso do Mural: foto, vídeo ou PDF (páginas convertidas em imagem).
 * A imagem ocupa a largura do cartão (sem cortes nem faixas cinzas); vertical (circular, cartaz)
 * fica limitada a uma largura confortável de leitura no computador. Tocar amplia em tela cheia,
 * dentro do app (no PWA do iPhone uma nova aba não tem botão de voltar).
 */

/** Quantas páginas do PDF aparecem no cartão antes de "Ver as outras páginas". */
export const PAGINAS_VISIVEIS = 2;

export interface MidiaDoAvisoProps {
  titulo: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaPaginas?: string[];
  mediaNome?: string | null;
}

/** Texto alternativo de cada imagem do aviso. */
export function textoAlternativo(titulo: string, tipo: string | null, pagina: number, total: number): string {
  if (tipo === "pdf") return `Página ${pagina} de ${total} do documento do aviso: ${titulo}`;
  return `Foto do aviso: ${titulo}`;
}

function ImagemDoCartao({ src, alt, onAbrir }: { src: string; alt: string; onAbrir: () => void }) {
  const [vertical, setVertical] = useState(false);
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`${alt}. Toque para ampliar`}
      className={`group relative mx-auto mt-3 block w-full cursor-zoom-in overflow-hidden rounded-lg ${vertical ? "sm:max-w-3xl" : ""} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600`}
    >
      {/* URL assinada e temporária: o otimizador do Next não a reaproveita. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        onLoad={(e) => setVertical(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth)}
        className="block h-auto w-full rounded-lg"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white opacity-90 group-hover:opacity-100"
      >
        🔍 Ampliar
      </span>
    </button>
  );
}

function Ampliacao({
  imagens,
  inicial,
  titulo,
  tipo,
  onFechar,
}: {
  imagens: string[];
  inicial: number;
  titulo: string;
  tipo: string | null;
  onFechar: () => void;
}) {
  const [atual, setAtual] = useState(inicial);
  const [zoom, setZoom] = useState(false);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const total = imagens.length;

  const ir = useCallback(
    (delta: number) => {
      setZoom(false);
      setAtual((a) => Math.min(total - 1, Math.max(0, a + delta)));
    },
    [total],
  );

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    fecharRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
      else if (e.key === "ArrowRight") ir(1);
      else if (e.key === "ArrowLeft") ir(-1);
    }
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, [onFechar, ir]);

  const alt = textoAlternativo(titulo, tipo, atual + 1, total);
  const botao =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/15 px-3 text-sm font-semibold text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30";

  return (
    <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="flex items-center justify-between gap-2 p-2 text-white">
        <span className="px-2 text-sm" aria-live="polite">
          {total > 1 ? `Página ${atual + 1} de ${total}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoom((z) => !z)} className={botao} aria-pressed={zoom}>
            {zoom ? "Ajustar à tela" : "Tamanho real"}
          </button>
          <a href={imagens[atual]} target="_blank" rel="noopener noreferrer" className={botao}>
            Abrir
          </a>
          <button ref={fecharRef} type="button" onClick={onFechar} className={botao} aria-label="Fechar">
            ✕
          </button>
        </div>
      </div>

      <div className={`relative flex-1 ${zoom ? "overflow-auto" : "flex items-center justify-center overflow-hidden"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagens[atual]}
          alt={alt}
          onClick={() => setZoom((z) => !z)}
          className={zoom ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"}
        />
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center gap-4 p-3">
          <button type="button" onClick={() => ir(-1)} disabled={atual === 0} className={botao} aria-label="Página anterior">
            ‹ Anterior
          </button>
          <button type="button" onClick={() => ir(1)} disabled={atual === total - 1} className={botao} aria-label="Próxima página">
            Próxima ›
          </button>
        </div>
      )}
    </div>
  );
}

export function MidiaDoAviso({ titulo, mediaUrl, mediaType, mediaPaginas, mediaNome }: MidiaDoAvisoProps) {
  const [aberta, setAberta] = useState<number | null>(null);
  const [todas, setTodas] = useState(false);
  const fechar = useCallback(() => setAberta(null), []);

  if (!mediaUrl) return null;

  if (mediaType === "video") {
    return (
      <video
        src={mediaUrl}
        controls
        playsInline
        preload="metadata"
        aria-label={`Vídeo do aviso: ${titulo}`}
        className="mt-3 max-h-[80vh] w-full rounded-lg bg-black object-contain"
      >
        Seu aparelho não conseguiu reproduzir o vídeo.{" "}
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
          Abrir o vídeo
        </a>
      </video>
    );
  }

  const imagens = mediaType === "pdf" ? (mediaPaginas?.length ? mediaPaginas : [mediaUrl]) : mediaType === "image" ? [mediaUrl] : [];
  if (imagens.length === 0) return null;
  const total = imagens.length;
  const visiveis = todas ? imagens : imagens.slice(0, PAGINAS_VISIVEIS);

  return (
    <div>
      {mediaType === "pdf" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span aria-hidden="true">📄</span>
          {mediaNome ? `${mediaNome} · ` : "Documento · "}
          {total === 1 ? "1 página" : `${total} páginas`}
        </p>
      )}
      {visiveis.map((src, i) => (
        <ImagemDoCartao key={src} src={src} alt={textoAlternativo(titulo, mediaType, i + 1, total)} onAbrir={() => setAberta(i)} />
      ))}
      {total > PAGINAS_VISIVEIS && (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          aria-expanded={todas}
          className="mt-2 text-sm font-medium text-indigo-600 hover:underline"
        >
          {todas ? "Mostrar menos páginas" : `Ver as outras ${total - PAGINAS_VISIVEIS} páginas`}
        </button>
      )}
      {aberta !== null && <Ampliacao imagens={imagens} inicial={aberta} titulo={titulo} tipo={mediaType} onFechar={fechar} />}
    </div>
  );
}
