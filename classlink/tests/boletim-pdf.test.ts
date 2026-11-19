import { NextRequest } from "next/server";
import { PDFDocument, PDFPage } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  student: { findFirst: vi.fn(), findMany: vi.fn() },
  class: { findFirst: vi.fn() },
  school: { findUnique: vi.fn() },
  disciplina: { findMany: vi.fn() },
  nota: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  classTeacher: { findMany: vi.fn() },
  boletimModelo: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/visibilidade-server", () => ({ exigirArea: async () => {} }));

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

import { GET as pdfAluno } from "@/app/api/notas/[studentId]/pdf/route";
import { GET as pdfTurma } from "@/app/api/notas/turma/[classId]/pdf/route";
import { GET as editavel } from "@/app/api/notas/boletim-editavel/route";
import { GET as lerModelo, PUT as salvarModelo } from "@/app/api/notas/boletim-modelo/route";
import { POST as pdfEditado } from "@/app/api/notas/boletim-pdf/route";
import { ESPACAMENTO_COMPACTO, distribuirSobra, gerarBoletimPdf, nomeArquivoBoletim, type BoletimParaImpressao } from "@/lib/boletim-pdf";
import { MODELO_PADRAO, calcularLinhas, errosDoBoletim, localDataPadrao, modeloDe } from "@/lib/boletim-modelo";
import { linhasDoBoletim } from "@/lib/boletim";

const ctxAluno = { params: Promise.resolve({ studentId: "al1" }) } as never;
const ctxTurma = { params: Promise.resolve({ classId: "t1" }) } as never;
const req = () => new NextRequest("http://t");
const aluno = (id: string, name: string) => ({ id, name, classId: "t1", class: { name: "1º Ano A", year: 2026 } });
const ALUNOS = [aluno("al1", "Maria Ávila"), aluno("al2", "João Conceição")];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  atual.sub = "dir";
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => PERFIS[where.id] ?? null);
  prismaMock.student.findFirst.mockResolvedValue(aluno("al1", "Maria Ávila"));
  prismaMock.student.findMany.mockImplementation(async ({ where }: { where: { id?: string | { in: string[] } } }) => {
    if (typeof where.id === "string") return ALUNOS.filter((a) => a.id === where.id);
    if (where.id && "in" in where.id) return ALUNOS.filter((a) => (where.id as { in: string[] }).in.includes(a.id));
    return ALUNOS;
  });
  prismaMock.classTeacher.findMany.mockResolvedValue([{ classId: "t1", teacher: { name: "Prof. Helena" } }]);
  prismaMock.boletimModelo.findUnique.mockResolvedValue(null);
  prismaMock.boletimModelo.upsert.mockResolvedValue({});
  prismaMock.class.findFirst.mockResolvedValue({ name: "1º Ano A", year: 2026 });
  prismaMock.school.findUnique.mockResolvedValue({ name: "Escola Fokus" });
  prismaMock.disciplina.findMany.mockResolvedValue([{ id: "d1", nome: "Matemática" }, { id: "d2", nome: "Português" }]);
  prismaMock.nota.findMany.mockResolvedValue([
    { studentId: "al1", disciplinaId: "d1", trimestre: "PRIMEIRO", trabalho: 8, teste: 7, prova: 9 },
  ]);
});

