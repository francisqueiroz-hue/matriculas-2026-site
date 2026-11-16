import { beforeEach, describe, expect, it, vi } from "vitest";
import { filtrarAlunos, idadeEmAnos, linkLigar, linkWhatsApp, normalizarBusca, telefoneParaExibir } from "@/lib/busca-aluno";
import { getNavLinks } from "@/lib/nav-links";

const alunos = [
  { name: "João Pedro Conceição", class: { name: "Infantil 4" }, guardians: [{ relation: "mãe", guardian: { name: "Márcia Conceição", phone: "5521998765432", email: null } }] },
  { name: "Ana Clara Souza", class: { name: "Infantil 3" }, guardians: [{ relation: "pai", guardian: { name: "Ricardo Souza", phone: "(21) 97777-1234", email: "ricardo@ex.com" } }] },
  { name: "Mariana Joana Lima", class: { name: "1º Ano" }, guardians: [] },
  { name: "Luíza Antunes", class: { name: "Infantil 3" }, guardians: [{ relation: null, guardian: { name: "Joana Antunes", phone: null, email: null } }] },
];
const nomes = (termo: string) => filtrarAlunos(alunos, termo).map((a) => a.name);

describe("busca de aluno", () => {
  it("ignora acento e maiúscula", () => {
    expect(nomes("joao")).toEqual(["João Pedro Conceição"]);
    expect(nomes("CONCEICAO")).toEqual(["João Pedro Conceição"]);
    expect(nomes("luiza")).toEqual(["Luíza Antunes"]);
    expect(normalizarBusca("  Ação  Já ")).toBe("acao ja");
  });

  it("acha por nome parcial e começo de sobrenome", () => {
    expect(nomes("ana c")).toEqual(["Ana Clara Souza"]);
    expect(nomes("sou")).toEqual(["Ana Clara Souza"]);
  });

  it("nome que começa pelo termo vem antes de quem só contém", () => {
    // "jo": João (começa) > Mariana Joana (palavra começa) > Luíza (mãe Joana)
    expect(nomes("jo")).toEqual(["João Pedro Conceição", "Mariana Joana Lima", "Luíza Antunes"]);
  });

  it("acha pela turma, pelo responsável e pelo parentesco", () => {
    expect(nomes("infantil 3")).toEqual(["Ana Clara Souza", "Luíza Antunes"]);
    expect(nomes("ricardo")).toEqual(["Ana Clara Souza"]);
    expect(nomes("ana infantil 3")).toEqual(["Ana Clara Souza"]);
    expect(nomes("marcia mae")).toEqual(["João Pedro Conceição"]);
  });

  it("acha pelo telefone do responsável só com 4 dígitos ou mais", () => {
    expect(nomes("99876")).toEqual(["João Pedro Conceição"]);
    expect(nomes("97777-1234")).toEqual(["Ana Clara Souza"]);
    expect(nomes("1")).toEqual(["Mariana Joana Lima"]); // "1º Ano", não telefone
  });

  it("sem correspondência devolve vazio; termo vazio devolve todos", () => {
    expect(nomes("zzz")).toEqual([]);
    expect(nomes("   ")).toHaveLength(4);
  });

  it("aguenta uma escola inteira sem travar a digitação", () => {
    const muitos = Array.from({ length: 3000 }, (_, i) => ({ name: `Aluno ${i} Silva`, class: { name: "Turma" }, guardians: [] }));
    const t = performance.now();
    filtrarAlunos(muitos, "aluno 2999");
    expect(performance.now() - t).toBeLessThan(100);
  });
});

describe("contato do responsável", () => {
  it("monta link de ligação e WhatsApp com DDI do Brasil", () => {
    expect(linkLigar("(21) 99876-5432")).toBe("tel:+5521998765432");
    expect(linkLigar("5521998765432")).toBe("tel:+5521998765432");
    expect(linkLigar(null)).toBeNull();
    expect(linkWhatsApp("(21) 99876-5432")).toBe("https://wa.me/5521998765432");
    expect(linkWhatsApp("5521998765432")).toBe("https://wa.me/5521998765432");
    expect(linkWhatsApp("123")).toBeNull();
    expect(telefoneParaExibir("5521998765432")).toBe("(21) 99876-5432");
  });

  it("calcula a idade em anos completos", () => {
    const hoje = new Date("2026-11-16T12:00:00Z");
    expect(idadeEmAnos("2021-11-16T00:00:00Z", hoje)).toBe(5);
    expect(idadeEmAnos("2021-11-17T00:00:00Z", hoje)).toBe(4);
    expect(idadeEmAnos(null, hoje)).toBeNull();
  });
});

describe("menu", () => {
  it("coordenação ganha Alunos (consulta); professor e família não", () => {
    const hrefs = (u: { role: "ADMIN" | "STAFF" | "GUARDIAN"; isCoordenacao: boolean }) => getNavLinks(u).map((l) => l.href);
    expect(hrefs({ role: "STAFF", isCoordenacao: true })).toContain("/dashboard/alunos");
    expect(hrefs({ role: "STAFF", isCoordenacao: false })).not.toContain("/dashboard/alunos");
    expect(hrefs({ role: "GUARDIAN", isCoordenacao: false })).not.toContain("/dashboard/alunos");
    expect(hrefs({ role: "ADMIN", isCoordenacao: false })).toContain("/dashboard/admin/alunos");
  });
});

// ─── Rota: quem pode consultar ────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({ student: { findMany: vi.fn() }, user: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const sessao = vi.hoisted(() => ({ atual: null as null | { sub: string; role: string; schoolId: string } }));
vi.mock("@/lib/auth", () => ({ ACCESS_COOKIE: "c", verifyAccessToken: vi.fn(async () => sessao.atual) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (sessao.atual ? { value: "tok" } : undefined) }) }));

import { GET } from "@/app/api/alunos/busca/route";

describe("rota da busca de aluno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.student.findMany.mockResolvedValue([{ id: "a1", name: "Ana" }]);
  });
  const comPerfil = (role: string, isCoordenacao = false) => {
    sessao.atual = { sub: "u1", role, schoolId: "s1" };
    prismaMock.user.findUnique.mockResolvedValue({ active: true, deletedAt: null, isCoordenacao });
  };

  it("direção consulta só alunos ativos da própria escola, sem dado financeiro", async () => {
    comPerfil("ADMIN");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const args = prismaMock.student.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ schoolId: "s1", deletedAt: null });
    expect(Object.keys(args.select).sort()).toEqual(["birthDate", "class", "guardians", "id", "name"]);
  });

  it("coordenação consulta", async () => {
    comPerfil("STAFF", true);
    expect((await GET()).status).toBe(200);
  });

  it("professor e família são recusados", async () => {
    comPerfil("STAFF", false);
    expect((await GET()).status).toBe(403);
    comPerfil("GUARDIAN");
    expect((await GET()).status).toBe(403);
    expect(prismaMock.student.findMany).not.toHaveBeenCalled();
  });

  it("sem login é recusado", async () => {
    sessao.atual = null;
    expect((await GET()).status).toBe(401);
  });
});
