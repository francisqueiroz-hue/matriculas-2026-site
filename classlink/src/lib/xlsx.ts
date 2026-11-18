// Gera um arquivo Excel (.xlsx) simples, sem dependências: planilhas com texto, números,
// valores em reais e fórmulas. O .xlsx é um ZIP de arquivos XML (Office Open XML); aqui o ZIP
// sai sem compressão ("stored"), o que o Excel, o LibreOffice e o Google Planilhas abrem
// normalmente. Funciona no navegador e no servidor.

export type Estilo = "texto" | "moeda" | "titulo" | "moedaNegrito" | "negrito";

export interface CelulaRica {
  valor: string | number | null;
  /** Fórmula sem o "=", ex.: "SUM(B2:B10)". O valor acima vai como resultado já calculado. */
  formula?: string;
  estilo?: Estilo;
}

export type Celula = string | number | null | CelulaRica;

export interface Planilha {
  nome: string;
  linhas: Celula[][];
  /** Largura de cada coluna, em caracteres. */
  larguras?: number[];
  /** Colunas (base 0) cujos números saem como R$. */
  colunasMoeda?: number[];
  /** Primeira linha em negrito, fixa ao rolar e com filtro. */
  cabecalho?: boolean;
  /** Linhas de rodapé (ex.: TOTAL) que ficam fora do filtro. */
  linhasRodape?: number;
}

// Índices em cellXfs (styles.xml).
const XF: Record<Estilo, number> = { texto: 0, moeda: 1, titulo: 2, moedaNegrito: 3, negrito: 4 };

