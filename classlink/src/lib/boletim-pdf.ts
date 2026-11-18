import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { MEDIA_APROVACAO } from "@/lib/notas";
import { calcularLinhas, formatarNumero, type BoletimEditavel, type LinhaCalculada, type ModeloBoletim } from "@/lib/boletim-modelo";
import { LOGO_ESPACO_KIDS_PNG, LOGO_INSTITUTO_FOKUS_PNG } from "@/lib/boletim-logos";

/**
 * Boletim em PDF no modelo da escola (A4 em pé): moldura laranja, logos do Espaço Kids e do
 * Instituto Fokus, cabeçalho com a portaria, tabela por trimestre (nota, faltas, % de frequência),
 * média final e situação, gráfico das médias, local e data, assinaturas e rodapé com endereço.
 * Cada aluno começa numa página nova; disciplinas, gráfico ou assinaturas que não cabem continuam
 * na página seguinte. Gerado no servidor só para a direção e a coordenação.
 */

export type BoletimParaImpressao = BoletimEditavel & { aluno: string };

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 32;
const LARGURA = A4[0] - 2 * MARGEM;
const LIMITE_INFERIOR = 62; // acima do rodapé

const PRETO = rgb(0, 0, 0);
const CINZA = rgb(0.4, 0.42, 0.45);
const LARANJA = rgb(0.93, 0.49, 0.13);
const AZUL = rgb(0.13, 0.45, 0.71);
const AZUL_CLARO = rgb(0.9, 0.94, 0.98);
const AMARELO = rgb(1, 0.76, 0.05);
const VERMELHO = rgb(0.8, 0.1, 0.1);
const VERDE = rgb(0.1, 0.5, 0.2);
const BORDA = rgb(0.7, 0.74, 0.78);
const BRANCO = rgb(1, 1, 1);

type Fontes = { normal: PDFFont; negrito: PDFFont };

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

