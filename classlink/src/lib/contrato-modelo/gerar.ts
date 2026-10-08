import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { CLAUSULAS_2027 } from "./texto-2027";
import { LOGO_ESPACO_KIDS_PNG, LOGO_INSTITUTO_FOKUS_PNG } from "./logos";
import {
  LINHAS_ANEXO_IMAGEM,
  calcularValores,
  formatarCpf,
  formatarDinheiro,
  type CondicoesContrato,
  type DadosFamilia,
  type Pessoa,
} from "./tipos";

// Reproduz o layout do Contrato 2027 revisado: moldura laranja, faixas cinza das seções,
// quadros em Helvetica e cláusulas em Times justificadas. Coordenadas em pontos (A4),
// medidas a partir do topo da página e convertidas para o sistema do PDF (base embaixo).

const LARGURA = 595.28;
const ALTURA = 841.89;
const X0 = 31;
const X1 = 564.3;
const XMEIO = 297.6;
const LARANJA = rgb(0.961, 0.51, 0.125);
const CINZA = rgb(0.847, 0.847, 0.847);
const GRADE = rgb(0.72, 0.72, 0.72);
const PRETO = rgb(0, 0, 0);
const TOPO_CORPO = 72;
const LIMITE_CORPO = 760; // abaixo disso fica o rodapé

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export interface EntradaContrato {
  condicoes: CondicoesContrato;
  /** null = contrato em branco: a família preenche à mão (ou no app, se quiser). */
  familia: DadosFamilia | null;
  aluno: { nome: string };
  /** Data em que a família gerou o contrato preenchido; null = linha para a data à mão. */
  data: Date | null;
}

/** Campo vazio vira linha para preencher à mão. */
function ou(v: string | null | undefined, tamanho = 18): string {
  return v && v.trim() ? v : "_".repeat(tamanho);
}
const dinheiro = (v: number) => (v > 0 ? `R$ ${formatarDinheiro(v)}` : "R$ ____________");
const dataOuLinha = (d: Date | null) => (d ? dataPorExtenso(d) : "____ de ____________________ de ________");

const PESSOA_EM_BRANCO: Pessoa = {
  nome: "",
  cpf: "",
  nascimento: "",
  rg: "",
  orgao: "",
  uf: "",
  endereco: "",
  numero: "",
  complemento: "",
  cep: "",
  bairro: "",
  cidade: "",
  email: "",
  telefone: "",
};

interface Fontes {
  times: PDFFont;
  timesBold: PDFFont;
  helv: PDFFont;
  helvBold: PDFFont;
  helvOblique: PDFFont;
}

/** Troca caracteres fora da codificação das fontes padrão do PDF (WinAnsi) — ex.: emoji digitado num campo. */
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

/**
 * Largura sem kerning, somando letra por letra: o pdf-lib aplica kerning ao medir
 * (widthOfTextAtSize) mas não ao desenhar (drawText) — medir com kerning faz a palavra
 * seguinte encostar na anterior em pares como "TA"/"AT" (ex.: "CONTRATADA,e").
 */
const cacheLarguras = new WeakMap<PDFFont, Map<string, number>>();
function largura(texto: string, fonte: PDFFont, tamanho: number): number {
  let mapa = cacheLarguras.get(fonte);
  if (!mapa) cacheLarguras.set(fonte, (mapa = new Map()));
  let total = 0;
  for (const ch of texto) {
    let w = mapa.get(ch);
    if (w === undefined) {
      w = fonte.widthOfTextAtSize(ch, 1000);
      mapa.set(ch, w);
    }
    total += w;
  }
  return (total * tamanho) / 1000;
}

