import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  student: { findFirst: vi.fn(), findMany: vi.fn() },
  disciplina: { findMany: vi.fn() },
  nota: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  historicoModelo: { findUnique: vi.fn(), upsert: vi.fn() },
  historicoEscolar: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/visibilidade-server", () => ({ exigirArea: async () => {} }));
vi.mock("@/lib/historico-pdf", async (orig) => {
  const real = await orig<typeof import("@/lib/historico-pdf")>();
  return { ...real, gerarHistoricoPdf: vi.fn(real.gerarHistoricoPdf) };
});

type Perfil = { role: "ADMIN" | "STAFF" | "GUARDIAN"; funcao: string | null; isCoordenacao: boolean };
const PERFIS: Record<string, Perfil> = {
  dir: { role: "ADMIN", funcao: "DIRECAO", isCoordenacao: false },
  sec: { role: "ADMIN", funcao: "SECRETARIA", isCoordenacao: false },
  coord: { role: "STAFF", funcao: "COORDENACAO", isCoordenacao: true },
  prof: { role: "STAFF", funcao: "PROFESSOR", isCoordenacao: false },
  aux: { role: "STAFF", funcao: "AUXILIAR", isCoordenacao: false },
  fam: { role: "GUARDIAN", funcao: null, isCoordenacao: false },
};
const atual = vi.hoisted(() => ({ sub: "dir" }));
vi.mock("@/lib/session", async (orig) => {
  const real = await orig<typeof import("@/lib/session")>();
  return {
    ...real,
    requireRole: vi.fn(async (...roles: string[]) => {
      const role = PERFIS[atual.sub].role;
      if (!roles.includes(role)) throw new real.AuthError("Acesso negado", 403);
      return { sub: atual.sub, role, schoolId: "s1" };
    }),
  };
});

import { GET, PUT } from "@/app/api/historico/route";
import { PUT as salvarModelo } from "@/app/api/historico/modelo/route";
import { POST as pdf } from "@/app/api/historico/pdf/route";
import {
  MODELO_HISTORICO_PADRAO,
  ajustarColunas,
  aplicarMedias,
  colunaDaTurma,
  historicoAlunoSchema,
  nomeArquivoHistorico,
  pendenciasDoHistorico,
  type HistoricoAluno,
} from "@/lib/historico-escolar";
import { gerarHistoricoPdf } from "@/lib/historico-pdf";

const ALUNO = {
  id: "al1",
  name: "Hugo Teste da Silva",
  birthDate: new Date("2010-09-03T00:00:00Z"),
  codigoInep: "213335095969",
  class: { name: "4º Ano A", year: 2026 },
  guardians: [
    { relation: "Pai", guardian: { name: "Rodrigo Teste" } },
    { relation: "Mãe", guardian: { name: "Carolina Teste" } },
  ],
};
const get = (q = "") => GET(new NextRequest(`http://t/api/historico${q}`));
const corpo = (url: string, dados: unknown, method = "PUT") => new NextRequest(url, { method, body: JSON.stringify(dados) });

/** Histórico de exemplo (dados fictícios). */
function exemplo(): HistoricoAluno {
  const series = MODELO_HISTORICO_PADRAO.series;
  return {
    studentId: "al1",
    aluno: { nome: "Hugo Teste da Silva", codigoInep: "123456789012", naturalidade: "São Gonçalo/RJ", nacionalidade: "Brasileira", nascimento: "03/09/2010", filiacao: "Carolina Teste e Rodrigo Teste" },
    series,
    disciplinas: MODELO_HISTORICO_PADRAO.disciplinas.map((nome, i) => ({ nome, notas: i < 7 ? ["", "8,5", "8,8", "9,0", ""] : ["X", "X", "X", "X", ""] })),
    cargaHoraria: ["800", "800", "800", "800", ""],
    frequencia: ["99%", "84%", "100%", "99%", ""],
    resultado: ["Aprovado", "Aprovado", "Aprovado", "Aprovado", ""],
    estudos: [
      { serie: "1º ano", ano: "2022", estabelecimento: "Escola Anterior", municipio: "São Gonçalo" },
      { serie: "2º ano", ano: "2023", estabelecimento: "Instituto Fokus", municipio: "Niterói" },
    ],
    observacoes: "Aluno recebido por transferência em 2023.",
    localData: "Niterói, 26 de novembro de 2026.",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  atual.sub = "dir";
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => PERFIS[where.id] ?? null);
  prismaMock.student.findFirst.mockResolvedValue(ALUNO);
  prismaMock.student.findMany.mockResolvedValue([{ id: "al1", name: ALUNO.name, class: { name: "4º Ano A" }, historicoEscolar: null }]);
  prismaMock.historicoModelo.findUnique.mockResolvedValue(null);
  prismaMock.historicoEscolar.findUnique.mockResolvedValue(null);
  prismaMock.historicoEscolar.upsert.mockResolvedValue({ updatedAt: new Date("2026-11-26T12:00:00Z") });
  prismaMock.historicoModelo.upsert.mockResolvedValue({});
  prismaMock.disciplina.findMany.mockResolvedValue([
    { id: "d1", nome: "Matemática" },
    { id: "d2", nome: "Robótica" },
  ]);
  const n = (disciplinaId: string, trimestre: string, v: number) => ({ studentId: "al1", disciplinaId, trimestre, trabalho: v, teste: v, prova: v });
  prismaMock.nota.findMany.mockResolvedValue([n("d1", "PRIMEIRO", 8), n("d1", "SEGUNDO", 9), n("d1", "TERCEIRO", 10), n("d2", "PRIMEIRO", 7), n("d2", "SEGUNDO", 7), n("d2", "TERCEIRO", 7)]);
});

