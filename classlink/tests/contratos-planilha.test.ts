import { describe, expect, it } from "vitest";
import { crc32, escaparXml, gerarXlsx, letraColuna, nomeAbaSeguro } from "@/lib/xlsx";
import {
  mensalidadeDoContrato,
  nomeArquivoPlanilha,
  planilhasDosContratos,
  type ContratoParaPlanilha,
} from "@/lib/contratos-planilha";
import { MODELO_CONTRATO_2027 } from "@/lib/contrato-modelo/tipos";

function contrato(extra: Partial<ContratoParaPlanilha> = {}): ContratoParaPlanilha {
  return {
    titulo: "Contrato 2027",
    anoLetivo: 2027,
    status: "AGUARDANDO_ASSINATURA",
    metodoAssinatura: null,
    assinadoEnviadoEm: null,
    confirmadoPelaEscola: false,
    modelo: MODELO_CONTRATO_2027,
    dadosPreenchidos: false,
    valores: { parcelas: 12, vencimentoDia: 5, parcelaBruta: 1092, parcelaLiquida: 1092, anuidade: 13104, reajuste: null, bolsista: false },
    conferencia: { situacao: "OK", rotulo: "Valor corrigido", valorContrato: 1092, valorEsperado: 1092, assinado: false },
    createdAt: "2026-11-03T15:00:00.000Z",
    student: {
      name: "Ana Souza",
      class: { name: "Grupo 4" },
      guardians: [{ relation: "Mãe", guardian: { name: "Maria Souza", phone: "21999990000" } }],
    },
    ...extra,
  };
}

/** Lê os arquivos de um ZIP sem compressão (como o gerado por gerarXlsx). */
function lerZip(bytes: Uint8Array): Map<string, string> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const arquivos = new Map<string, string>();
  let pos = 0;
  while (dv.getUint32(pos, true) === 0x04034b50) {
    expect(dv.getUint16(pos + 8, true)).toBe(0);
    const tamanho = dv.getUint32(pos + 18, true);
    const nomeLen = dv.getUint16(pos + 26, true);
    const nome = dec.decode(bytes.subarray(pos + 30, pos + 30 + nomeLen));
    const dados = bytes.subarray(pos + 30 + nomeLen, pos + 30 + nomeLen + tamanho);
    expect(crc32(dados)).toBe(dv.getUint32(pos + 14, true));
    arquivos.set(nome, dec.decode(dados));
    pos += 30 + nomeLen + tamanho;
  }
  expect(dv.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  expect(dv.getUint16(bytes.length - 22 + 10, true)).toBe(arquivos.size);
  return arquivos;
}