/** Quebra um texto em linhas que caibam na largura (para células de tabela). */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, larguraMax: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of limpar(texto, fonte).split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && largura(tentativa, fonte, tamanho) > larguraMax) {
      linhas.push(atual);
      atual = palavra;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function dataPorExtenso(d: Date) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

class Documento {
  pdf!: PDFDocument;
  f!: Fontes;
  pagina!: PDFPage;
  y = TOPO_CORPO; // cursor, a partir do topo

  async iniciar() {
    this.pdf = await PDFDocument.create();
    this.pdf.setTitle("Contrato de Prestação de Serviços Educacionais 2027");
    this.pdf.setAuthor("Espaço Kids Creche Escola Ltda");
    this.pdf.setCreator("ClassLink");
    this.f = {
      times: await this.pdf.embedFont(StandardFonts.TimesRoman),
      timesBold: await this.pdf.embedFont(StandardFonts.TimesRomanBold),
      helv: await this.pdf.embedFont(StandardFonts.Helvetica),
      helvBold: await this.pdf.embedFont(StandardFonts.HelveticaBold),
      helvOblique: await this.pdf.embedFont(StandardFonts.HelveticaOblique),
    };
    this.novaPagina();
  }

  novaPagina() {
    this.pagina = this.pdf.addPage([LARGURA, ALTURA]);
    this.pagina.drawRectangle({ x: 25, y: ALTURA - 817, width: 545, height: 792, borderColor: LARANJA, borderWidth: 1.5 });
    this.y = TOPO_CORPO;
  }

  /** Garante espaço para `altura` pontos; senão, passa para a próxima página. */
  reservar(altura: number) {
    if (this.y + altura > LIMITE_CORPO) this.novaPagina();
  }

  texto(t: string, x: number, topoLinha: number, fonte: PDFFont, tamanho: number, cor = PRETO) {
    this.pagina.drawText(limpar(t, fonte), { x, y: ALTURA - topoLinha - tamanho * 0.78, size: tamanho, font: fonte, color: cor });
  }

  centralizado(t: string, topoLinha: number, fonte: PDFFont, tamanho: number, xa = X0, xb = X1) {
    const limpo = limpar(t, fonte);
    const w = largura(limpo, fonte, tamanho);
    this.texto(limpo, xa + (xb - xa - w) / 2, topoLinha, fonte, tamanho);
  }

  /** Texto que precisa caber numa largura: reduz a fonte até 6 pt e, no limite, corta com reticências. */
  textoAjustado(t: string, x: number, topoLinha: number, larguraMax: number, fonte: PDFFont, tamanho: number) {
    let tam = tamanho;
    let limpo = limpar(t, fonte);
    while (tam > 6 && largura(limpo, fonte, tam) > larguraMax) tam -= 0.25;
    while (limpo.length > 1 && largura(limpo, fonte, tam) > larguraMax) limpo = `${limpo.slice(0, -2)}…`;
    this.texto(limpo, x, topoLinha + (tamanho - tam) / 2, fonte, tam);
  }

  linha(xa: number, topo: number, xb: number, cor = GRADE, espessura = 0.6) {
    this.pagina.drawLine({ start: { x: xa, y: ALTURA - topo }, end: { x: xb, y: ALTURA - topo }, color: cor, thickness: espessura });
  }

  faixa(titulo: string, altura = 16) {
    this.pagina.drawRectangle({ x: X0, y: ALTURA - this.y - altura, width: X1 - X0, height: altura, color: CINZA, borderColor: LARANJA, borderWidth: 0.8 });
    this.centralizado(titulo, this.y + (altura - 9) / 2 + 0.5, this.f.helvBold, 9);
    this.y += altura;
  }

  /** Linhas de cadastro em duas colunas, no formato "Rótulo: valor". */
  grade(linhas: [string, string][], alturaLinha = 18) {
    for (const [esq, dir] of linhas) {
      const topo = this.y;
      this.textoAjustado(esq, X0 + 4, topo + 5, XMEIO - X0 - 8, this.f.helv, 8);
      this.textoAjustado(dir, XMEIO + 4, topo + 5, X1 - XMEIO - 8, this.f.helv, 8);
      this.pagina.drawLine({ start: { x: XMEIO, y: ALTURA - topo }, end: { x: XMEIO, y: ALTURA - topo - alturaLinha }, color: GRADE, thickness: 0.6 });
      this.pagina.drawLine({ start: { x: X0, y: ALTURA - topo }, end: { x: X0, y: ALTURA - topo - alturaLinha }, color: GRADE, thickness: 0.6 });
      this.pagina.drawLine({ start: { x: X1, y: ALTURA - topo }, end: { x: X1, y: ALTURA - topo - alturaLinha }, color: GRADE, thickness: 0.6 });
      this.y += alturaLinha;
      this.linha(X0, this.y, X1);
    }
  }

  /**
   * Parágrafo justificado em Times 10 com trechos **em negrito**. Quebra de página entre
   * linhas, como no original.
   */
  paragrafo(marcado: string, { antes = 0, tamanho = 10, entrelinha = 12.9 } = {}) {
    const trechos: { t: string; negrito: boolean }[] = [];
    marcado.split("**").forEach((t, i) => t && trechos.push({ t, negrito: i % 2 === 1 }));
    const palavras: { t: string; negrito: boolean }[] = [];
    for (const tr of trechos) {
      // preserva espaço entre trechos de estilos diferentes
      const partes = tr.t.split(/(\s+)/);
      for (const p of partes) {
        if (!p) continue;
        if (/^\s+$/.test(p)) palavras.push({ t: " ", negrito: tr.negrito });
        else palavras.push({ t: limpar(p, tr.negrito ? this.f.timesBold : this.f.times), negrito: tr.negrito });
      }
    }
    const larguraLinha = X1 - X0;
    const fonteDe = (n: boolean) => (n ? this.f.timesBold : this.f.times);
    const larg = (p: { t: string; negrito: boolean }) => largura(p.t, fonteDe(p.negrito), tamanho);

    // monta linhas como listas de "palavras" (sem espaços nas pontas)
    const linhas: { t: string; negrito: boolean }[][] = [];
    let atual: { t: string; negrito: boolean }[] = [];
    let w = 0;
    for (const p of palavras) {
      if (p.t === " ") {
        if (atual.length) {
          atual.push(p);
          w += larg(p);
        }
        continue;
      }
      if (w + larg(p) > larguraLinha && atual.length) {
        while (atual.length && atual[atual.length - 1].t === " ") atual.pop();
        linhas.push(atual);
        atual = [];
        w = 0;
      }
      atual.push(p);
      w += larg(p);
    }
    while (atual.length && atual[atual.length - 1].t === " ") atual.pop();
    if (atual.length) linhas.push(atual);

    this.y += antes;
    linhas.forEach((ln, idx) => {
      this.reservar(entrelinha);
      const ultima = idx === linhas.length - 1;
      const espacos = ln.filter((p) => p.t === " ").length;
      const ocupada = ln.reduce((s, p) => s + larg(p), 0);
      const extra = !ultima && espacos > 0 ? (larguraLinha - ocupada) / espacos : 0;
      let x = X0;
      for (const p of ln) {
        if (p.t === " ") {
          x += larg(p) + extra;
          continue;
        }
        this.texto(p.t, x, this.y, fonteDe(p.negrito), tamanho);
        x += larg(p);
      }
      this.y += entrelinha;
    });
  }

  /** Tabela de duas colunas com cabeçalho em faixa cinza. */
  tabela(cabecalho: [string, string], linhas: [string, string][], xDivisa = 200) {
    const alt = 19;
    this.reservar(alt * (linhas.length + 1) + 6);
    this.pagina.drawRectangle({ x: X0, y: ALTURA - this.y - alt, width: X1 - X0, height: alt, color: CINZA });
    this.texto(cabecalho[0], X0 + 5, this.y + 5.5, this.f.helvBold, 9);
    this.texto(cabecalho[1], xDivisa + 5, this.y + 5.5, this.f.helvBold, 9);
    const inicio = this.y;
    this.y += alt;
    for (const [a, b] of linhas) {
      this.textoAjustado(a, X0 + 5, this.y + 5.5, xDivisa - X0 - 10, this.f.helv, 9);
      this.textoAjustado(b, xDivisa + 5, this.y + 5.5, X1 - xDivisa - 10, this.f.helv, 9);
      this.y += alt;
      this.linha(X0, this.y, X1);
    }
    this.pagina.drawRectangle({ x: X0, y: ALTURA - this.y, width: X1 - X0, height: this.y - inicio, borderColor: GRADE, borderWidth: 0.6 });
    this.pagina.drawLine({ start: { x: xDivisa, y: ALTURA - inicio }, end: { x: xDivisa, y: ALTURA - this.y }, color: GRADE, thickness: 0.6 });
    this.y += 8;
  }
}

function linhasPessoa(p: Pessoa, emBranco: boolean): [string, string][] {
  const comp = emBranco ? ou("", 14) : p.complemento || "—";
  return [
    [`Nome: ${ou(p.nome, 40)}`, `CPF: ${ou(p.cpf && formatarCpf(p.cpf), 20)}`],
    [`Data de nascimento: ${ou(p.nascimento, 12)} | RG: ${ou(p.rg, 16)}`, `Órgão: ${ou(p.orgao, 12)} | UF: ${ou(p.uf.toUpperCase(), 4)}`],
    [`Endereço: ${ou(p.endereco, 40)}`, `Nº: ${ou(p.numero, 8)} | Complemento: ${comp}`],
    [`CEP: ${ou(p.cep, 12)} | Bairro: ${ou(p.bairro, 20)}`, `Cidade: ${ou(p.cidade, 24)}`],
    [`E-mail: ${ou(p.email, 36)}`, `Telefone: ${ou(p.telefone, 20)}`],
  ];
}

function preencher(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, chave: string) => {
    if (!(chave in valores)) throw new Error(`Campo do contrato sem valor: ${chave}`);
    return ou(valores[chave], 14);
  });
}