describe("boletim em PDF: quem exporta", () => {
  it("direção e coordenação baixam o PDF do aluno e da turma", async () => {
    for (const sub of ["dir", "coord"]) {
      atual.sub = sub;
      const r1 = await pdfAluno(req(), ctxAluno);
      expect(r1.status).toBe(200);
      expect(r1.headers.get("Content-Type")).toBe("application/pdf");
      expect(r1.headers.get("Cache-Control")).toContain("no-store");
      const r2 = await pdfTurma(req(), ctxTurma);
      expect(r2.status).toBe(200);
      const doc = await PDFDocument.load(new Uint8Array(await r2.arrayBuffer()));
      expect(doc.getPageCount()).toBe(2); // cada aluno numa página nova
    }
  });

  it("secretaria, professor, auxiliar e família não exportam", async () => {
    for (const sub of ["sec", "prof", "aux", "fam"]) {
      atual.sub = sub;
      expect((await pdfAluno(req(), ctxAluno)).status).toBe(403);
      expect((await pdfTurma(req(), ctxTurma)).status).toBe(403);
    }
    expect(prismaMock.nota.findMany).not.toHaveBeenCalled();
  });

  it("aluno ou turma de outra escola: 404 (a consulta filtra pela escola da sessão)", async () => {
    prismaMock.student.findFirst.mockResolvedValue(null);
    prismaMock.class.findFirst.mockResolvedValue(null);
    expect((await pdfAluno(req(), ctxAluno)).status).toBe(404);
    expect((await pdfTurma(req(), ctxTurma)).status).toBe(404);
    expect(prismaMock.student.findFirst.mock.calls[0][0].where).toMatchObject({ id: "al1", schoolId: "s1", deletedAt: null });
  });
});

