import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { HistoricoAluno, ModeloHistorico } from "@/lib/historico-escolar";
import { LOGO_INSTITUTO_FOKUS_PNG } from "@/lib/boletim-logos";

/**
 * Histórico escolar em PDF (A4 em pé), no desenho do modelo que a escola já usa: moldura laranja,
 * cabeçalho da mantenedora à esquerda e logo do Instituto Fokus à direita, identificação do aluno
 * (com o código Censo INEP), tabela de notas por ano, carga horária, frequência e resultado,
 * estudos realizados (série, ano, escola e município, inclusive transferências), observações,
 * local e data e as duas assinaturas.
 *
 * Cabe numa folha: a altura das linhas da tabela se ajusta ao espaço que sobra (entre um mínimo e
 * um máximo). Se ainda assim não couber (muitos componentes e muitas observações), o que falta
 * continua na folha seguinte.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 34;
const LARGURA = A4[0] - 2 * MARGEM;
const LIMITE_INFERIOR = 34;

const PRETO = rgb(0, 0, 0);
const CINZA = rgb(0.35, 0.37, 0.4);
const LARANJA = rgb(0.93, 0.49, 0.13);
const BORDA = rgb(0.35, 0.37, 0.4);
const FUNDO = rgb(0.95, 0.95, 0.96);

const H_LINHA_MIN = 11;
const H_LINHA_MAX = 19;
const ALTURA_ASSINATURAS = 96;

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

function caber(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}…`, tamanho) > largura) t = t.slice(0, -1);
  return `${t}…`;
}

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

class Desenho {
  page!: PDFPage;
  y = 0;
  paginas = 0;
  constructor(
    private pdf: PDFDocument,
    private f: Fontes,
    private logo: PDFImage,
    private modelo: ModeloHistorico,
    private h: HistoricoAluno,
    private hLinha: number,
  ) {}

  texto(t: string, x: number, y: number, tamanho: number, fonte: PDFFont = this.f.normal, cor = PRETO, largura?: number) {
    let s = limpar(t, fonte);
    if (largura) s = caber(s, fonte, tamanho, largura);
    this.page.drawText(s, { x, y, size: tamanho, font: fonte, color: cor });
    return fonte.widthOfTextAtSize(s, tamanho);
  }

  centro(t: string, y: number, tamanho: number, fonte: PDFFont = this.f.normal, x0 = MARGEM, largura = LARGURA, cor = PRETO) {
    const s = caber(limpar(t, fonte), fonte, tamanho, largura);
    const w = fonte.widthOfTextAtSize(s, tamanho);
    this.page.drawText(s, { x: x0 + (largura - w) / 2, y, size: tamanho, font: fonte, color: cor });
  }

  celula(x: number, y: number, w: number, h: number, t: string, o: { tamanho?: number; fonte?: PDFFont; fundo?: ReturnType<typeof rgb>; esquerda?: boolean } = {}) {
    const tamanho = o.tamanho ?? 8;
    const fonte = o.fonte ?? this.f.normal;
    if (o.fundo) this.page.drawRectangle({ x, y, width: w, height: h, color: o.fundo });
    this.page.drawRectangle({ x, y, width: w, height: h, borderColor: BORDA, borderWidth: 0.5 });
    if (!t) return;
    const s = caber(limpar(t, fonte), fonte, tamanho, w - 6);
    const tw = fonte.widthOfTextAtSize(s, tamanho);
    this.page.drawText(s, { x: o.esquerda ? x + 3 : x + (w - tw) / 2, y: y + (h - tamanho) / 2 + 1.5, size: tamanho, font: fonte, color: PRETO });
  }

  get letra() {
    return Math.min(9, 7 + (this.hLinha - H_LINHA_MIN) * 0.25);
  }

  novaPagina(continuacao: boolean) {
    this.page = this.pdf.addPage(A4);
    this.paginas++;
    const [W, H] = A4;
    this.page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: LARANJA, borderWidth: 1.5 });

    const topo = H - MARGEM - 4;
    const logo = this.logo.scaleToFit(78, 78);
    this.page.drawImage(this.logo, { x: W - MARGEM - logo.width, y: topo - logo.height + 6, width: logo.width, height: logo.height });
    let y = topo - 6;
    const largTexto = LARGURA - logo.width - 12;
    this.modelo.cabecalho.filter(Boolean).forEach((linha, i) => {
      this.texto(linha, MARGEM, y, i === 0 ? 9 : 7.5, this.f.negrito, PRETO, largTexto);
      y -= i === 0 ? 13 : 11;
    });
    y = Math.min(y, topo - logo.height) - 10;
    if (this.modelo.titulo) {
      this.centro(this.modelo.titulo + (continuacao ? " (continuação)" : ""), y, 11, this.f.negrito);
      y -= 12;
    }
    this.y = y - 4;
  }

  garantir(altura: number): boolean {
    if (this.y - altura >= LIMITE_INFERIOR) return false;
    this.novaPagina(true);
    return true;
  }

  /** Quadro de identificação: rótulo em negrito seguido do valor, em até três linhas. */
  identificacao() {
    const a = this.h.aluno;
    const linhas: [string, string][][] = [
      [["Aluno(a): ", a.nome], ["Código Censo INEP: ", a.codigoInep]],
      [["Natural de: ", a.naturalidade], ["Nacionalidade: ", a.nacionalidade], ["Data de nascimento: ", a.nascimento]],
      [["Filiação: ", a.filiacao]],
    ];
    const hLinha = 14;
    const altura = linhas.length * hLinha + 8;
    this.y -= altura;
    this.page.drawRectangle({ x: MARGEM, y: this.y, width: LARGURA, height: altura, borderColor: BORDA, borderWidth: 0.7 });
    linhas.forEach((pares, i) => {
      const yl = this.y + altura - 13 - i * hLinha;
      const larguraPar = LARGURA / pares.length;
      pares.forEach(([rotulo, valor], j) => {
        const x = MARGEM + 5 + j * larguraPar;
        const wr = this.texto(rotulo, x, yl, 8.5, this.f.negrito);
        this.texto(valor || "", x + wr, yl, 8.5, this.f.normal, PRETO, larguraPar - wr - 8);
      });
    });
    this.y -= 6;
  }

  colunas() {
    const n = this.h.series.length;
    const disc = Math.min(170, Math.max(130, LARGURA - n * 62));
    return { disc, serie: (LARGURA - disc) / n };
  }

  cabecalhoNotas() {
    const { disc, serie } = this.colunas();
    const h = Math.max(12, this.hLinha);
    this.y -= 2 * h;
    this.celula(MARGEM, this.y, disc, 2 * h, "Componentes curriculares", { fonte: this.f.negrito, fundo: FUNDO, tamanho: 8.5 });
    this.h.series.forEach((s, i) => {
      const x = MARGEM + disc + i * serie;
      this.celula(x, this.y + h, serie, h, "Notas", { fonte: this.f.negrito, fundo: FUNDO, tamanho: 7.5 });
      this.celula(x, this.y, serie, h, s, { fonte: this.f.negrito, fundo: FUNDO, tamanho: 8 });
    });
  }

  linhaNotas(rotulo: string, valores: string[], negrito = false) {
    const { disc, serie } = this.colunas();
    if (this.garantir(this.hLinha)) this.cabecalhoNotas();
    this.y -= this.hLinha;
    this.celula(MARGEM, this.y, disc, this.hLinha, rotulo, { esquerda: true, fonte: negrito ? this.f.negrito : this.f.normal, tamanho: this.letra });
    valores.forEach((v, i) => this.celula(MARGEM + disc + i * serie, this.y, serie, this.hLinha, v, { tamanho: this.letra, fonte: negrito ? this.f.negrito : this.f.normal }));
  }

  notas() {
    this.garantir(2 * this.hLinha + 3 * this.hLinha);
    this.cabecalhoNotas();
    for (const d of this.h.disciplinas) this.linhaNotas(d.nome, d.notas);
    this.linhaNotas("Carga Horária Anual", this.h.cargaHoraria, true);
    this.linhaNotas("Média de Frequência Anual", this.h.frequencia, true);
    this.linhaNotas("Resultado", this.h.resultado, true);
    this.y -= 8;
  }

  estudos() {
    const w = [70, 50, 0, 140];
    w[2] = LARGURA - w[0] - w[1] - w[3];
    const titulos = ["Série", "Ano", "Estabelecimento de Ensino", "Município"];
    const h = Math.max(12, this.hLinha - 1);
    // Em ordem de ano (a linha do ano em curso vem primeiro na tela); sem ano vai para o fim.
    const ordem = (a: string) => (/^\d{4}/.test(a.trim()) ? Number(a.trim().slice(0, 4)) : 9999);
    const ordenados = [...this.h.estudos].sort((a, b) => ordem(a.ano) - ordem(b.ano));
    const linhas = ordenados.length ? ordenados : [{ serie: "", ano: "", estabelecimento: "", municipio: "" }];
    this.garantir(h * 2 + 12);
    this.texto("ESTUDOS REALIZADOS", MARGEM, this.y - 9, 8.5, this.f.negrito);
    this.y -= 13;
    const cabecalho = () => {
      this.y -= h;
      let x = MARGEM;
      titulos.forEach((t, i) => {
        this.celula(x, this.y, w[i], h, t, { fonte: this.f.negrito, fundo: FUNDO });
        x += w[i];
      });
    };
    cabecalho();
    for (const e of linhas) {
      if (this.garantir(h)) cabecalho();
      this.y -= h;
      let x = MARGEM;
      [e.serie, e.ano, e.estabelecimento, e.municipio].forEach((v, i) => {
        this.celula(x, this.y, w[i], h, v, { esquerda: i === 2 || i === 3, tamanho: this.letra });
        x += w[i];
      });
    }
    this.y -= 8;
  }

  observacoes() {
    const t = this.h.observacoes.trim();
    if (!t) return;
    const linhas = quebrar(limpar(t, this.f.normal), this.f.normal, 8, LARGURA - 12);
    const altura = 16 + linhas.length * 10;
    this.garantir(altura + 4);
    this.y -= altura;
    this.page.drawRectangle({ x: MARGEM, y: this.y, width: LARGURA, height: altura, borderColor: BORDA, borderWidth: 0.6 });
    this.texto("Observações", MARGEM + 6, this.y + altura - 11, 8, this.f.negrito);
    linhas.forEach((l, i) => this.texto(l, MARGEM + 6, this.y + altura - 22 - i * 10, 8));
    this.y -= 8;
  }

  assinaturas(noPe: boolean) {
    this.garantir(ALTURA_ASSINATURAS);
    if (noPe) this.y = Math.min(this.y, LIMITE_INFERIOR + ALTURA_ASSINATURAS);
    this.y -= 14;
    if (this.h.localData) this.centro(this.h.localData, this.y, 10);
    this.y -= 44;
    const larg = 200;
    this.modelo.assinantes.forEach((a, i) => {
      const x = i === 0 ? MARGEM + 10 : MARGEM + LARGURA - larg - 10;
      this.page.drawLine({ start: { x, y: this.y }, end: { x: x + larg, y: this.y }, thickness: 0.7, color: PRETO });
      this.centro(a.cargo, this.y - 11, 8.5, this.f.negrito, x, larg);
      if (a.nome) this.centro(a.nome, this.y - 22, 8.5, this.f.normal, x, larg);
      if (a.registro) this.centro(a.registro, this.y - 33, 8, this.f.normal, x, larg, CINZA);
    });
    this.y -= 38;
  }
}

