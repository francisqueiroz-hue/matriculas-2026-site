import { readFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Financeiro, mensalidades, baixas, contratos (com valores) e lembretes de cobrança: só a direção.
// A Secretaria é ADMIN (cadastros, turmas, acessos, matrículas), mas não é Direção. Aqui a sessão
// é a de verdade (lib/session), com o token e o banco simulados.

type Pessoa = { role: "ADMIN" | "STAFF" | "GUARDIAN"; funcao: string | null; isCoordenacao?: boolean };
const estado = vi.hoisted(() => ({
  token: { sub: "dir", role: "ADMIN", schoolId: "s1", name: "Direção" } as { sub: string; role: string; schoolId: string; name: string },
  pessoas: {} as Record<string, { role: string; funcao: string | null; isCoordenacao?: boolean; id?: string }>,
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
    findFirst: vi.fn(),
    findMany: vi.fn(async () => []),
    update: vi.fn(),
  },
  student: { findMany: vi.fn(), findFirst: vi.fn() },
  boleto: { findMany: vi.fn(async () => []) },
  contrato: { findMany: vi.fn(async () => []), findFirst: vi.fn() },
  alteracaoCadastro: { findMany: vi.fn(async () => []) },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));

import { ehDirecao, perfilDaFuncao, FUNCAO_LABEL } from "@/lib/equipe";
import { requireDirecao, exigirDirecaoSeAdmin } from "@/lib/session";
import { getNavLinks } from "@/lib/nav-links";
import { GET as resumoFinanceiro } from "@/app/api/admin/billing/summary/route";
import { POST as enviarContrato } from "@/app/api/admin/contratos/route";
import { GET as contratosCompartilhado } from "@/app/api/contratos/route";
import { GET as listarAlunos } from "@/app/api/admin/students/route";
import { PATCH as editarUsuario, DELETE as excluirUsuario } from "@/app/api/admin/users/[id]/route";
import { POST as criarUsuario } from "@/app/api/admin/users/route";

function entrarComo(id: string, pessoa: Pessoa) {
  estado.pessoas[id] = pessoa;
  estado.token = { sub: id, role: pessoa.role, schoolId: "s1", name: id };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  estado.pessoas = {
    dir: { role: "ADMIN", funcao: "DIRECAO" },
    sec: { role: "ADMIN", funcao: "SECRETARIA" },
  };
  entrarComo("dir", { role: "ADMIN", funcao: "DIRECAO" });
});