describe("conteúdo do boletim", () => {
  it("mesmo cálculo da tela: média ponderada do trimestre e situação", () => {
    const [mat, por] = linhasDoBoletim(
      [{ id: "d1", nome: "Matemática" }, { id: "d2", nome: "Português" }],
      [{ disciplinaId: "d1", trimestre: "PRIMEIRO", trabalho: 8, teste: 7, prova: 9 }],
    );
    expect(mat.trimestres.PRIMEIRO.media).toBe(8.15); // (8*3 + 7*7 + 9*10) / 20
    expect(mat.situacao).toBe("EM_ANDAMENTO");
    expect(por.trimestres.PRIMEIRO.media).toBeNull();
  });

  it("gera PDF válido com acentos e troca o que a fonte não desenha", async () => {
    const pdf = await gerarBoletimPdf({ modelo: { ...MODELO_PADRAO, cabecalho: ["Escola Fokus 🎒"] }, ano: 2026 }, [boletim("Conceição Ávila", 2)]);
    expect(new TextDecoder("latin1").decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it("muitas disciplinas continuam na página seguinte, sem perder nenhuma", async () => {
    // Só o que vai para o PDF final (o ensaio de medida usa outra folha, sem título).
    const desenhos: { doc: PDFDocument; t: string }[] = [];
    const original = PDFPage.prototype.drawText;
    const espiao = vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, t, o) {
      desenhos.push({ doc: this.doc, t });
      return original.call(this, t, o);
    });
    try {
      const pdf = await gerarBoletimPdf({ modelo: MODELO_PADRAO, ano: 2026 }, [boletim("Maria", 60), boletim("João", 2)]);
      // Maria: 60 linhas não cabem numa página (a tabela continua na 2ª, com gráfico e assinaturas); João começa numa página nova.
      expect((await PDFDocument.load(pdf)).getPageCount()).toBe(3);
    } finally {
      espiao.mockRestore();
    }
    const desenhados = desenhos.filter((d) => d.doc.getTitle()).map((d) => d.t);
    for (let i = 0; i < 60; i++) expect(desenhados).toContain(`DISCIPLINA ${i + 1}`);
    expect(desenhados.filter((t) => t.includes("Maria (continuação)")).length).toBeGreaterThanOrEqual(1);
    expect(desenhados.filter((t) => t.startsWith("Responsável pedagógico"))).toHaveLength(2); // assinaturas uma vez por aluno
    expect(desenhados).toContain(MODELO_PADRAO.cabecalho[0]);
    expect(desenhados).toContain(MODELO_PADRAO.rodape[0]);
  });

  it("boletim de uma página ocupa a folha: linhas maiores, vãos e assinaturas no pé", async () => {
    const posicoes: { doc: PDFDocument; t: string; y: number }[] = [];
    const original = PDFPage.prototype.drawText;
    const espiao = vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, t, o) {
      posicoes.push({ doc: this.doc, t, y: o?.y ?? 0 });
      return original.call(this, t, o);
    });
    try {
      for (const n of [3, 10, 25]) {
        posicoes.length = 0;
        const pdf = await gerarBoletimPdf({ modelo: MODELO_PADRAO, ano: 2026 }, [boletim("Maria", n)]);
        expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1); // até 25 disciplinas cabem numa folha
        const finais = posicoes.filter((p) => p.doc.getTitle());
        const ass = finais.find((p) => p.t.startsWith("Responsável pedagógico"));
        // Assinatura do responsável logo acima do rodapé (antes ficava no meio da folha).
        expect(ass!.y).toBeLessThan(110);
        expect(ass!.y).toBeGreaterThan(60);
      }
    } finally {
      espiao.mockRestore();
    }
  });

  it("reparte a sobra sem passar dela", () => {
    expect(distribuirSobra(0, { linhas: 10, grafico: true, vaos: 3 })).toEqual(ESPACAMENTO_COMPACTO);
    for (const [sobra, linhas, grafico, vaos] of [[250, 10, true, 3], [500, 3, true, 2], [300, 10, false, 2], [40, 20, true, 3]] as const) {
      const e = distribuirSobra(sobra, { linhas, grafico, vaos });
      const usado =
        (e.hLinha - ESPACAMENTO_COMPACTO.hLinha) * linhas +
        2 * (e.hCabecalho - ESPACAMENTO_COMPACTO.hCabecalho) +
        (e.alturaBarras - ESPACAMENTO_COMPACTO.alturaBarras) * (grafico ? 1 : 0) +
        e.vao * vaos;
      expect(usado).toBeLessThanOrEqual(sobra);
      expect(e.hLinha).toBeLessThanOrEqual(21);
      expect(e.assinaturasNoPe).toBe(true);
    }
  });

  it("média final, frequência e situação a partir dos valores do formulário", () => {
    const b = boletim("Maria", 1);
    b.linhas[0].trimestres = [{ nota: "5,5", faltas: "2" }, { nota: "7", faltas: "0" }, { nota: "6", faltas: "3" }];
    b.aulasDadas = ["50", "50", "50"];
    const [l] = calcularLinhas(b);
    expect(l.media).toBe(6.17);
    expect(l.situacao).toBe("Aprovado");
    expect(l.trimestres[0].freq).toBe(96);
    expect(l.faltasTotal).toBe(5);
    expect(l.freqTotal).toBe(97);
    b.linhas[0].trimestres[2].nota = "";
    expect(calcularLinhas(b)[0]).toMatchObject({ media: null, mediaParcial: 6.25, situacao: "Em andamento" });
    b.linhas[0].trimestres[1].nota = "11";
    b.aulasDadas[0] = "x";
    expect(errosDoBoletim(b)).toHaveLength(2);
  });

  it("modelo salvo antigo ou incompleto é completado com o padrão", () => {
    expect(modeloDe(null)).toEqual(MODELO_PADRAO);
    expect(modeloDe({ cidade: "Rio de Janeiro" })).toEqual({ ...MODELO_PADRAO, cidade: "Rio de Janeiro" });
    expect(localDataPadrao("Niterói", new Date("2026-09-15T15:00:00Z"))).toBe("Niterói, 15 de setembro de 2026.");
  });

  it("nome do arquivo sem acentos nem espaços", () => {
    expect(nomeArquivoBoletim(2026, "Maria Conceição Ávila")).toBe("boletim-2026-maria-conceicao-avila.pdf");
  });
});

function boletim(nome: string, disciplinas: number): BoletimParaImpressao {
  return {
    studentId: "al1",
    aluno: nome,
    turma: "5º Ano",
    linhas: Array.from({ length: disciplinas }, (_, i) => ({
      disciplina: `Disciplina ${i + 1}`,
      trimestres: [{ nota: "8,5", faltas: "1" }, { nota: "5", faltas: "" }, { nota: "", faltas: "" }],
    })),
    aulasDadas: ["40", "", ""],
    observacoes: "",
    localData: "Niterói, 18 de novembro de 2026.",
    professor: "Prof. Exemplo",
    coordenacao: "",
    responsavelPedagogico: "",
  };
}