/** Altura de linha que faz o histórico caber numa folha (entre o mínimo e o máximo). */
function escolherAltura(desenhar: (h: number) => Desenho): { hLinha: number; noPe: boolean } {
  const minimo = desenhar(H_LINHA_MIN);
  if (minimo.paginas > 1) return { hLinha: H_LINHA_MIN, noPe: false };
  let lo = H_LINHA_MIN;
  let hi = H_LINHA_MAX;
  for (let i = 0; i < 8; i++) {
    const meio = (lo + hi) / 2;
    if (desenhar(meio).paginas === 1) lo = meio;
    else hi = meio;
  }
  return { hLinha: lo, noPe: true };
}

/** PDF do histórico escolar de um aluno. */
export async function gerarHistoricoPdf(modelo: ModeloHistorico, h: HistoricoAluno): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Histórico escolar - ${h.aluno.nome}`);
  pdf.setCreator("ClassLink");
  const fontes = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const logo = await pdf.embedPng(LOGO_INSTITUTO_FOKUS_PNG);

  const montar = (doc: PDFDocument, hLinha: number, noPe: boolean) => {
    const d = new Desenho(doc, fontes, logo, modelo, h, hLinha);
    d.novaPagina(false);
    d.identificacao();
    d.notas();
    d.estudos();
    d.observacoes();
    d.assinaturas(noPe);
    return d;
  };
  // Folha de ensaio: mede antes de desenhar de verdade (nunca é salva).
  const ensaio = await PDFDocument.create();
  const { hLinha, noPe } = escolherAltura((alt) => montar(ensaio, alt, true));
  montar(pdf, hLinha, noPe);
  return pdf.save();
}