/** Gera o PDF do contrato 2027 preenchido com os dados da escola, do aluno e da família. */
export async function gerarContrato2027(entrada: EntradaContrato): Promise<Uint8Array> {
  const { condicoes: c, aluno, data } = entrada;
  const emBranco = entrada.familia === null;
  const fam: DadosFamilia = entrada.familia ?? {
    financeiro: PESSOA_EM_BRANCO,
    pedagogicoMesmo: false,
    pedagogico: PESSOA_EM_BRANCO,
    aluno: { nascimento: "", rg: "", orgao: "", uf: "", enderecoMesmo: false, endereco: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "" },
    responsavelLegal: { quem: "OUTRO", nome: "", cpf: "", vinculo: "", contato: "" },
    imagem: [],
  };
  const cfg = c.config;
  const periodo = c.periodo ? cfg.periodos.find((p) => p.chave === c.periodo) : undefined;
  if (c.periodo && !periodo) throw new Error("Período do contrato não encontrado na configuração");
  const temValores = c.parcelaBruta > 0;
  const v = calcularValores({ parcelaBruta: c.parcelaBruta, parcelaLiquida: c.parcelaLiquida, quantidade: cfg.parcelas.quantidade });
  const pedagogico = fam.pedagogicoMesmo || !fam.pedagogico ? fam.financeiro : fam.pedagogico;
  const endAluno = fam.aluno.enderecoMesmo
    ? { endereco: fam.financeiro.endereco, numero: fam.financeiro.numero, complemento: fam.financeiro.complemento, bairro: fam.financeiro.bairro, cidade: fam.financeiro.cidade, cep: fam.financeiro.cep }
    : fam.aluno;
  const legal = fam.responsavelLegal;
  const traco = (x: string) => (emBranco ? ou("", 8) : x || "—");

  const doc = new Documento();
  await doc.iniciar();
  const { f } = doc;

  // ─── Página 1: cabeçalho e quadros de cadastro ───
  const fokus = await doc.pdf.embedPng(Buffer.from(LOGO_INSTITUTO_FOKUS_PNG, "base64"));
  const kids = await doc.pdf.embedPng(Buffer.from(LOGO_ESPACO_KIDS_PNG, "base64"));
  const hFokus = 38;
  doc.pagina.drawImage(fokus, { x: 42, y: ALTURA - 27 - hFokus, width: (fokus.width / fokus.height) * hFokus, height: hFokus });
  const hKids = 34;
  const wKids = (kids.width / kids.height) * hKids;
  doc.pagina.drawImage(kids, { x: 557 - wKids, y: ALTURA - 29 - hKids, width: wKids, height: hKids });
  doc.centralizado("CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS - 2027", 34, f.helvBold, 10);

  doc.y = 78;
  doc.faixa("DADOS DO RESPONSÁVEL FINANCEIRO");
  doc.grade(linhasPessoa(fam.financeiro, emBranco));
  doc.y += 10;
  doc.faixa("DADOS DO(A) RESPONSÁVEL PEDAGÓGICO(A)");
  doc.grade(linhasPessoa(pedagogico, emBranco));
  doc.y += 10;
  doc.faixa("DADOS DO ALUNO");
  doc.grade([
    [`Nome: ${aluno.nome}`, `Data de nascimento: ${ou(fam.aluno.nascimento, 12)}`],
    [`RG (se houver): ${traco(fam.aluno.rg)} | Órgão: ${traco(fam.aluno.orgao)} | UF: ${traco(fam.aluno.uf.toUpperCase())}`, `Endereço: ${ou(endAluno.endereco, 40)}`],
    [`Nº: ${ou(endAluno.numero, 8)} | Complemento: ${traco(endAluno.complemento)} | Bairro: ${ou(endAluno.bairro, 16)}`, `Cidade: ${ou(endAluno.cidade, 16)} | CEP: ${ou(endAluno.cep, 12)}`],
    [`Portal do aluno no site: ${ou(cfg.escola.portalAluno)}`, `Responsável legal: ${ou(legal.nome, 36)}`],
  ]);
  doc.y += 10;
  doc.faixa("DADOS DO CURSO MATRICULADO");
  const marca = (sim: boolean) => (sim ? "(X)" : "( )");
  doc.texto(`Ano letivo: ${c.anoLetivo} | ${marca(c.etapa === "EI")} Educação infantil ${marca(c.etapa === "EF1")} Ensino fundamental I`, X0, doc.y + 3, f.helv, 9);
  const textoPeriodo = periodo
    ? `${periodo.nome} (${periodo.horario})`
    : cfg.periodos.map((p) => `( ) ${p.nome}`).join("  ");
  doc.textoAjustado(`Etapa/turma: ${c.turma} | Período contratado: ${textoPeriodo}`, X0, doc.y + 14, X1 - X0, f.helv, 9);
  doc.y += 27;
  doc.faixa(`VALORES - ${c.anoLetivo}`);
  const linhasValores = [
    `Valor total do contrato/anuidade: ${temValores ? dinheiro(v.anuidade) : dinheiro(0)} | Período: ${ou(cfg.parcelas.periodoAnuidade, 24)}`,
    `Número de parcelas: ${cfg.parcelas.quantidade} | Valor bruto da parcela: ${dinheiro(c.parcelaBruta)}`,
    `Matrícula/primeira parcela, incluída na anuidade: ${dinheiro(v.primeiraParcela)}`,
    temValores
      ? `Desconto de pontualidade: ${v.descontoPct.toLocaleString("pt-BR")}% ou ${dinheiro(v.descontoValor)} | Valor líquido: ${dinheiro(c.parcelaLiquida)}`
      : `Desconto de pontualidade: ______% ou ${dinheiro(0)} | Valor líquido: ${dinheiro(0)}`,
    `Vencimento: dia ${cfg.parcelas.vencimentoDia} de cada mês | Primeiro/último vencimento: ${ou(cfg.parcelas.primeiroUltimo, 24)}`,
  ];
  linhasValores.forEach((l, i) => doc.textoAjustado(l, X0, doc.y + 3 + i * 11, X1 - X0, f.helv, 9));
  doc.y += 3 + linhasValores.length * 11 + 6;

  // ─── Cláusulas ───
  const valores: Record<string, string> = {
    enderecoEscola: `${cfg.escola.endereco}, CEP ${cfg.escola.cep}`,
    horaExcedenteValor: cfg.horaExcedente.valor > 0 ? formatarDinheiro(cfg.horaExcedente.valor) : "",
    horaExcedenteUnidade: cfg.horaExcedente.unidade,
    horaExcedenteFracionamento: cfg.horaExcedente.fracionamento,
    horaExcedenteTolerancia: cfg.horaExcedente.tolerancia,
    canalPrivacidade: cfg.escola.canalPrivacidade,
    avisoPrivacidade: cfg.escola.avisoPrivacidade,
    representanteLegal: cfg.escola.representanteLegal,
  };
  CLAUSULAS_2027.forEach((bruto, i) => {
    const texto = preencher(bruto, valores);
    const ehClausula = texto.startsWith("**Cláusula");
    doc.paragrafo(texto, { antes: ehClausula ? 6.5 : 0 });
    if (i === 12) {
      // Cláusula 7ª: quadros de horários e de valores por período
      doc.y += 6;
      doc.tabela(["PERÍODOS", `HORÁRIOS - ${c.anoLetivo}`], cfg.periodos.map((p) => [p.nome, ou(p.horario, 30)]));
      doc.tabela(["PERÍODO", `VALOR ATÉ O VENCIMENTO - ${c.anoLetivo}`], cfg.periodos.map((p) => [p.nome, dinheiro(p.parcelaLiquida)]));
    }
  });

  // ─── Assinaturas ───
  doc.reservar(215);
  doc.y += 10;
  doc.texto(`Niterói, ${dataOuLinha(data)}.`, X0, doc.y, f.times, 10);
  doc.y += 40;
  doc.linha(X0, doc.y, 191, PRETO, 0.7);
  doc.linha(201, doc.y, 361, PRETO, 0.7);
  doc.texto("RESPONSÁVEL FINANCEIRO", X0, doc.y + 3, f.times, 10);
  doc.texto("RESPONSÁVEL PELA GUARDA", 201, doc.y + 3, f.times, 10);
  doc.texto("CONTRATANTE", X0, doc.y + 15, f.times, 10);
  doc.texto(`CPF: ${ou(legal.cpf && formatarCpf(legal.cpf), 20)}`, 201, doc.y + 15, f.times, 10);
  doc.textoAjustado(fam.financeiro.nome, X0, doc.y + 27, 160, f.times, 9);
  doc.textoAjustado(legal.nome, 201, doc.y + 27, 160, f.times, 9);
  doc.y += 62;
  doc.linha(X0, doc.y, 311, PRETO, 0.7);
  doc.texto("ESPAÇO KIDS CRECHE ESCOLA LTDA - CNPJ 31.901.560/0001-40", X0, doc.y + 3, f.times, 10);
  doc.texto("CONTRATADA", X0, doc.y + 15, f.times, 10);
  doc.y += 40;
  doc.texto("Testemunhas:", X0, doc.y, f.times, 10);
  doc.texto("1) Nome: ________________________   2) Nome: ________________________", X0, doc.y + 13, f.times, 10);
  doc.texto("CPF/RG: ________________________   CPF/RG: ________________________", X0, doc.y + 26, f.times, 10);
  doc.texto("Assinatura: ______________________   Assinatura: ______________________", X0, doc.y + 39, f.times, 10);

  // ─── Anexo I ───
  doc.novaPagina();
  doc.centralizado("ANEXO I - AUTORIZAÇÃO FACULTATIVA DE IMAGEM E VOZ", 32, f.helvBold, 10);
  doc.y = 80;
  doc.texto(`Termo separado do contrato - ano letivo de ${c.anoLetivo}`, X0, doc.y, f.timesBold, 10);
  doc.y += 13;
  for (const l of [
    `Aluno(a): ${aluno.nome}`,
    `Responsável legal: ${ou(legal.nome, 50)}`,
    `CPF: ${ou(legal.cpf && formatarCpf(legal.cpf), 20)} | Vínculo/poder de representação: ${ou(legal.vinculo, 20)}`,
    `Contato: ${ou(legal.contato, 20)} | Turma: ${c.turma}`,
  ]) {
    doc.textoAjustado(l, X0, doc.y, X1 - X0, f.times, 10);
    doc.y += 12.8;
  }
  doc.y += 6;
  doc.paragrafo(
    "A ESPAÇO KIDS CRECHE ESCOLA LTDA, CNPJ 31.901.560/0001-40, solicita autorização gratuita e específica para divulgar imagem, voz e, quando escolhido abaixo, produção autoral do aluno em registros de atividades escolares de 2027, para comunicação pedagógica e apresentação institucional. **A escolha é livre: recusar ou revogar não afeta matrícula, notas, atendimento ou participação.** Este termo não autoriza terceiros independentes a explorar os registros.",
  );
  doc.paragrafo("**Marque uma opção em cada linha. Campo em branco ou marcação contraditória significa NÃO AUTORIZADO. A escola não presumirá consentimento.**", { antes: 6 });
  doc.y += 8;

  // quadro de escolhas
  const xEscolha = 420;
  const altLinha = 30;
  const topoQuadro = doc.y;
  doc.pagina.drawRectangle({ x: X0, y: ALTURA - doc.y - 18, width: X1 - X0, height: 18, color: CINZA });
  doc.texto("USO E PÚBLICO", X0 + 5, doc.y + 5, f.helvBold, 9);
  doc.texto("ESCOLHA", xEscolha + 5, doc.y + 5, f.helvBold, 9);
  doc.y += 18;
  const complementos = [
    `Portal: ${ou(cfg.escola.portalAluno)}`,
    "",
    `Endereço do site: ${ou(cfg.escola.siteEscola)}`,
    `Plataformas/perfis específicos: ${ou(cfg.escola.redesSociais)}`,
    "",
    "",
  ];
  LINHAS_ANEXO_IMAGEM.forEach((uso, i) => {
    const escolha = fam.imagem[i];
    const larguraUso = xEscolha - X0 - 10;
    const linhasUso = [...quebrar(uso, f.helv, 8.5, larguraUso), ...(complementos[i] ? [complementos[i]] : [])];
    const altura = Math.max(altLinha, 8 + linhasUso.length * 11);
    linhasUso.forEach((l, k) => doc.textoAjustado(l, X0 + 5, doc.y + 4 + k * 11, larguraUso, f.helv, 8.5));
    doc.texto(`${escolha === "AUTORIZO" ? "(X)" : "( )"} AUTORIZO`, xEscolha + 5, doc.y + 4, escolha === "AUTORIZO" ? f.helvBold : f.helv, 9);
    doc.texto(`${escolha === "NAO_AUTORIZO" ? "(X)" : "( )"} NÃO AUTORIZO`, xEscolha + 5, doc.y + 16, escolha === "NAO_AUTORIZO" ? f.helvBold : f.helv, 9);
    doc.y += altura;
    doc.linha(X0, doc.y, X1);
  });
  doc.pagina.drawRectangle({ x: X0, y: ALTURA - doc.y, width: X1 - X0, height: doc.y - topoQuadro, borderColor: GRADE, borderWidth: 0.6 });
  doc.pagina.drawLine({ start: { x: xEscolha, y: ALTURA - topoQuadro }, end: { x: xEscolha, y: ALTURA - doc.y }, color: GRADE, thickness: 0.6 });
  doc.y += 4;
  doc.texto(
    !emBranco && data
      ? `Escolhas feitas pelo responsável no aplicativo ClassLink em ${data.toLocaleDateString("pt-BR")}, uma a uma, sem opção pré-marcada.`
      : "Marque à mão, ou faça as escolhas no aplicativo ClassLink (opção \"Preencher meus dados\"). Linha sem marcação = NÃO AUTORIZADO.",
    X0,
    doc.y,
    f.helvOblique,
    7.5,
  );
  doc.y += 16;

  doc.paragrafo(
    "**Limites.** Canais públicos ficam acessíveis a público indeterminado e podem permitir cópias por terceiros. Não serão divulgados nome completo, localização em tempo real, rotinas individualizadas ou informações sensíveis. Não se autorizam anúncios pagos, venda/licenciamento a terceiros, reconhecimento facial, treinamento de inteligência artificial ou uso fora das finalidades acima. A escola respeitará a dignidade e a manifestação do menor conforme sua compreensão. Campos de site/perfil devem ser preenchidos antes da escolha; canais não identificados não ficam autorizados.",
  );
  doc.paragrafo(
    "**Prazo e revogação.** Novas divulgações são permitidas somente durante 2027. A partir de 31/12/2027, não haverá novas publicações e os registros serão retirados dos canais sob controle da escola em até 30 dias, salvo nova autorização específica ou dever legal de conservação restrita. O responsável pode revogar a qualquer momento pelo e-mail da secretaria, com protocolo. A escola cessará novos usos e removerá publicações digitais sob seu controle em até 15 dias do pedido, impedindo nova distribuição de impressos. Não se garante recolhimento de exemplares já distribuídos ou cópias independentes de terceiros; a escola adotará medidas razoáveis cabíveis. Preservam-se os direitos da LGPD e a legalidade dos tratamentos anteriores à revogação.",
    { antes: 6.5 },
  );
  doc.paragrafo(
    "Declaro que pude escolher os usos e recebi este termo. A escola verificará a representação legal; o responsável financeiro sem essa qualidade não poderá assinar pelo menor.",
    { antes: 6.5 },
  );
  doc.reservar(90);
  doc.y += 12;
  doc.texto(`Niterói, ${dataOuLinha(data)}.`, X0, doc.y, f.times, 10);
  doc.y += 36;
  doc.linha(X0, doc.y, 311, PRETO, 0.7);
  doc.texto("Assinatura do pai, mãe ou responsável legal", X0, doc.y + 3, f.times, 10);
  if (legal.nome) doc.textoAjustado(legal.nome, X0, doc.y + 15, 280, f.times, 9);
  doc.texto("Recebido pela escola em: ____/____/______ | Por: __________________", X0, doc.y + 32, f.times, 10);

  // ─── Rodapés (precisam do total de páginas) ───
  const paginas = doc.pdf.getPages();
  paginas.forEach((pg, i) => {
    doc.pagina = pg;
    doc.centralizado(cfg.escola.endereco, 778, f.times, 7.8);
    doc.centralizado(
      [cfg.escola.cep && `CEP: ${cfg.escola.cep}`, cfg.escola.telefones && `Tel. ${cfg.escola.telefones}`, cfg.escola.email].filter(Boolean).join(" - "),
      789,
      f.times,
      7.8,
    );
    doc.centralizado(`Contrato ${c.anoLetivo} | Aluno(a): ${aluno.nome} | Página ${i + 1} de ${paginas.length}`, 801, f.helv, 7);
  });

  return doc.pdf.save();
}
