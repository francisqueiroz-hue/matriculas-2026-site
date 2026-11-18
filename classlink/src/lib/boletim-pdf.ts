import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { TRIMESTRES, TRIMESTRE_LABEL } from "@/lib/notas";
import type { LinhaBoletim } from "@/lib/boletim";

/**
 * Boletim em PDF para impressão (A4 em pé, uma página por aluno). Gerado no servidor só para a
 * direção e a coordenação; famílias e professores consultam no app, sem exportar.
 */

export interface BoletimParaImpressao {
  aluno: string;
  turma: string;
  linhas: LinhaBoletim[];
}

const SITUACAO: Record<LinhaBoletim["situacao"], string> = {
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  EM_ANDAMENTO: "Em andamento",
};

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 40;
const CINZA = rgb(0.4, 0.45, 0.5);
const LINHA = rgb(0.8, 0.82, 0.85);

/** Troca o que as fontes padrão (WinAnsi) não desenham (ex.: emoji) por "?". */
function limpar(texto: string, fonte: PDFFont): string {
  let saida = "";
  for (const ch of texto.normalize("NFC")) {
    try {
      fonte.encodeText(ch);
      saida += ch;
    } catch {
      saida += "?";
    }
  }
  return saida;
}

/** Corta o texto com reticências para caber na largura. */
function caber(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}…`, tamanho) > largura) t = t.slice(0, -1);
  return `${t}…`;
}

export function formatarNota(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function desenharPagina(
  page: PDFPage,
  fontes: { normal: PDFFont; negrito: PDFFont },
  dados: { escola: string; ano: number; emitidoEm: string },
  b: BoletimParaImpressao,
) {
  const { normal, negrito } = fontes;
  const largura = A4[0] - 2 * MARGEM;
  let y = A4[1] - MARGEM;

  const texto = (t: string, x: number, yy: number, tamanho: number, fonte = normal, cor = rgb(0, 0, 0)) =>
    page.drawText(limpar(t, fonte), { x, y: yy, size: tamanho, font: fonte, color: cor });

  texto(caber(limpar(dados.escola, negrito), negrito, 14, largura), MARGEM, y - 14, 14, negrito);
  y -= 32;
  texto(`Boletim escolar — ${dados.ano}`, MARGEM, y, 12, negrito);
  y -= 22;
  texto(`Aluno(a): ${caber(limpar(b.aluno, normal), normal, 11, largura - 60)}`, MARGEM, y, 11);
  y -= 16;
  texto(`Turma: ${caber(limpar(b.turma, normal), normal, 11, largura - 60)}`, MARGEM, y, 11);
  y -= 24;

  // Colunas: Disciplina | 1º | 2º | 3º | Média final | Situação
  const colDisc = 170;
  const colTri = 62;
  const colFinal = 70;
  const xs = [MARGEM, MARGEM + colDisc, MARGEM + colDisc + colTri, MARGEM + colDisc + 2 * colTri, MARGEM + colDisc + 3 * colTri, MARGEM + colDisc + 3 * colTri + colFinal];
  const titulos = ["Disciplina", ...TRIMESTRES.map((t) => TRIMESTRE_LABEL[t].replace(" Trimestre", " Trim.")), "Média final", "Situação"];
  const alturaLinha = 20;

  page.drawRectangle({ x: MARGEM, y: y - 6, width: largura, height: alturaLinha, color: rgb(0.93, 0.94, 0.96) });
  titulos.forEach((t, i) => texto(t, xs[i] + 4, y, 9, negrito));
  y -= alturaLinha;

  const linhas = b.linhas.length ? b.linhas : null;
  if (!linhas) {
    texto("Nenhuma nota lançada ainda.", MARGEM + 4, y, 10, normal, CINZA);
    y -= alturaLinha;
  } else {
    for (const l of linhas) {
      if (y < MARGEM + 120) break; // proteção: muitas disciplinas não saem da página
      texto(caber(limpar(l.nome, normal), normal, 10, colDisc - 8), xs[0] + 4, y, 10);
      TRIMESTRES.forEach((t, i) => texto(formatarNota(l.trimestres[t].media), xs[i + 1] + 4, y, 10));
      texto(formatarNota(l.mediaFinal), xs[4] + 4, y, 10, negrito);
      texto(SITUACAO[l.situacao], xs[5] + 4, y, 10);
      page.drawLine({ start: { x: MARGEM, y: y - 6 }, end: { x: MARGEM + largura, y: y - 6 }, thickness: 0.5, color: LINHA });
      y -= alturaLinha;
    }
  }

  y -= 10;
  texto("Média do trimestre: trabalho (peso 3), teste (peso 7) e prova (peso 10). Aprovação com média final 6,0.", MARGEM, y, 8, normal, CINZA);
  y -= 12;
  texto(`Emitido em ${dados.emitidoEm}.`, MARGEM, y, 8, normal, CINZA);

  // Assinaturas
  const yAss = MARGEM + 50;
  const larguraAss = (largura - 40) / 2;
  for (const [i, rotulo] of ["Direção", "Coordenação pedagógica"].entries()) {
    const x = MARGEM + i * (larguraAss + 40);
    page.drawLine({ start: { x, y: yAss }, end: { x: x + larguraAss, y: yAss }, thickness: 0.7, color: rgb(0, 0, 0) });
    texto(rotulo, x, yAss - 14, 9, normal, CINZA);
  }
}

/** Um PDF com uma página por aluno (o boletim individual é uma lista de um). */
export async function gerarBoletimPdf(dados: { escola: string; ano: number; agora?: Date }, boletins: BoletimParaImpressao[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(boletins.length === 1 ? `Boletim ${dados.ano} - ${boletins[0].aluno}` : `Boletins ${dados.ano}`);
  pdf.setCreator("ClassLink");
  const fontes = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const emitidoEm = (dados.agora ?? new Date()).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  for (const b of boletins) desenharPagina(pdf.addPage(A4), fontes, { escola: dados.escola, ano: dados.ano, emitidoEm }, b);
  if (boletins.length === 0) desenharPagina(pdf.addPage(A4), fontes, { escola: dados.escola, ano: dados.ano, emitidoEm }, { aluno: "—", turma: "—", linhas: [] });
  return pdf.save();
}

/** Nome de arquivo seguro: "boletim-2026-maria-silva.pdf". */
export function nomeArquivoBoletim(ano: number, nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `boletim-${ano}-${slug || "aluno"}.pdf`;
}