describe("histórico escolar: quem emite", () => {
  it("secretaria só visualiza: abre a lista e o histórico, mas não salva, não muda o modelo e não gera PDF", async () => {
    atual.sub = "sec";
    expect((await get()).status).toBe(200);
    expect((await get("?aluno=al1")).status).toBe(200);
    expect((await PUT(corpo("http://t/api/historico", exemplo()))).status).toBe(403);
    expect((await salvarModelo(corpo("http://t/api/historico/modelo", MODELO_HISTORICO_PADRAO))).status).toBe(403);
    expect((await pdf(corpo("http://t/api/historico/pdf", { modelo: MODELO_HISTORICO_PADRAO, historico: exemplo() }, "POST"))).status).toBe(403);
    expect(prismaMock.historicoEscolar.upsert).not.toHaveBeenCalled();
    expect(prismaMock.historicoModelo.upsert).not.toHaveBeenCalled();
  });

  it("direção e coordenação abrem, salvam e geram o PDF", async () => {
    for (const sub of ["dir", "coord"]) {
      atual.sub = sub;
      expect((await get()).status).toBe(200);
      expect((await get("?aluno=al1")).status).toBe(200);
      expect((await PUT(corpo("http://t/api/historico", exemplo()))).status).toBe(200);
      const r = await pdf(corpo("http://t/api/historico/pdf", { modelo: MODELO_HISTORICO_PADRAO, historico: exemplo() }, "POST"));
      expect(r.status).toBe(200);
      expect(r.headers.get("Content-Type")).toBe("application/pdf");
      expect(r.headers.get("Cache-Control")).toContain("no-store");
    }
  });

  it("professor, auxiliar e família não acessam", async () => {
    for (const sub of ["prof", "aux", "fam"]) {
      atual.sub = sub;
      expect((await get()).status).toBe(403);
      expect((await get("?aluno=al1")).status).toBe(403);
      expect((await PUT(corpo("http://t/api/historico", exemplo()))).status).toBe(403);
      expect((await salvarModelo(corpo("http://t/api/historico/modelo", MODELO_HISTORICO_PADRAO))).status).toBe(403);
      expect((await pdf(corpo("http://t/api/historico/pdf", { modelo: MODELO_HISTORICO_PADRAO, historico: exemplo() }, "POST"))).status).toBe(403);
    }
    expect(prismaMock.historicoEscolar.upsert).not.toHaveBeenCalled();
  });

  it("aluno de outra escola: 404 e nada é gravado", async () => {
    prismaMock.student.findFirst.mockResolvedValue(null);
    expect((await get("?aluno=al1")).status).toBe(404);
    expect((await PUT(corpo("http://t/api/historico", exemplo()))).status).toBe(404);
    expect((await pdf(corpo("http://t/api/historico/pdf", { modelo: MODELO_HISTORICO_PADRAO, historico: exemplo() }, "POST"))).status).toBe(404);
    expect(prismaMock.student.findFirst.mock.calls[0][0].where).toMatchObject({ id: "al1", schoolId: "s1", deletedAt: null });
    expect(prismaMock.historicoEscolar.upsert).not.toHaveBeenCalled();
  });
});

