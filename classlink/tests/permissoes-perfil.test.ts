import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Matriz de permissões da escola (18/11/2026):
// 1. Notas: só direção e coordenação lançam (a secretaria não).
// 2. Coordenação faz o que a direção faz, menos financeiro, boletos e contratos.
// 3. Auxiliares: mural, comunicados, enquetes e mensagens com a gestão; sem agenda e frequência.
// 4. Professores: frequência, mural, comunicados, agenda, cardápio, notas e boletim (só leitura).
// Aqui a sessão é a de verdade (lib/session), com o token e o banco simulados.

type Pessoa = import("@/lib/equipe").PerfilAcesso;
const estado = vi.hoisted(() => ({
  token: { sub: "dir", role: "ADMIN", schoolId: "s1", name: "Direção" } as { sub: string; role: string; schoolId: string; name: string },
  pessoas: {} as Record<string, { role: string; funcao: string | null; isCoordenacao: boolean }>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "tok" }) }) }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  verifyAccessToken: vi.fn(async () => estado.token),
}));

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
      const p = estado.pessoas[where.id];
      if (!p) return null;
      if (select && "active" in select) return { active: true, deletedAt: null };
      return { ...p, id: where.id };
    }),
  },
  classTeacher: { findFirst: vi.fn(async () => null) },
  student: { findFirst: vi.fn() },
  disciplina: { findFirst: vi.fn() },
  nota: { upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));
vi.mock("@/lib/visibilidade-server", () => ({ exigirArea: async () => {} }));

import { ehGestao, podeLancarNotas, podePublicar, PROFESSORES_PUBLICAM } from "@/lib/equipe";
import { ehGestaoDaSessao, exigirPodePublicar, requireLancarNotas } from "@/lib/session";
import { exigirLecionaNaTurma } from "@/lib/turmas-acesso";
import { areasBloqueadasPara } from "@/lib/visibilidade";
import { getNavLinks } from "@/lib/nav-links";
import { PUT as lancarNota } from "@/app/api/notas/[studentId]/route";

const DIRECAO: Pessoa = { role: "ADMIN", funcao: "DIRECAO", isCoordenacao: false };
const SECRETARIA: Pessoa = { role: "ADMIN", funcao: "SECRETARIA", isCoordenacao: false };
const COORDENACAO: Pessoa = { role: "STAFF", funcao: "COORDENACAO", isCoordenacao: true };
const PROFESSOR: Pessoa = { role: "STAFF", funcao: "PROFESSOR", isCoordenacao: false };
const AUXILIAR: Pessoa = { role: "STAFF", funcao: "AUXILIAR", isCoordenacao: false };

