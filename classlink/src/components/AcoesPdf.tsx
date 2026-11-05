"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  PdfErro,
  abrirArquivo,
  compartilharArquivo,
  obterPdf,
  podeCompartilharArquivos,
  salvarArquivo,
} from "@/lib/pdf-client";

interface Props {
  /** Rota autenticada do PDF (sem ?download). */
  url: string;
  /** Nome do arquivo salvo/compartilhado. */
  nome: string;
  /** Baixa o PDF assim que a tela abre: no celular, compartilhar só funciona logo após o toque. */
  carregarAntes?: boolean;
  rotuloBaixar?: string;
  rotuloAbrir?: string | null;
  rotuloCompartilhar?: string;
  /** Título e texto que acompanham o arquivo no menu de compartilhar (WhatsApp, e-mail…). */
  tituloCompartilhar: string;
  textoCompartilhar?: string;
  classePrimario: string;
  classeSecundario: string;
  /** Botões extras que ficam na mesma linha (ex.: "Preencher meus dados"). */
  children?: React.ReactNode;
}

type Acao = "baixar" | "abrir" | "compartilhar";

const semAssinatura = () => () => undefined;

/**
 * Botões para baixar, abrir e compartilhar um PDF privado. O PDF vem pela sessão do app
 * (fetch com renovação automática), nunca por link direto — ver src/lib/pdf-client.ts.
 */
export function AcoesPdf({
  url,
  nome,
  carregarAntes = false,
  rotuloBaixar = "Baixar PDF",
  rotuloAbrir = "Abrir PDF",
  rotuloCompartilhar = "Enviar PDF (WhatsApp, e-mail…)",
  tituloCompartilhar,
  textoCompartilhar,
  classePrimario,
  classeSecundario,
  children,
}: Props) {
  // O arquivo guardado vale só para este endereço: se o contrato for gerado de novo, o endereço muda.
  const [guardado, setGuardado] = useState<{ url: string; arquivo: File } | null>(null);
  const arquivo = guardado?.url === url ? guardado.arquivo : null;
  const [ocupado, setOcupado] = useState<Acao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Só no navegador; no HTML do servidor o botão de compartilhar não aparece.
  const compartilhavel = useSyncExternalStore(semAssinatura, podeCompartilharArquivos, () => false);
  const pedido = useRef<{ url: string; promessa: Promise<File> } | null>(null);

  const obter = useCallback(() => {
    if (pedido.current?.url !== url) {
      const promessa = obterPdf(url, nome).then(
        (f) => {
          setGuardado({ url, arquivo: f });
          return f;
        },
        (e: unknown) => {
          if (pedido.current?.promessa === promessa) pedido.current = null; // permite tentar de novo
          throw e;
        },
      );
      pedido.current = { url, promessa };
    }
    return pedido.current.promessa;
  }, [url, nome]);

  useEffect(() => {
    if (carregarAntes) obter().catch(() => undefined); // o erro aparece quando a pessoa tocar
  }, [carregarAntes, obter]);

  async function executar(acao: Acao) {
    setErro(null);
    setAviso(null);
    // Com o arquivo já em mãos, tudo acontece no mesmo toque (exigência do Safari).
    let f = arquivo;
    if (!f) {
      setOcupado(acao);
      try {
        f = await obter();
      } catch (e) {
        setErro(e instanceof PdfErro ? e.message : "Não foi possível baixar o PDF. Tente de novo.");
        setOcupado(null);
        return;
      }
    }
    try {
      if (acao === "baixar") {
        salvarArquivo(f);
      } else if (acao === "abrir") {
        if (!abrirArquivo(f)) {
          salvarArquivo(f);
          setAviso("O navegador não abriu uma aba nova, então o PDF foi baixado.");
        }
      } else {
        const r = await compartilharArquivo(f, tituloCompartilhar, textoCompartilhar);
        if (r === "toque-de-novo") setAviso("PDF pronto. Toque de novo em “" + rotuloCompartilhar + "” para escolher onde enviar.");
      }
    } catch (e) {
      setErro(e instanceof PdfErro ? e.message : "Não foi possível concluir. Tente “" + rotuloBaixar + "”.");
    } finally {
      setOcupado(null);
    }
  }

  const carregando = (a: Acao) => (ocupado === a ? "Preparando PDF…" : null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => executar("baixar")} disabled={ocupado !== null} className={classePrimario}>
          {carregando("baixar") ?? rotuloBaixar}
        </button>
        {compartilhavel && (
          <button type="button" onClick={() => executar("compartilhar")} disabled={ocupado !== null} className={classeSecundario}>
            {carregando("compartilhar") ?? rotuloCompartilhar}
          </button>
        )}
        {rotuloAbrir && (
          <button type="button" onClick={() => executar("abrir")} disabled={ocupado !== null} className={classeSecundario}>
            {carregando("abrir") ?? rotuloAbrir}
          </button>
        )}
        {children}
      </div>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
          {aviso}
        </p>
      )}
    </div>
  );
}