describe("quem é direção", () => {
  it("Direção e diretor de cadastro antigo (sem função) são direção; Secretaria, coordenação e família não", () => {
    expect(ehDirecao({ role: "ADMIN", funcao: "DIRECAO" })).toBe(true);
    expect(ehDirecao({ role: "ADMIN", funcao: null })).toBe(true);
    expect(ehDirecao({ role: "ADMIN", funcao: "SECRETARIA" })).toBe(false);
    expect(ehDirecao({ role: "STAFF", funcao: "COORDENACAO" })).toBe(false);
    expect(ehDirecao({ role: "STAFF", funcao: null })).toBe(false);
    expect(ehDirecao({ role: "GUARDIAN", funcao: null })).toBe(false);
  });

  it("Secretaria mantém o perfil de administração (cadastros) e aparece como Secretaria", () => {
    expect(perfilDaFuncao("SECRETARIA")).toEqual({ role: "ADMIN", isCoordenacao: false });
    expect(FUNCAO_LABEL.SECRETARIA).toBe("Secretaria");
  });

  it("requireDirecao lê a função no banco: Secretaria recebe 403 mesmo com token de ADMIN", async () => {
    await expect(requireDirecao()).resolves.toMatchObject({ sub: "dir" });
    entrarComo("sec", { role: "ADMIN", funcao: "SECRETARIA" });
    await expect(requireDirecao()).rejects.toMatchObject({ status: 403 });
    entrarComo("coord", { role: "STAFF", funcao: "COORDENACAO" });
    await expect(requireDirecao()).rejects.toMatchObject({ status: 403 });
  });

  it("rotas compartilhadas com a família: família passa (vínculo conferido na rota), Secretaria não", async () => {
    await expect(exigirDirecaoSeAdmin({ sub: "fam", role: "GUARDIAN" })).resolves.toBeUndefined();
    await expect(exigirDirecaoSeAdmin({ sub: "dir", role: "ADMIN" })).resolves.toBeUndefined();
    await expect(exigirDirecaoSeAdmin({ sub: "sec", role: "ADMIN" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("Secretaria nas rotas do servidor", () => {
  it("não vê o resumo financeiro nem a lista de contratos (403, sem consultar boletos/contratos)", async () => {
    entrarComo("sec", { role: "ADMIN", funcao: "SECRETARIA" });
    expect((await resumoFinanceiro()).status).toBe(403);
    expect((await enviarContrato(new NextRequest("http://t/api/admin/contratos", { method: "POST", body: "{}" }))).status).toBe(403);
    expect((await contratosCompartilhado(new NextRequest("http://t/api/contratos"))).status).toBe(403);
    expect(prismaMock.boleto.findMany).not.toHaveBeenCalled();
    expect(prismaMock.contrato.findMany).not.toHaveBeenCalled();
  });

  it("a direção continua vendo o resumo financeiro", async () => {
    expect((await resumoFinanceiro()).status).toBe(200);
  });

  it("lista de alunos: Secretaria e coordenação recebem sem mensalidade, vencimento e bolsa; direção recebe tudo", async () => {
    const aluno = { id: "a1", name: "Ana", mensalidadeValor: "1450.00", diaVencimento: 5, bolsista: false, class: { id: "t1" }, guardians: [] };
    prismaMock.student.findMany.mockResolvedValue([aluno]);

    const direcao = (await (await listarAlunos(new NextRequest("http://t/api/admin/students"))).json()).students[0];
    expect(direcao).toMatchObject({ mensalidadeValor: "1450.00", bolsista: false });

    for (const [id, pessoa] of [
      ["sec", { role: "ADMIN", funcao: "SECRETARIA" }],
      ["coord", { role: "STAFF", funcao: "COORDENACAO", isCoordenacao: true }],
    ] as const) {
      entrarComo(id, pessoa);
      const outro = (await (await listarAlunos(new NextRequest("http://t/api/admin/students"))).json()).students[0];
      expect(outro).toEqual({ id: "a1", name: "Ana", class: { id: "t1" }, guardians: [] });
    }
  });

  it("lista de alunos: professor recebe só os alunos das próprias turmas, sem contatos dos responsáveis", async () => {
    prismaMock.student.findMany.mockResolvedValue([{ id: "a1", name: "Ana", classId: "t1", class: { id: "t1" } }]);
    entrarComo("prof", { role: "STAFF", funcao: "PROFESSOR", isCoordenacao: false });
    const lista = (await (await listarAlunos(new NextRequest("http://t/api/admin/students?classId=t1"))).json()).students;
    expect(lista).toEqual([{ id: "a1", name: "Ana", classId: "t1", class: { id: "t1" } }]);
    const consulta = prismaMock.student.findMany.mock.calls[0][0];
    expect(consulta.where).toMatchObject({ classId: "t1", class: { teachers: { some: { teacherId: "prof" } } } });
    expect(consulta.select).not.toHaveProperty("guardians");
  });

  it("não ganha nem dá acesso de Direção pela Equipe", async () => {
    entrarComo("sec", { role: "ADMIN", funcao: "SECRETARIA" });
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
    const patch = (corpo: unknown) => new NextRequest("http://t/api/admin/users/x", { method: "PATCH", body: JSON.stringify(corpo) });

    // Mudar a própria função para Direção.
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: "sec", role: "ADMIN", funcao: "SECRETARIA" });
    expect((await editarUsuario(patch({ funcao: "DIRECAO" }), ctx("sec"))).status).toBe(403);

    // Trocar senha ou celular de alguém da direção.
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: "dir", role: "ADMIN", funcao: "DIRECAO" });
    expect((await editarUsuario(patch({ resetPassword: true }), ctx("dir"))).status).toBe(403);
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: "dir", role: "ADMIN", funcao: "DIRECAO" });
    expect((await excluirUsuario(new NextRequest("http://t", { method: "DELETE" }), ctx("dir"))).status).toBe(403);

    // Promover um professor a Direção, ou cadastrar alguém novo como Direção.
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: "p1", role: "STAFF", funcao: "PROFESSOR" });
    expect((await editarUsuario(patch({ funcao: "DIRECAO" }), ctx("p1"))).status).toBe(403);
    const novo = new NextRequest("http://t/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ name: "Nova", phone: "21999990000", funcao: "DIRECAO" }),
    });
    expect((await criarUsuario(novo)).status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("a direção não perde o próprio acesso por engano ao se marcar como Secretaria", async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: "dir", role: "ADMIN", funcao: "DIRECAO" });
    const res = await editarUsuario(
      new NextRequest("http://t/api/admin/users/dir", { method: "PATCH", body: JSON.stringify({ funcao: "SECRETARIA" }) }),
      { params: Promise.resolve({ id: "dir" }) } as never,
    );
    expect(res.status).toBe(400);
  });
});