function entrarComo(id: string, pessoa: Pessoa) {
  estado.pessoas[id] = pessoa;
  estado.token = { sub: id, role: pessoa.role, schoolId: "s1", name: id };
  return { sub: id, role: pessoa.role, schoolId: "s1" } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("regras puras por perfil", () => {
  it("notas: direção e coordenação lançam; secretaria, professor e auxiliar não", () => {
    expect(podeLancarNotas(DIRECAO)).toBe(true);
    expect(podeLancarNotas(COORDENACAO)).toBe(true);
    expect(podeLancarNotas(SECRETARIA)).toBe(false);
    expect(podeLancarNotas(PROFESSOR)).toBe(false);
    expect(podeLancarNotas(AUXILIAR)).toBe(false);
  });

  it("gestão (publica para a escola toda): direção, secretaria e coordenação", () => {
    expect([DIRECAO, SECRETARIA, COORDENACAO].every(ehGestao)).toBe(true);
    expect(ehGestao(PROFESSOR)).toBe(false);
    expect(ehGestao(AUXILIAR)).toBe(false);
  });

  it("professores e auxiliares só veem mural, comunicados, enquetes e agenda", () => {
    expect(PROFESSORES_PUBLICAM).toBe(false);
    expect(podePublicar(PROFESSOR)).toBe(false);
    expect(podePublicar(AUXILIAR)).toBe(false);
    expect(podePublicar(COORDENACAO)).toBe(true);
  });
});

describe("no servidor (função lida do banco)", () => {
  it("lançar nota: secretaria recebe 403 sem gravar; coordenação passa", async () => {
    const req = new NextRequest("http://t/api/notas/a1?disciplinaId=d1", {
      method: "PUT",
      body: JSON.stringify({ trimestre: "PRIMEIRO", prova: 8 }),
    });
    const ctx = { params: Promise.resolve({ studentId: "a1" }) } as never;
    entrarComo("sec", SECRETARIA);
    const res = await lancarNota(req, ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/direção e a coordenação/);
    expect(prismaMock.nota.upsert).not.toHaveBeenCalled();

    entrarComo("coord", COORDENACAO);
    await expect(requireLancarNotas()).resolves.toMatchObject({ sub: "coord" });
    entrarComo("dir", DIRECAO);
    await expect(requireLancarNotas()).resolves.toMatchObject({ sub: "dir" });
    entrarComo("prof", PROFESSOR);
    await expect(requireLancarNotas()).rejects.toMatchObject({ status: 403 });
  });

  it("publicar: professor e auxiliar barrados; coordenação e secretaria passam", async () => {
    await expect(exigirPodePublicar(entrarComo("prof", PROFESSOR))).rejects.toMatchObject({ status: 403 });
    await expect(exigirPodePublicar(entrarComo("aux", AUXILIAR))).rejects.toMatchObject({ status: 403 });
    await expect(exigirPodePublicar(entrarComo("coord", COORDENACAO))).resolves.toBeUndefined();
    await expect(exigirPodePublicar(entrarComo("sec", SECRETARIA))).resolves.toBeUndefined();
    expect(await ehGestaoDaSessao(entrarComo("coord", COORDENACAO))).toBe(true);
    expect(await ehGestaoDaSessao(entrarComo("prof", PROFESSOR))).toBe(false);
  });

  it("coordenação usa qualquer turma (frequência, publicar); professor só as dele", async () => {
    await expect(exigirLecionaNaTurma(entrarComo("coord", COORDENACAO), "t9")).resolves.toBeUndefined();
    await expect(exigirLecionaNaTurma(entrarComo("prof", PROFESSOR), "t9")).rejects.toMatchObject({ status: 403 });
  });

  it("tirar a coordenação de alguém vale na hora (lido do banco, não do token)", async () => {
    const sessao = entrarComo("ex", COORDENACAO);
    expect(await ehGestaoDaSessao(sessao)).toBe(true);
    estado.pessoas.ex = PROFESSOR;
    expect(await ehGestaoDaSessao(sessao)).toBe(false);
  });
});

describe("menu por perfil", () => {
  const vazio = new Map<string, boolean>();
  const hrefs = (pessoa: Pessoa, papel: "PROFESSORES" | "AUXILIARES") =>
    getNavLinks({ ...pessoa, areasBloqueadas: areasBloqueadasPara(papel, vazio) }).map((l) => l.href);

  it("auxiliar: mural, comunicados, enquetes, mensagens e cardápio; sem agenda, frequência e notas", () => {
    const menu = hrefs(AUXILIAR, "AUXILIARES");
    for (const t of ["mural", "comunicados", "enquetes", "mensagens", "cardapio"]) expect(menu).toContain(`/dashboard/${t}`);
    for (const t of ["agenda", "frequencia", "notas", "rotina", "alunos"]) expect(menu).not.toContain(`/dashboard/${t}`);
  });

  it("professor: frequência, agenda, cardápio e notas (leitura); sem rotina", () => {
    const menu = hrefs(PROFESSOR, "PROFESSORES");
    for (const t of ["mural", "comunicados", "agenda", "cardapio", "frequencia", "notas", "mensagens"]) {
      expect(menu).toContain(`/dashboard/${t}`);
    }
    expect(menu).not.toContain("/dashboard/rotina");
  });
});