describe("boletim editável antes do PDF", () => {
  const reqEditavel = (q: string) => new NextRequest(`http://t/api/notas/boletim-editavel?${q}`);
  const reqJson = (url: string, method: string, corpo: unknown) => new NextRequest(url, { method, body: JSON.stringify(corpo) });

  it("direção e coordenação recebem o boletim preenchido com as notas, o professor da turma e o modelo", async () => {
    for (const sub of ["dir", "coord"]) {
      atual.sub = sub;
      const r = await editavel(reqEditavel("aluno=al1"));
      expect(r.status).toBe(200);
      const d = await r.json();
      expect(d.modelo).toEqual(MODELO_PADRAO);
      expect(d.boletins).toHaveLength(1);
      expect(d.boletins[0]).toMatchObject({ studentId: "al1", aluno: "Maria Ávila", turma: "1º Ano A", professor: "Prof. Helena", aulasDadas: ["", "", ""] });
      expect(d.boletins[0].linhas[0]).toEqual({ disciplina: "Matemática", trimestres: [{ nota: "8,15", faltas: "" }, { nota: "", faltas: "" }, { nota: "", faltas: "" }] });
    }
    expect((await (await editavel(reqEditavel("turma=t1"))).json()).boletins).toHaveLength(2);
  });

  it("secretaria, professor, auxiliar e família não editam, não salvam o modelo e não geram", async () => {
    for (const sub of ["sec", "prof", "aux", "fam"]) {
      atual.sub = sub;
      expect((await editavel(reqEditavel("aluno=al1"))).status).toBe(403);
      expect((await lerModelo()).status).toBe(403);
      expect((await salvarModelo(reqJson("http://t/api/notas/boletim-modelo", "PUT", MODELO_PADRAO))).status).toBe(403);
      expect((await pdfEditado(reqJson("http://t/api/notas/boletim-pdf", "POST", { modelo: MODELO_PADRAO, boletins: [boletim("x", 1)] }))).status).toBe(403);
    }
    expect(prismaMock.boletimModelo.upsert).not.toHaveBeenCalled();
  });

  it("salva o modelo da escola (por escola, com quem editou)", async () => {
    atual.sub = "coord";
    const modelo = { ...MODELO_PADRAO, coordenacao: "Coordenadora Exemplo" };
    expect((await salvarModelo(reqJson("http://t/api/notas/boletim-modelo", "PUT", modelo))).status).toBe(200);
    expect(prismaMock.boletimModelo.upsert.mock.calls[0][0]).toMatchObject({ where: { schoolId: "s1" }, update: { dados: modelo, editadoPorId: "coord" } });
  });

  it("gera o PDF com os valores editados, sem gravar notas; nome do aluno vem do cadastro", async () => {
    const editado = { ...boletim("Nome digitado", 3), studentId: "al2" };
    const { aluno: _a, ...corpo } = editado;
    void _a;
    const r = await pdfEditado(reqJson("http://t/api/notas/boletim-pdf", "POST", { modelo: MODELO_PADRAO, boletins: [corpo] }));
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Disposition")).toContain("boletim-2026-joao-conceicao.pdf");
    expect(prismaMock.student.findMany.mock.calls.at(-1)![0].where).toMatchObject({ schoolId: "s1", deletedAt: null });
  });

  it("aluno de outra escola: 404; nota inválida: 400 com a mensagem", async () => {
    const { aluno: _a, ...corpo } = boletim("x", 1);
    void _a;
    expect((await pdfEditado(reqJson("http://t/api/notas/boletim-pdf", "POST", { modelo: MODELO_PADRAO, boletins: [{ ...corpo, studentId: "outra" }] }))).status).toBe(404);
    corpo.linhas[0].trimestres[0].nota = "12";
    const r = await pdfEditado(reqJson("http://t/api/notas/boletim-pdf", "POST", { modelo: MODELO_PADRAO, boletins: [corpo] }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/nota "12" inválida/);
  });
});