describe("menu", () => {
  const rotulos = (funcao: string | null) =>
    getNavLinks({ role: "ADMIN", isCoordenacao: false, funcao: funcao as never }).map((l) => l.label);

  it("Secretaria não vê Contratos, Financeiro nem Lembretes; mantém Alunos, Turmas, Acessos e Matrículas", () => {
    const sec = rotulos("SECRETARIA");
    for (const aba of ["Contratos", "Financeiro", "Lembretes"]) expect(sec).not.toContain(aba);
    for (const aba of ["Alunos", "Turmas", "Acessos", "Matrículas", "Rematrícula", "Equipe"]) expect(sec).toContain(aba);
  });

  it("Direção (e diretor de cadastro antigo) vê tudo", () => {
    for (const funcao of ["DIRECAO", null]) {
      const dir = rotulos(funcao);
      for (const aba of ["Contratos", "Financeiro", "Lembretes"]) expect(dir).toContain(aba);
    }
  });
});

describe("varredura das rotas", () => {
  const raiz = join(__dirname, "..", "src", "app", "api");
  const ler = (rota: string) => readFileSync(join(raiz, rota, "route.ts"), "utf8");

  // Toda rota da administração com financeiro, mensalidade, baixa, contrato ou lembrete de cobrança.
  const SO_DIRECAO = [
    "admin/billing/boletos/[id]",
    "admin/billing/cobrancas",
    "admin/billing/conferencia",
    "admin/billing/config",
    "admin/billing/gerar-mes",
    "admin/billing/summary",
    "admin/contratos",
    "admin/contratos/[id]",
    "admin/contratos/[id]/assinatura",
    "admin/contratos/config",
    "admin/contratos/lote",
    "admin/contratos/previa",
    "admin/contratos/renovacao",
    "admin/contratos/renovacao/envio",
    "admin/contratos/valores",
    "admin/contratos/vencimento",
    "admin/students/[id]/billing",
    "admin/students/bolsistas",
    "admin/lembretes",
  ];

  it.each(SO_DIRECAO)("%s usa requireDirecao (não basta ser ADMIN)", (rota) => {
    const fonte = ler(rota);
    expect(fonte).toContain("requireDirecao()");
    expect(fonte).not.toContain('requireRole("ADMIN")');
  });

  it.each(["contratos", "contratos/[id]/arquivos/[arquivoId]", "billing/boletos/[id]/pdf"])(
    "%s (compartilhada com a família) exige direção de quem é da administração",
    (rota) => {
      expect(ler(rota)).toContain("exigirDirecaoSeAdmin(session)");
    },
  );
});
