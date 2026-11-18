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
import { gerarBoletimPdf, nomeArquivoBoletim } from "@/lib/boletim-pdf";
import { linhasDoBoletim } from "@/lib/boletim";

const ctxAluno = { params: Promise.resolve({ studentId: "al1" }) } as never;
const ctxTurma = { params: Promise.resolve({ classId: "t1" }) } as never;
const req = () => new NextRequest("http://t");
const aluno = (id: string, name: string) => ({ id, name, class: { name: "1º Ano A", year: 2026 } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  atual.sub = "dir";
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => PERFIS[where.id] ?? null);
  prismaMock.student.findFirst.mockResolvedValue(aluno("al1", "Maria Ávila"));
  prismaMock.student.findMany.mockResolvedValue([aluno("al1", "Maria Ávila"), aluno("al2", "João Conceição")]);
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
      expect(doc.getPageCount()).toBe(2); // uma página por aluno
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
    const pdf = await gerarBoletimPdf({ escola: "Escola Fokus 🎒", ano: 2026 }, [{ aluno: "Conceição Ávila", turma: "Maternal II", linhas: [] }]);
    expect(new TextDecoder("latin1").decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it("muitas disciplinas continuam na página seguinte, sem perder nenhuma", async () => {
    const disciplinas = Array.from({ length: 45 }, (_, i) => ({ id: `d${i}`, nome: `Disciplina ${i + 1}` }));
    const linhas = linhasDoBoletim(disciplinas, []);
    const desenhados: string[] = [];
    const original = PDFPage.prototype.drawText;
    const espiao = vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, t, o) {
      desenhados.push(t);
      return original.call(this, t, o);
    });
    try {
      const pdf = await gerarBoletimPdf({ escola: "Escola Fokus", ano: 2026 }, [
        { aluno: "Maria", turma: "5º Ano", linhas },
        { aluno: "João", turma: "5º Ano", linhas: linhasDoBoletim(disciplinas.slice(0, 2), []) },
      ]);
      // Maria: 2 páginas (45 linhas); João começa numa página nova.
      expect((await PDFDocument.load(pdf)).getPageCount()).toBe(3);
    } finally {
      espiao.mockRestore();
    }
    for (const d of disciplinas) expect(desenhados).toContain(d.nome);
    expect(desenhados.filter((t) => t.includes("(continuação)"))).toHaveLength(1);
    expect(desenhados.filter((t) => t === "Direção")).toHaveLength(2); // assinaturas só na última página de cada aluno
  });

  it("nome do arquivo sem acentos nem espaços", () => {
    expect(nomeArquivoBoletim(2026, "Maria Conceição Ávila")).toBe("boletim-2026-maria-conceicao-avila.pdf");
  });
});