/** Quebra em linhas que cabem na largura. */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split(/\r?\n/)) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
      else {
        if (atual) linhas.push(atual);
        atual = caber(palavra, fonte, tamanho, largura);
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

export function formatarNota(v: number | null): string {
  return formatarNumero(v);
}

class Desenho {
  page!: PDFPage;
  y = 0;
  constructor(
    private pdf: PDFDocument,
    private fontes: Fontes,
    private logos: { kids: PDFImage; fokus: PDFImage },
    private modelo: ModeloBoletim,
    private b: BoletimParaImpressao,
  ) {}

  texto(t: string, x: number, y: number, tamanho: number, fonte: PDFFont = this.fontes.normal, cor = PRETO) {
    this.page.drawText(limpar(t, fonte), { x, y, size: tamanho, font: fonte, color: cor });
  }

  centro(t: string, y: number, tamanho: number, fonte: PDFFont = this.fontes.normal, cor = PRETO, x0 = MARGEM, largura = LARGURA) {
    const s = caber(limpar(t, fonte), fonte, tamanho, largura);
    const w = fonte.widthOfTextAtSize(s, tamanho);
    this.page.drawText(s, { x: x0 + (largura - w) / 2, y, size: tamanho, font: fonte, color: cor });
    return { x: x0 + (largura - w) / 2, w };
  }

  /** Célula com texto centralizado (ou à esquerda), fundo e borda opcionais. */
  celula(x: number, y: number, w: number, h: number, t: string, o: { tamanho?: number; fonte?: PDFFont; cor?: ReturnType<typeof rgb>; fundo?: ReturnType<typeof rgb>; esquerda?: boolean } = {}) {
    const tamanho = o.tamanho ?? 7.5;
    const fonte = o.fonte ?? this.fontes.normal;
    if (o.fundo) this.page.drawRectangle({ x, y, width: w, height: h, color: o.fundo });
    this.page.drawRectangle({ x, y, width: w, height: h, borderColor: BORDA, borderWidth: 0.5 });
    const s = caber(limpar(t, fonte), fonte, tamanho, w - 6);
    const tw = fonte.widthOfTextAtSize(s, tamanho);
    this.page.drawText(s, { x: o.esquerda ? x + 3 : x + (w - tw) / 2, y: y + (h - tamanho) / 2 + 1.5, size: tamanho, font: fonte, color: o.cor ?? PRETO });
  }

  novaPagina(continuacao: boolean) {
    this.page = this.pdf.addPage(A4);
    const [W, H] = A4;
    this.page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: LARANJA, borderWidth: 1.5 });

    // Logos e cabeçalho
    const topo = H - MARGEM;
    const kids = this.logos.kids.scaleToFit(112, 50);
    this.page.drawImage(this.logos.kids, { x: MARGEM, y: topo - kids.height, width: kids.width, height: kids.height });
    const fokus = this.logos.fokus.scaleToFit(54, 54);
    this.page.drawImage(this.logos.fokus, { x: W - MARGEM - fokus.width, y: topo - fokus.height, width: fokus.width, height: fokus.height });
    const x0 = MARGEM + 120;
    const largura = LARGURA - 120 - 64;
    let y = topo - 10;
    for (const linha of this.modelo.cabecalho.filter(Boolean)) {
      const { x, w } = this.centro(linha, y, 9, this.fontes.negrito, PRETO, x0, largura);
      this.page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + w, y: y - 1.5 }, thickness: 0.6, color: PRETO });
      y -= 12.5;
    }
    this.y = Math.min(y, topo - 58) - 8;

    // Rodapé
    const rodape = this.modelo.rodape.filter(Boolean);
    rodape.forEach((l, i) => this.centro(l, 26 + (rodape.length - 1 - i) * 10, 7.5, this.fontes.normal, CINZA));

    // Aluno e turma
    const h = 15;
    this.y -= h;
    this.celula(MARGEM, this.y, 48, h, "Aluno(a)", { fundo: AZUL, cor: BRANCO, fonte: this.fontes.negrito, tamanho: 8 });
    this.celula(MARGEM + 48, this.y, 300, h, this.b.aluno + (continuacao ? " (continuação)" : ""), { esquerda: true, tamanho: 8.5, fonte: this.fontes.negrito });
    this.celula(MARGEM + 348, this.y, 48, h, "Turma", { fundo: AZUL, cor: BRANCO, fonte: this.fontes.negrito, tamanho: 8 });
    this.celula(MARGEM + 396, this.y, LARGURA - 396, h, this.b.turma, { esquerda: true, tamanho: 8.5 });
    this.y -= 12;
  }

  /** Garante espaço; se não houver, continua numa página nova. Devolve true se trocou de página. */
  garantir(altura: number): boolean {
    if (this.y - altura >= LIMITE_INFERIOR) return false;
    this.novaPagina(true);
    return true;
  }

  // Colunas: Disciplina | 3 × (Nota, Faltas, % Freq) | Média final | % Freq. | Situação
  static COL = { disc: 104, nota: 30, faltas: 30, freq: 32, media: 40, freqTotal: 40, situacao: 0 };

  cabecalhoTabela() {
    const c = Desenho.COL;
    const h = 12;
    const situacao = LARGURA - c.disc - 3 * (c.nota + c.faltas + c.freq) - c.media - c.freqTotal;
    const negrito = this.fontes.negrito;
    let x = MARGEM;
    this.y -= 2 * h;
    this.celula(x, this.y, c.disc, 2 * h, "Disciplina", { fundo: AMARELO, fonte: negrito, tamanho: 8 });
    x += c.disc;
    for (let i = 0; i < 3; i++) {
      const wt = c.nota + c.faltas + c.freq;
      this.celula(x, this.y + h, wt, h, `${i + 1}º Trimestre`, { fundo: AZUL, cor: BRANCO, fonte: negrito });
      this.celula(x, this.y, c.nota, h, "Nota", { fundo: AZUL, cor: BRANCO, fonte: negrito, tamanho: 6.5 });
      this.celula(x + c.nota, this.y, c.faltas, h, "Faltas", { fundo: AZUL, cor: BRANCO, fonte: negrito, tamanho: 6.5 });
      this.celula(x + c.nota + c.faltas, this.y, c.freq, h, "% Freq.", { fundo: AZUL, cor: BRANCO, fonte: negrito, tamanho: 6.5 });
      x += wt;
    }
    this.celula(x, this.y + h, c.media + c.freqTotal + situacao, h, "Avaliação / Situação", { fundo: AZUL, cor: BRANCO, fonte: negrito });
    this.celula(x, this.y, c.media, h, "Média final", { fundo: AZUL, cor: BRANCO, fonte: negrito, tamanho: 6.5 });
    this.celula(x + c.media, this.y, c.freqTotal, h, "Freq. total", { fundo: AZUL, cor: BRANCO, fonte: negrito, tamanho: 6.5 });
    this.celula(x + c.media + c.freqTotal, this.y, situacao, h, "Situação", { fundo: AZUL, cor: BRANCO, fonte: negrito, tamanho: 6.5 });
  }

  linhaTabela(l: LinhaCalculada, par: boolean) {
    const c = Desenho.COL;
    const h = 13;
    const situacao = LARGURA - c.disc - 3 * (c.nota + c.faltas + c.freq) - c.media - c.freqTotal;
    const fundo = par ? AZUL_CLARO : undefined;
    const corNota = (n: number | null) => (n !== null && n < MEDIA_APROVACAO ? VERMELHO : PRETO);
    const pct = (p: number | null) => (p === null ? "—" : `${p}%`);
    this.y -= h;
    let x = MARGEM;
    this.celula(x, this.y, c.disc, h, l.disciplina.toLocaleUpperCase("pt-BR"), { esquerda: true, fundo, fonte: this.fontes.negrito, tamanho: 7 });
    x += c.disc;
    for (const t of l.trimestres) {
      this.celula(x, this.y, c.nota, h, formatarNumero(t.nota), { fundo, fonte: this.fontes.negrito, cor: corNota(t.nota) });
      this.celula(x + c.nota, this.y, c.faltas, h, t.faltas === null ? "—" : String(t.faltas), { fundo });
      this.celula(x + c.nota + c.faltas, this.y, c.freq, h, pct(t.freq), { fundo });
      x += c.nota + c.faltas + c.freq;
    }
    this.celula(x, this.y, c.media, h, formatarNumero(l.media), { fundo, fonte: this.fontes.negrito, cor: corNota(l.media) });
    this.celula(x + c.media, this.y, c.freqTotal, h, pct(l.freqTotal), { fundo });
    const corSit = l.situacao === "Reprovado" ? VERMELHO : l.situacao === "Aprovado" ? VERDE : CINZA;
    this.celula(x + c.media + c.freqTotal, this.y, situacao, h, l.situacao, { fundo, cor: corSit, fonte: this.fontes.negrito });
  }

  tabela(linhas: LinhaCalculada[]) {
    this.garantir(24 + 13 * Math.min(3, Math.max(1, linhas.length)));
    this.cabecalhoTabela();
    if (!linhas.length) {
      this.y -= 14;
      this.texto("Nenhuma disciplina cadastrada.", MARGEM + 4, this.y + 4, 8, this.fontes.normal, CINZA);
      return;
    }
    linhas.forEach((l, i) => {
      if (this.garantir(13)) this.cabecalhoTabela();
      this.linhaTabela(l, i % 2 === 1);
    });
    this.y -= 4;
    this.texto(
      `Nota do trimestre: trabalho (peso 3), teste (peso 7) e prova (peso 10). Média final = média dos 3 trimestres; aprovação com ${formatarNumero(MEDIA_APROVACAO, 1)}.`,
      MARGEM,
      this.y - 8,
      6.5,
      this.fontes.normal,
      CINZA,
    );
    this.y -= 14;
  }

  observacoes(texto: string) {
    if (!texto.trim()) return;
    const linhas = quebrar(limpar(texto, this.fontes.normal), this.fontes.normal, 8, LARGURA - 12);
    const h = 16 + linhas.length * 10;
    this.garantir(h + 6);
    this.y -= h;
    this.page.drawRectangle({ x: MARGEM, y: this.y, width: LARGURA, height: h, borderColor: BORDA, borderWidth: 0.6 });
    this.texto("Observações", MARGEM + 6, this.y + h - 11, 8, this.fontes.negrito);
    linhas.forEach((l, i) => this.texto(l, MARGEM + 6, this.y + h - 22 - i * 10, 8));
    this.y -= 8;
  }

  grafico(linhas: LinhaCalculada[]) {
    if (!this.modelo.mostrarGrafico || !linhas.length) return;
    const rotacionar = LARGURA / linhas.length < 46;
    const alturaRotulos = rotacionar ? 46 : 16;
    const alturaBarras = 120;
    const total = 16 + alturaBarras + alturaRotulos + 8;
    this.garantir(total);
    const topo = this.y;
    this.centro("Médias por disciplina", topo - 11, 9, this.fontes.negrito, CINZA);
    const xEixo = MARGEM + 22;
    const largura = LARGURA - 26;
    const base = topo - 16 - alturaBarras;
    const escala = (v: number) => base + (v / 10) * (alturaBarras - 8);
    for (let v = 0; v <= 10; v += 2) {
      const y = escala(v);
      this.page.drawLine({ start: { x: xEixo, y }, end: { x: xEixo + largura, y }, thickness: 0.3, color: BORDA });
      this.texto(String(v), MARGEM + 6, y - 2.5, 6.5, this.fontes.normal, CINZA);
    }
    const ySeis = escala(MEDIA_APROVACAO);
    this.page.drawLine({ start: { x: xEixo, y: ySeis }, end: { x: xEixo + largura, y: ySeis }, thickness: 0.8, color: VERMELHO, dashArray: [3, 2] });
    const slot = largura / linhas.length;
    const barra = Math.min(26, slot * 0.6);
    linhas.forEach((l, i) => {
      const cx = xEixo + slot * i + slot / 2;
      const v = l.media ?? l.mediaParcial;
      if (v !== null) {
        const h = escala(v) - base;
        this.page.drawRectangle({ x: cx - barra / 2, y: base, width: barra, height: Math.max(h, 0.5), color: v < MEDIA_APROVACAO ? VERMELHO : AZUL });
        const rot = formatarNumero(v);
        const tam = slot < 22 ? 5 : 6.5;
        this.texto(rot, cx - this.fontes.normal.widthOfTextAtSize(rot, tam) / 2, base + h + 2, tam, this.fontes.normal, PRETO);
      }
      const nome = limpar(l.disciplina, this.fontes.normal);
      if (rotacionar) {
        const s = caber(nome, this.fontes.normal, 6.5, alturaRotulos * 1.3);
        this.page.drawText(s, { x: cx - 2, y: base - 6, size: 6.5, font: this.fontes.normal, color: CINZA, rotate: degrees(-40) });
      } else {
        const s = caber(nome, this.fontes.normal, 6.5, slot - 4);
        this.texto(s, cx - this.fontes.normal.widthOfTextAtSize(s, 6.5) / 2, base - 10, 6.5, this.fontes.normal, CINZA);
      }
    });
    this.y = base - alturaRotulos - 8;
  }

  assinaturas() {
    const b = this.b;
    this.garantir(118);
    this.y -= 16;
    if (b.localData) this.centro(b.localData, this.y, 9.5);
    this.y -= 46;
    const larguraAss = 200;
    const pares: [string, string][] = [
      ["Professor(a)", b.professor],
      ["Coordenação", b.coordenacao],
    ];
    pares.forEach(([rotulo, nome], i) => {
      const x = i === 0 ? MARGEM + 10 : MARGEM + LARGURA - larguraAss - 10;
      this.page.drawLine({ start: { x, y: this.y }, end: { x: x + larguraAss, y: this.y }, thickness: 0.7, color: PRETO });
      this.texto(caber(limpar(`${rotulo}${nome ? `: ${nome}` : ""}`, this.fontes.normal), this.fontes.normal, 8.5, larguraAss), x, this.y - 11, 8.5);
    });
    this.y -= 40;
    const x = MARGEM + (LARGURA - larguraAss) / 2;
    this.page.drawLine({ start: { x, y: this.y }, end: { x: x + larguraAss, y: this.y }, thickness: 0.7, color: PRETO });
    this.centro(`Responsável pedagógico${b.responsavelPedagogico ? `: ${b.responsavelPedagogico}` : ""}`, this.y - 11, 8.5, this.fontes.normal, PRETO, x, larguraAss);
    this.y -= 16;
  }
}

/** Um PDF com o boletim de cada aluno, cada um a partir de uma página nova. */
export async function gerarBoletimPdf(dados: { modelo: ModeloBoletim; ano: number }, boletins: BoletimParaImpressao[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(boletins.length === 1 ? `Boletim ${dados.ano} - ${boletins[0].aluno}` : `Boletins ${dados.ano}`);
  pdf.setCreator("ClassLink");
  const fontes = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const logos = { kids: await pdf.embedPng(LOGO_ESPACO_KIDS_PNG), fokus: await pdf.embedPng(LOGO_INSTITUTO_FOKUS_PNG) };
  for (const b of boletins) {
    const d = new Desenho(pdf, fontes, logos, dados.modelo, b);
    const linhas = calcularLinhas(b);
    d.novaPagina(false);
    d.tabela(linhas);
    d.observacoes(b.observacoes);
    d.grafico(linhas);
    d.assinaturas();
  }
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