describe("histórico preenchido com o que o app sabe", () => {
  it("nome, nascimento, filiação (mãe primeiro), ano em curso e médias fechadas", async () => {
    const d = await (await get("?aluno=al1")).json();
    const h = d.historico as HistoricoAluno;
    expect(h.aluno).toMatchObject({ nome: "Hugo Teste da Silva", nascimento: "03/09/2010", filiacao: "Carolina Teste e Rodrigo Teste", codigoInep: "213335095969" });
    expect(h.estudos).toEqual([{ serie: "4º ano", ano: "2026", estabelecimento: "Instituto Fokus", municipio: "Niterói" }]);
    const mat = h.disciplinas.find((x) => x.nome === "Matemática")!;
    expect(mat.notas).toEqual(["", "", "", "9,0", ""]);
    // Componente do app que não está na lista padrão entra no fim.
    expect(h.disciplinas.at(-1)).toEqual({ nome: "Robótica", notas: ["", "", "", "7,0", ""] });
    expect(d.salvoEm).toBeNull();
  });

  it("histórico salvo volta como foi salvo (com a data de hoje)", async () => {
    const { studentId: _s, ...dados } = exemplo();
    void _s;
    prismaMock.historicoEscolar.findUnique.mockResolvedValue({ dados, updatedAt: new Date("2026-11-20T10:00:00Z") });
    const d = await (await get("?aluno=al1")).json();
    // O INEP vem sempre do cadastro, mesmo que o histórico salvo tenha outro.
    expect(d.historico.aluno.codigoInep).toBe("213335095969");
    expect(d.historico.estudos).toHaveLength(2);
    expect(d.salvoEm).toBeTruthy();
  });

  it("salvar grava por aluno e escola, sem o id dentro dos dados", async () => {
    await PUT(corpo("http://t/api/historico", exemplo()));
    const arg = prismaMock.historicoEscolar.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ studentId: "al1" });
    expect(arg.create).toMatchObject({ schoolId: "s1", studentId: "al1", editadoPorId: "dir" });
    expect(arg.create.dados.studentId).toBeUndefined();
    expect(arg.create.dados.aluno.codigoInep).toBe(""); // o INEP mora no cadastro do aluno
  });

  it("o PDF usa o INEP do cadastro, não o que veio da tela", async () => {
    const h = exemplo();
    h.aluno.codigoInep = "999999999999";
    const r = await pdf(corpo("http://t/api/historico/pdf", { modelo: MODELO_HISTORICO_PADRAO, historico: h }, "POST"));
    expect(r.status).toBe(200);
    const usado = vi.mocked(gerarHistoricoPdf).mock.calls[0][1];
    expect(usado.aluno.codigoInep).toBe("213335095969");
  });

  it("dados com quantidade de anos diferente da tabela são recusados com mensagem clara", async () => {
    const h = exemplo();
    h.cargaHoraria = ["800"];
    const r = await PUT(corpo("http://t/api/historico", h));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("anos");
  });
});

describe("regras do histórico", () => {
  it("coluna do ano pelo nome da turma", () => {
    const s = MODELO_HISTORICO_PADRAO.series;
    expect(colunaDaTurma("1º Ano A", s)).toBe(0);
    expect(colunaDaTurma("3° ano - tarde", s)).toBe(2);
    expect(colunaDaTurma("5 ano", s)).toBe(4);
    expect(colunaDaTurma("Infantil 3", s)).toBe(-1);
  });

  it("incluir e tirar ano mantém as notas já digitadas", () => {
    const mais = ajustarColunas(exemplo(), [...MODELO_HISTORICO_PADRAO.series, "6º ano"]);
    expect(mais.disciplinas[0].notas).toEqual(["", "8,5", "8,8", "9,0", "", ""]);
    expect(historicoAlunoSchema.safeParse(mais).success).toBe(true);
    const menos = ajustarColunas(exemplo(), MODELO_HISTORICO_PADRAO.series.slice(0, 2));
    expect(menos.resultado).toEqual(["Aprovado", "Aprovado"]);
  });

  it("médias do app casam o nome sem acento e não mexem nas outras colunas", () => {
    const medias = new Map([["educacao fisica", { nome: "Educação Física", media: "9,5" }]]);
    const r = aplicarMedias(exemplo(), 4, medias);
    expect(r.preenchidas).toBe(1);
    expect(r.historico.disciplinas.find((d) => d.nome === "Educação Física")!.notas).toEqual(["", "8,5", "8,8", "9,0", "9,5"]);
  });

  it("abreviações do cadastro de disciplinas casam com os nomes do histórico", async () => {
    const { mesmoComponente } = await import("@/lib/historico-escolar");
    expect(mesmoComponente("L. Portuguesa", "Língua Portuguesa")).toBe(true);
    expect(mesmoComponente("Ed. Física", "Educação Física")).toBe(true);
    expect(mesmoComponente("Orient. Educ", "Orientação Educacional")).toBe(true);
    expect(mesmoComponente("Artes", "Arte")).toBe(true);
    expect(mesmoComponente("Ed. Física", "Educação Financeira")).toBe(false);
    expect(mesmoComponente("Ed. Ambiental", "Educação Financeira")).toBe(false);
    expect(mesmoComponente("História", "Geografia")).toBe(false);
  });

  it("pendências avisam o que costuma faltar", () => {
    const h = exemplo();
    h.aluno.codigoInep = "";
    const p = pendenciasDoHistorico(h, MODELO_HISTORICO_PADRAO);
    expect(p.some((x) => x.includes("cadastro do aluno"))).toBe(true);
    // O modelo padrão já traz quem assina.
    expect(p.some((x) => x.includes("Secretária Escolar"))).toBe(false);
    const semNome = {
      ...MODELO_HISTORICO_PADRAO,
      assinantes: MODELO_HISTORICO_PADRAO.assinantes.map((a) => ({ ...a, nome: "" })),
    };
    expect(pendenciasDoHistorico(h, semNome).some((x) => x.includes("Secretária Escolar"))).toBe(true);
  });

  it("modelo padrão: endereço na Rua e assinantes da escola", () => {
    expect(MODELO_HISTORICO_PADRAO.cabecalho.some((l) => l.startsWith("Rua Professor Carlos Nelson"))).toBe(true);
    expect(MODELO_HISTORICO_PADRAO.assinantes).toEqual([
      { cargo: "Secretária Escolar", nome: "Kamilla de Sousa Rangel", registro: "" },
      { cargo: "Diretor Pedagógico", nome: "Francis Wagner de Queiroz Ribeiro", registro: "" },
    ]);
  });

  it("nome do arquivo sem acento", () => {
    expect(nomeArquivoHistorico("João Conceição")).toBe("historico-escolar-joao-conceicao.pdf");
  });
});