const CONTROLE_INVALIDO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escaparXml(texto: string): string {
  return texto
    .replace(CONTROLE_INVALIDO, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function letraColuna(indice: number): string {
  let n = indice + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Nome de aba aceito pelo Excel: até 31 caracteres, sem : \ / ? * [ ]. */
export function nomeAbaSeguro(nome: string): string {
  const limpo = nome.replace(/[:\\/?*[\]]/g, "-").replace(/^'+|'+$/g, "").trim();
  return (limpo || "Planilha").slice(0, 31);
}

function celulaXml(celula: Celula, ref: string, estiloPadrao: Estilo): string {
  if (celula === null || celula === undefined) return "";
  const rica: CelulaRica = typeof celula === "object" ? celula : { valor: celula };
  const estilo = rica.estilo ?? estiloPadrao;
  const s = XF[estilo] ? ` s="${XF[estilo]}"` : "";
  if (rica.formula) {
    const v = typeof rica.valor === "number" && Number.isFinite(rica.valor) ? `<v>${rica.valor}</v>` : "";
    return `<c r="${ref}"${s}><f>${escaparXml(rica.formula)}</f>${v}</c>`;
  }
  if (typeof rica.valor === "number") {
    if (!Number.isFinite(rica.valor)) return "";
    return `<c r="${ref}"${s}><v>${rica.valor}</v></c>`;
  }
  if (rica.valor === null || rica.valor === "") return s ? `<c r="${ref}"${s}/>` : "";
  // Texto sempre como texto (inlineStr): nada que comece com "=" vira fórmula.
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escaparXml(rica.valor)}</t></is></c>`;
}

function planilhaXml(p: Planilha): string {
  const moeda = new Set(p.colunasMoeda ?? []);
  const nColunas = Math.max(1, ...p.linhas.map((l) => l.length));
  const ultima = `${letraColuna(nColunas - 1)}${Math.max(1, p.linhas.length)}`;
  const linhas = p.linhas
    .map((linha, i) => {
      const r = i + 1;
      const cabecalho = p.cabecalho && i === 0;
      const cels = linha
        .map((c, j) => celulaXml(c, `${letraColuna(j)}${r}`, cabecalho ? "titulo" : moeda.has(j) ? "moeda" : "texto"))
        .join("");
      return `<row r="${r}">${cels}</row>`;
    })
    .join("");
  const views = p.cabecalho
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const cols = p.larguras?.length
    ? `<cols>${p.larguras.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const ultimaFiltrada = p.linhas.length - (p.linhasRodape ?? 0);
  const filtro = p.cabecalho && ultimaFiltrada > 1 ? `<autoFilter ref="A1:${letraColuna(nColunas - 1)}${ultimaFiltrada}"/>` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${ultima}"/>${views}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${linhas}</sheetData>${filtro}</worksheet>`
  );
}

const ESTILOS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function arquivosDoPacote(planilhas: Planilha[]): { nome: string; conteudo: string }[] {
  const nomes = new Set<string>();
  const abas = planilhas.map((p, i) => {
    let nome = nomeAbaSeguro(p.nome);
    // Nomes de aba não podem repetir (o Excel compara sem diferenciar maiúsculas).
    while (nomes.has(nome.toLowerCase())) nome = `${nome.slice(0, 28)} ${i + 1}`;
    nomes.add(nome.toLowerCase());
    return { ...p, nome };
  });
  return [
    {
      nome: "[Content_Types].xml",
      conteudo:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        abas
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join("") +
        `</Types>`,
    },
    {
      nome: "_rels/.rels",
      conteudo:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      nome: "xl/workbook.xml",
      conteudo:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${abas.map((a, i) => `<sheet name="${escaparXml(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        `<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      conteudo:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        abas
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join("") +
        `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { nome: "xl/styles.xml", conteudo: ESTILOS },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: planilhaXml(a) })),
  ];
}

// ---- ZIP (sem compressão) ----

let TABELA_CRC: Uint32Array | null = null;
export function crc32(dados: Uint8Array): number {
  if (!TABELA_CRC) {
    TABELA_CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABELA_CRC[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < dados.length; i++) crc = TABELA_CRC[(crc ^ dados[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipSemCompressao(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let deslocamento = 0;
  // Data fixa (01/01/2026 00:00) no formato DOS: o conteúdo não depende do relógio.
  const dosHora = 0;
  const dosData = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new Uint8Array(30 + nome.length);
    const vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true);
    vl.setUint16(4, 20, true);
    vl.setUint16(6, 0x0800, true); // nomes em UTF-8
    vl.setUint16(8, 0, true); // stored
    vl.setUint16(10, dosHora, true);
    vl.setUint16(12, dosData, true);
    vl.setUint32(14, crc, true);
    vl.setUint32(18, a.dados.length, true);
    vl.setUint32(22, a.dados.length, true);
    vl.setUint16(26, nome.length, true);
    vl.setUint16(28, 0, true);
    local.set(nome, 30);

    const central = new Uint8Array(46 + nome.length);
    const vc = new DataView(central.buffer);
    vc.setUint32(0, 0x02014b50, true);
    vc.setUint16(4, 20, true);
    vc.setUint16(6, 20, true);
    vc.setUint16(8, 0x0800, true);
    vc.setUint16(10, 0, true);
    vc.setUint16(12, dosHora, true);
    vc.setUint16(14, dosData, true);
    vc.setUint32(16, crc, true);
    vc.setUint32(20, a.dados.length, true);
    vc.setUint32(24, a.dados.length, true);
    vc.setUint16(28, nome.length, true);
    vc.setUint32(42, deslocamento, true);
    central.set(nome, 46);

    locais.push(local, a.dados);
    centrais.push(central);
    deslocamento += local.length + a.dados.length;
  }

  const tamanhoCentral = centrais.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const vf = new DataView(fim.buffer);
  vf.setUint32(0, 0x06054b50, true);
  vf.setUint16(8, arquivos.length, true);
  vf.setUint16(10, arquivos.length, true);
  vf.setUint32(12, tamanhoCentral, true);
  vf.setUint32(16, deslocamento, true);

  const partes = [...locais, ...centrais, fim];
  const saida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of partes) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

/** Gera o .xlsx com as planilhas na ordem dada (a primeira abre selecionada). */
export function gerarXlsx(planilhas: Planilha[]): Uint8Array {
  if (planilhas.length === 0) throw new Error("Informe ao menos uma planilha");
  const enc = new TextEncoder();
  return zipSemCompressao(arquivosDoPacote(planilhas).map((a) => ({ nome: a.nome, dados: enc.encode(a.conteudo) })));
}

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