describe("xlsx sem dependências", () => {
  it("crc32 confere com o valor de referência", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("letras de coluna e nomes de aba", () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(letraColuna)).toEqual(["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA"]);
    expect(nomeAbaSeguro("Mensalidades 2027/[teste]?")).toBe("Mensalidades 2027--teste--");
    expect(nomeAbaSeguro("x".repeat(40))).toHaveLength(31);
  });

  it("texto que parece fórmula fica como texto e o XML é escapado", () => {
    expect(escaparXml(`<a & "b">\u0001`)).toBe("&lt;a &amp; &quot;b&quot;&gt;");
    const zip = lerZip(gerarXlsx([{ nome: "T", linhas: [["=HYPERLINK(\"x\")", 1.5, { valor: 3, formula: "B1*2" }]] }]));
    const folha = zip.get("xl/worksheets/sheet1.xml")!;
    expect(folha).toContain('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t>');
    expect(folha).toContain('<c r="B1"><v>1.5</v></c>');
    expect(folha).toContain('<c r="C1"><f>B1*2</f><v>3</v></c>');
  });

  it("pacote tem as partes que o Excel exige", () => {
    const zip = lerZip(gerarXlsx([{ nome: "A", linhas: [["x"]] }, { nome: "B", linhas: [["y"]] }]));
    expect([...zip.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    expect(zip.get("xl/workbook.xml")).toContain('<sheet name="A" sheetId="1" r:id="rId1"/><sheet name="B" sheetId="2" r:id="rId2"/>');
  });
});

describe("mensalidade do ano corrigida", () => {
  it("contrato com valor corrigido: vale o contrato", () => {
    expect(mensalidadeDoContrato(contrato())).toMatchObject({ parcela: 1092, parcelas: 12, origem: "Contrato", observacao: "" });
  });

  it("contrato sem valor e não assinado: vale o corrigido pelo cadastro", () => {
    const m = mensalidadeDoContrato(
      contrato({
        valores: null,
        conferencia: { situacao: "SEM_VALOR", rotulo: "Sem valor no contrato", valorContrato: 0, valorEsperado: 1092, assinado: false },
      }),
    );
    expect(m).toMatchObject({ parcela: 1092, parcelas: 12, origem: "Corrigido (cadastro)" });
    expect(m.observacao).toContain("Atualizar o contrato no app");
  });

  it("valor diferente e não assinado: vale o corrigido", () => {
    const m = mensalidadeDoContrato(
      contrato({ conferencia: { situacao: "VALOR_DIFERENTE", rotulo: "", valorContrato: 1000, valorEsperado: 1092, assinado: false } }),
    );
    expect(m.parcela).toBe(1092);
    expect(m.observacao).toContain("R$ 1.000,00");
  });

  it("assinado com valor diferente: vale o assinado, com aviso de aditivo", () => {
    const m = mensalidadeDoContrato(
      contrato({ conferencia: { situacao: "VALOR_DIFERENTE", rotulo: "", valorContrato: 1000, valorEsperado: 1092, assinado: true } }),
    );
    expect(m.parcela).toBe(1000);
    expect(m.observacao).toContain("aditivo");
  });

  it("ajustado à mão: vale o contrato", () => {
    const m = mensalidadeDoContrato(
      contrato({ conferencia: { situacao: "AJUSTADO", rotulo: "", valorContrato: 900, valorEsperado: 1092, assinado: false } }),
    );
    expect(m).toMatchObject({ parcela: 900, origem: "Contrato" });
  });

  it("bolsista: isento", () => {
    const m = mensalidadeDoContrato(
      contrato({
        valores: { parcelas: 12, vencimentoDia: 5, parcelaBruta: 0, parcelaLiquida: 0, anuidade: 0, reajuste: null, bolsista: true },
        conferencia: { situacao: "OK", rotulo: "", valorContrato: 0, valorEsperado: 0, assinado: false },
      }),
    );
    expect(m).toMatchObject({ parcela: 0, isento: true });
  });

  it("aluno sem mensalidade no cadastro e contrato em branco: sem valor", () => {
    const m = mensalidadeDoContrato(
      contrato({ valores: null, conferencia: { situacao: "SEM_MENSALIDADE", rotulo: "", valorContrato: 0, valorEsperado: null, assinado: false } }),
    );
    expect(m.parcela).toBeNull();
    expect(m.observacao).toContain("cadastro");
  });

  it("PDF próprio: o app não lê o valor", () => {
    const m = mensalidadeDoContrato(contrato({ modelo: null, valores: null, conferencia: null }));
    expect(m.parcela).toBeNull();
    expect(m.observacao).toContain("PDF próprio");
  });
});

describe("planilhas dos contratos", () => {
  const contratos = [
    contrato({ student: { name: "Bruno", class: { name: "1º Ano A" }, guardians: [] } }),
    contrato({
      valores: null,
      conferencia: { situacao: "SEM_VALOR", rotulo: "Sem valor no contrato", valorContrato: 0, valorEsperado: 546.01, assinado: false },
    }),
  ];
  const [mensalidades, lista] = planilhasDosContratos(contratos, 2027);

  it("abas Mensalidades 2027 e Contratos 2027", () => {
    expect(mensalidades.nome).toBe("Mensalidades 2027");
    expect(lista.nome).toBe("Contratos 2027");
    expect(lista.linhas).toHaveLength(3);
  });

  it("12 meses com vencimento dia 05, total = parcela × 12 e linha de TOTAL", () => {
    const cab = mensalidades.linhas[0] as string[];
    expect(cab[6]).toBe("Jan/2027 (venc. 05/01)");
    expect(cab[17]).toBe("Dez/2027 (venc. 05/12)");
    // Ordem por turma: "1º Ano A" (Bruno) antes de "Grupo 4" (Ana).
    const ana = mensalidades.linhas[2];
    expect(ana[0]).toBe("Ana Souza");
    expect(ana[5]).toBe(546.01);
    expect(ana[6]).toEqual({ valor: 546.01, formula: "$F3" });
    expect(ana[18]).toEqual({ valor: 6552.12, formula: "SUM(G3:R3)" });
    const total = mensalidades.linhas[3];
    expect(total[0]).toEqual({ valor: "TOTAL", estilo: "negrito" });
    expect(total[18]).toMatchObject({ valor: 13104 + 6552.12, formula: "SUM(S2:S3)" });
  });

  it("nome do arquivo com a data de hoje", () => {
    expect(nomeArquivoPlanilha(2027, new Date("2026-11-18T15:00:00Z"))).toBe("Contratos 2027 - Mensalidades 2027 - 18-11-2026.xlsx");
  });
});
