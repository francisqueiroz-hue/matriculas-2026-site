import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { TRIMESTRES, TRIMESTRE_LABEL } from "@/lib/notas";
import type { LinhaBoletim } from "@/lib/boletim";

/**
 * Boletim em PDF para impressão (A4 em pé; cada aluno começa numa página nova e continua na seguinte se tiver muitas disciplinas). Gerado no servidor só para a
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

type Fontes = { normal: PDFFont; negrito: PDFFont };
type DadosCabecalho = { escola: string; ano: number; emitidoEm: string };

/** Altura mínima livre embaixo para a legenda e as assinaturas da última página. */
const ESPACO_RODAPE = 120;
/** Limite inferior das linhas da tabela numa página que continua na seguinte. */
const LIMITE_LINHAS = MARGEM + 30;

/**
 * Desenha o boletim de um aluno. Muitas disciplinas continuam em páginas seguintes (com o nome do
 * aluno e o cabeçalho da tabela repetidos); legenda e assinaturas saem só na última página.
 */
function desenharBoletim(pdf: PDFDocument, fontes: Fontes, dados: DadosCabecalho, b: BoletimParaImpressao) {
  const { normal, negrito } = fontes;
  const largura = A4[0] - 2 * MARGEM;
  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGEM;

  const texto = (t: string, x: number, yy: number, tamanho: number, fonte = normal, cor = rgb(0, 0, 0)) =>
    page.drawText(limpar(t, fonte), { x, y: yy, size: tamanho, font: fonte, color: cor });

  // Colunas: Disciplina | 1º | 2º | 3º | Média final | Situação
  const colDisc = 170;
  const colTri = 62;
  const colFinal = 70;
  const xs = [MARGEM, MARGEM + colDisc, MARGEM + colDisc + colTri, MARGEM + colDisc + 2 * colTri, MARGEM + colDisc + 3 * colTri, MARGEM + colDisc + 3 * colTri + colFinal];
  const titulos = ["Disciplina", ...TRIMESTRES.map((t) => TRIMESTRE_LABEL[t].replace(" Trimestre", " Trim.")), "Média final", "Situação"];
  const alturaLinha = 20;

  const cabecalho = (continuacao: boolean) => {
    texto(caber(limpar(dados.escola, negrito), negrito, 14, largura), MARGEM, y - 14, 14, negrito);
    y -= 32;
    texto(`Boletim escolar — ${dados.ano}${continuacao ? " (continuação)" : ""}`, MARGEM, y, 12, negrito);
    y -= 22;
    texto(`Aluno(a): ${caber(limpar(b.aluno, normal), normal, 11, largura - 60)}`, MARGEM, y, 11);
    y -= 16;
    texto(`Turma: ${caber(limpar(b.turma, normal), normal, 11, largura - 60)}`, MARGEM, y, 11);
    y -= 24;
  };
  const cabecalhoTabela = () => {
    page.drawRectangle({ x: MARGEM, y: y - 6, width: largura, height: alturaLinha, color: rgb(0.93, 0.94, 0.96) });
    titulos.forEach((t, i) => texto(t, xs[i] + 4, y, 9, negrito));
    y -= alturaLinha;
  };
  const novaPagina = (comTabela: boolean) => {
    page = pdf.addPage(A4);
    y = A4[1] - MARGEM;
    cabecalho(true);
    if (comTabela) cabecalhoTabela();
  };

  cabecalho(false);
  cabecalhoTabela();

  if (!b.linhas.length) {
    texto("Nenhuma nota lançada ainda.", MARGEM + 4, y, 10, normal, CINZA);
    y -= alturaLinha;
  } else {
    for (const l of b.linhas) {
      if (y < LIMITE_LINHAS) novaPagina(true);
      texto(caber(limpar(l.nome, normal), normal, 10, colDisc - 8), xs[0] + 4, y, 10);
      TRIMESTRES.forEach((t, i) => texto(formatarNota(l.trimestres[t].media), xs[i + 1] + 4, y, 10));
      texto(formatarNota(l.mediaFinal), xs[4] + 4, y, 10, negrito);
      texto(SITUACAO[l.situacao], xs[5] + 4, y, 10);
      page.drawLine({ start: { x: MARGEM, y: y - 6 }, end: { x: MARGEM + largura, y: y - 6 }, thickness: 0.5, color: LINHA });
      y -= alturaLinha;
    }
  }

  // Sem espaço para legenda e assinaturas: vão para uma página seguinte.
  if (y < MARGEM + ESPACO_RODAPE) novaPagina(false);

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

/** Um PDF com o boletim de cada aluno a partir de uma página nova (o individual é uma lista de um). */
export async function gerarBoletimPdf(dados: { escola: string; ano: number; agora?: Date }, boletins: BoletimParaImpressao[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(boletins.length === 1 ? `Boletim ${dados.ano} - ${boletins[0].aluno}` : `Boletins ${dados.ano}`);
  pdf.setCreator("ClassLink");
  const fontes = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const emitidoEm = (dados.agora ?? new Date()).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const cab = { escola: dados.escola, ano: dados.ano, emitidoEm };
  for (const b of boletins) desenharBoletim(pdf, fontes, cab, b);
  if (boletins.length === 0) desenharBoletim(pdf, fontes, cab, { aluno: "—", turma: "—", linhas: [] });
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