describe("PDF do histórico", () => {
  it("cabe numa folha A4 no caso comum", async () => {
    const doc = await PDFDocument.load(await gerarHistoricoPdf(MODELO_HISTORICO_PADRAO, exemplo()));
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
  });

  it("nome e filiação longos não são cortados: quebram em mais linhas", async () => {
    const h = exemplo();
    h.aluno.nome = "Maria Eduarda ".repeat(10).trim();
    h.aluno.filiacao = "Fulana de Tal da Silva Santos ".repeat(10).trim();
    const pdfMod = await import("@/lib/historico-pdf");
    const doc = await PDFDocument.load(await pdfMod.gerarHistoricoPdf(MODELO_HISTORICO_PADRAO, h));
    expect(doc.getPageCount()).toBe(1);
  });

  it("muitos componentes e anos continuam na folha seguinte, sem erro", async () => {
    const series = Array.from({ length: 9 }, (_, i) => `${i + 1}º ano`);
    const base = ajustarColunas(exemplo(), series);
    const h = {
      ...base,
      disciplinas: Array.from({ length: 30 }, (_, i) => ({ nome: `Componente ${i + 1} 😀`, notas: series.map(() => "10,0") })),
      estudos: Array.from({ length: 15 }, (_, i) => ({ serie: `${(i % 9) + 1}º ano`, ano: String(2012 + i), estabelecimento: "Escola", municipio: "Niterói" })),
      observacoes: "Texto longo. ".repeat(60),
    };
    const doc = await PDFDocument.load(await gerarHistoricoPdf(MODELO_HISTORICO_PADRAO, h));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});

describe("código INEP no cadastro do aluno", () => {
  it("aceita 12 dígitos (com ou sem pontuação) ou vazio; recusa outro tamanho", async () => {
    const { updateStudentSchema } = await import("@/lib/validators");
    expect(updateStudentSchema.parse({ codigoInep: "2133.3509.5969" }).codigoInep).toBe("213335095969");
    expect(updateStudentSchema.parse({ codigoInep: "" }).codigoInep).toBe("");
    expect(updateStudentSchema.safeParse({ codigoInep: "123" }).success).toBe(false);
  });

  it("mudança do INEP entra no histórico de alterações do cadastro", async () => {
    const { alteracoesAluno } = await import("@/lib/historico-cadastro");
    const turma = { id: "t1", name: "4º Ano A", year: 2026 };
    const base = { nome: "Hugo", turma, nascimento: null };
    expect(alteracoesAluno({ ...base, codigoInep: null }, { ...base, codigoInep: "213335095969" })).toEqual([
      { campo: "codigoInep", valorAnterior: null, valorNovo: "213335095969" },
    ]);
    expect(alteracoesAluno({ ...base, codigoInep: "1" }, base)).toEqual([]);
  });
});
