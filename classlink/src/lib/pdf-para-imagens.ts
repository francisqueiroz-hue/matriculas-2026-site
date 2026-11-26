"use client";

import { MAX_BYTES_PDF, MAX_PAGINAS_PDF } from "@/lib/midia-aviso";

/**
 * Converte um PDF em imagens JPEG (uma por página) no próprio navegador, com o pdf.js.
 * O Mural mostra as páginas como fotos: abre rápido no celular, sem leitor de PDF.
 * O PDF original não sai do aparelho; só as imagens são enviadas (e conferidas no servidor).
 */

/** Largura alvo da página convertida: nítida para ler no celular e ampliar, sem pesar demais. */
const LARGURA_ALVO = 1600;
/** Limite de pixels por página (o Safari do iPhone recusa canvas muito grandes). */
const MAX_PIXELS = 1600 * 2600;

/** Escala de renderização para a página (largura/altura em pontos do PDF). */
export function escalaDaPagina(largura: number, altura: number): number {
  if (!(largura > 0) || !(altura > 0)) return 1;
  let escala = LARGURA_ALVO / largura;
  if (largura * altura * escala * escala > MAX_PIXELS) escala = Math.sqrt(MAX_PIXELS / (largura * altura));
  return Math.min(escala, 4);
}

/** Mensagem clara para a equipe quando o PDF não pode ser convertido. */
export function mensagemErroPdf(err: unknown): string {
  const nome = (err as { name?: string })?.name;
  if (nome === "PasswordException") return "Este PDF tem senha. Salve uma cópia sem senha e anexe de novo.";
  if (nome === "InvalidPDFException") return "O arquivo não é um PDF válido ou está corrompido. Gere o PDF de novo e anexe.";
  if (err instanceof Error && err.message.startsWith("O PDF")) return err.message;
  return "Não foi possível converter o PDF em imagem neste aparelho. Tente de novo ou envie as páginas como foto.";
}

export function nomeDaPagina(nomePdf: string, pagina: number): string {
  const base = nomePdf.replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "documento";
  return `${base}-pagina-${pagina}.jpg`;
}

function canvasParaJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem da página."))), "image/jpeg", 0.85),
  );
}

export async function converterPdfEmImagens(
  arquivo: File,
  aoProgredir?: (pagina: number, total: number) => void,
): Promise<File[]> {
  if (arquivo.size > MAX_BYTES_PDF) {
    throw new Error(`O PDF passa de ${MAX_BYTES_PDF / 1024 / 1024} MB. Reduza o arquivo e anexe de novo.`);
  }
  // Carregado só quando alguém anexa um PDF: não pesa na abertura do Mural.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

  const tarefa = pdfjs.getDocument({
    data: new Uint8Array(await arquivo.arrayBuffer()),
    wasmUrl: "/pdfjs/wasm/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    iccUrl: "/pdfjs/iccs/",
    enableXfa: false,
    // Sem WebAssembly: a CSP do app não libera compilar wasm. Imagens JPEG2000/JBIG2 (PDF
    // escaneado) usam a versão em JavaScript dos decodificadores, servida pelo próprio app.
    useWasm: false,
  });
  const doc = await tarefa.promise;
  try {
    if (doc.numPages > MAX_PAGINAS_PDF) {
      throw new Error(
        `O PDF tem ${doc.numPages} páginas e o limite do Mural é ${MAX_PAGINAS_PDF}. Divida o arquivo ou envie só as páginas principais.`,
      );
    }
    const imagens: File[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      aoProgredir?.(n, doc.numPages);
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: escalaDaPagina(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Falha ao preparar a imagem da página.");
      // Fundo branco: páginas sem fundo ficariam pretas no JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise;
      const blob = await canvasParaJpeg(canvas);
      imagens.push(new File([blob], nomeDaPagina(arquivo.name, n), { type: "image/jpeg" }));
      pagina.cleanup();
      canvas.width = canvas.height = 0; // libera a memória do canvas (importante no iPhone)
    }
    return imagens;
  } finally {
    await tarefa.destroy();
  }
}
