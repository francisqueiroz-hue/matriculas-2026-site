import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFINICOES_AREAS,
  PAPEIS_VISIBILIDADE,
  areaDaTela,
  areaLiberada,
  areasBloqueadasPara,
  chaveEscolha,
  papelVisibilidade,
  telaBloqueada,
} from "@/lib/visibilidade";
import { getNavLinks } from "@/lib/nav-links";

describe("regras de visibilidade", () => {
  it("sem nenhuma escolha salva, o app fica como antes (padrões = acesso atual)", () => {
    const vazio = new Map<string, boolean>();
    expect(areasBloqueadasPara("FAMILIAS", vazio)).toEqual(["FICHAS", "CONSULTA_ALUNOS"]);
    expect(areasBloqueadasPara("COORDENACAO", vazio)).toEqual(["FINANCEIRO", "CONTRATOS", "ROTINA"]);
    // Matriz da escola (18/11/2026): professores veem notas e boletim (só leitura).
    expect(areasBloqueadasPara("PROFESSORES", vazio)).toEqual(["FINANCEIRO", "CONTRATOS", "CONSULTA_ALUNOS", "ROTINA"]);
    // Auxiliares: sem agenda, frequência e notas.
    expect(areasBloqueadasPara("AUXILIARES", vazio)).toEqual([
      "AGENDA",
      "FREQUENCIA",
      "NOTAS",
      "FINANCEIRO",
      "CONTRATOS",
      "CONSULTA_ALUNOS",
      "ROTINA",
    ]);
  });

  it("auxiliares nunca veem agenda nem frequência, mesmo com linha liberada no banco", () => {
    const forcado = new Map([
      [chaveEscolha("AGENDA", "AUXILIARES"), true],
      [chaveEscolha("FREQUENCIA", "PROFESSORES"), true],
    ]);
    expect(areaLiberada("AGENDA", "AUXILIARES", forcado)).toBe(false);
    expect(areaLiberada("FREQUENCIA", "AUXILIARES", forcado)).toBe(false);
  });

  it("auxiliares herdam o que a direção já escolheu para a antiga coluna Professores e auxiliares", () => {
    const antigo = new Map([[chaveEscolha("FICHAS", "PROFESSORES"), false]]);
    expect(areaLiberada("FICHAS", "AUXILIARES", antigo)).toBe(false);
    // Escolha própria da coluna Auxiliares vale mais que a herdada.
    const proprio = new Map([...antigo, [chaveEscolha("FICHAS", "AUXILIARES"), true]]);
    expect(areaLiberada("FICHAS", "AUXILIARES", proprio)).toBe(true);
    expect(areaLiberada("FICHAS", "PROFESSORES", proprio)).toBe(false);
  });

  it("célula fixa nunca libera, mesmo com escolha salva (financeiro e contratos só da direção)", () => {
    const forcado = new Map([
      [chaveEscolha("FINANCEIRO", "COORDENACAO"), true],
      [chaveEscolha("CONTRATOS", "PROFESSORES"), true],
      [chaveEscolha("CONSULTA_ALUNOS", "FAMILIAS"), true],
    ]);
    expect(areaLiberada("FINANCEIRO", "COORDENACAO", forcado)).toBe(false);
    expect(areaLiberada("CONTRATOS", "PROFESSORES", forcado)).toBe(false);
    expect(areaLiberada("CONSULTA_ALUNOS", "FAMILIAS", forcado)).toBe(false);
  });

  it("área desconhecida é negada (padrão seguro)", () => {
    expect(areaLiberada("INVENTADA" as never, "FAMILIAS", new Map())).toBe(false);
  });

  it("a direção desliga e religa uma área configurável", () => {
    const desligado = new Map([[chaveEscolha("FICHAS", "PROFESSORES"), false]]);
    expect(areaLiberada("FICHAS", "PROFESSORES", desligado)).toBe(false);
    expect(areaLiberada("FICHAS", "COORDENACAO", desligado)).toBe(true);
    expect(areaLiberada("FICHAS", "PROFESSORES", new Map([[chaveEscolha("FICHAS", "PROFESSORES"), true]]))).toBe(true);
  });

  it("financeiro e contratos da equipe estão sempre travados", () => {
    for (const id of ["FINANCEIRO", "CONTRATOS"] as const) {
      const def = DEFINICOES_AREAS.find((d) => d.id === id)!;
      expect(def.celulas.COORDENACAO.tipo).toBe("fixo");
      expect(def.celulas.PROFESSORES.tipo).toBe("fixo");
    }
  });

  it("toda célula configurável que expõe dados de outras famílias ou de crianças é sensível", () => {
    for (const id of ["NOTAS", "FINANCEIRO", "CONTRATOS", "FICHAS", "CONSULTA_ALUNOS"]) {
      const def = DEFINICOES_AREAS.find((d) => d.id === id)!;
      for (const p of PAPEIS_VISIBILIDADE) {
        const c = def.celulas[p];
        if (c.tipo === "configuravel") expect(c.sensivel, `${id}/${p}`).toBe(true);
      }
    }
  });

  it("perfil: família, coordenação, professor; direção fica de fora", () => {
    expect(papelVisibilidade({ role: "GUARDIAN" })).toBe("FAMILIAS");
    expect(papelVisibilidade({ role: "STAFF", isCoordenacao: true })).toBe("COORDENACAO");
    expect(papelVisibilidade({ role: "STAFF", isCoordenacao: false })).toBe("PROFESSORES");
    expect(papelVisibilidade({ role: "STAFF", isCoordenacao: false, funcao: "PROFESSOR" })).toBe("PROFESSORES");
    expect(papelVisibilidade({ role: "STAFF", isCoordenacao: false, funcao: "AUXILIAR" })).toBe("AUXILIARES");
    expect(papelVisibilidade({ role: "ADMIN" })).toBeNull();
  });

  it("tela pertence à área pelo caminho, inclusive subpáginas", () => {
    expect(areaDaTela("/dashboard/comunicados/abc")).toBe("COMUNICADOS");
    expect(areaDaTela("/dashboard/boletim")).toBe("NOTAS");
    expect(areaDaTela("/dashboard/admin/financeiro")).toBeNull();
    expect(telaBloqueada("/dashboard/financeiro", ["FINANCEIRO"])).toBe(true);
    expect(telaBloqueada("/dashboard/mural", ["FINANCEIRO"])).toBe(false);
  });
});

describe("menu", () => {
  it("área desligada some do menu; direção não é afetada", () => {
    const familia = getNavLinks({ role: "GUARDIAN", isCoordenacao: false, areasBloqueadas: ["FINANCEIRO", "MURAL"] }).map((l) => l.href);
    expect(familia).not.toContain("/dashboard/financeiro");
    expect(familia).not.toContain("/dashboard/mural");
    expect(familia).toContain("/dashboard/contratos");
    const direcao = getNavLinks({ role: "ADMIN", isCoordenacao: false }).map((l) => l.href);
    expect(direcao).toContain("/dashboard/admin/configuracoes");
    expect(getNavLinks({ role: "STAFF", isCoordenacao: true }).map((l) => l.href)).not.toContain("/dashboard/admin/configuracoes");
  });
});

// ─── Servidor: bloqueio nas rotas e tela de Configurações ─────────────────────
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  visibilidadeArea: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  visibilidadeHistorico: { findMany: vi.fn(), create: vi.fn() },
  boleto: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const sessao = vi.hoisted(() => ({ atual: null as null | { sub: string; role: string; schoolId: string; name: string } }));
vi.mock("@/lib/auth", () => ({ ACCESS_COOKIE: "c", verifyAccessToken: vi.fn(async () => sessao.atual) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (sessao.atual ? { value: "tok" } : undefined) }) }));

import { exigirArea } from "@/lib/visibilidade-server";
import { GET as getConfig, PUT as putConfig } from "@/app/api/admin/visibilidade/route";
import { NextRequest } from "next/server";

const perfil = (role: string, extra: Record<string, unknown> = {}) => {
  sessao.atual = { sub: "u1", role, schoolId: "s1", name: "Fulana" };
  prismaMock.user.findUnique.mockResolvedValue({ active: true, deletedAt: null, isCoordenacao: false, role, funcao: role === "ADMIN" ? "DIRECAO" : null, name: "Fulana", ...extra });
};
const put = (corpo: unknown) =>
  putConfig(new NextRequest("http://x/api/admin/visibilidade", { method: "PUT", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }));

describe("exigirArea (servidor)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.visibilidadeArea.findUnique.mockResolvedValue(null);
  });
  const s = (role: string) => ({ sub: "u1", role, schoolId: "s1" });

  it("família com área desligada recebe 403; com padrão, passa", async () => {
    prismaMock.visibilidadeArea.findUnique.mockResolvedValueOnce({ liberado: false });
    await expect(exigirArea(s("GUARDIAN"), "FINANCEIRO")).rejects.toMatchObject({ status: 403 });
    await expect(exigirArea(s("GUARDIAN"), "FINANCEIRO")).resolves.toBeUndefined();
  });

  it("consulta só a linha da própria escola e do próprio perfil", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isCoordenacao: true });
    await exigirArea(s("STAFF"), "FICHAS");
    expect(prismaMock.visibilidadeArea.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId_area_papel: { schoolId: "s1", area: "FICHAS", papel: "COORDENACAO" } } }),
    );
  });

  it("professor nunca acessa área travada, mesmo com linha liberada no banco", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isCoordenacao: false });
    prismaMock.visibilidadeArea.findUnique.mockResolvedValue({ liberado: true });
    await expect(exigirArea(s("STAFF"), "FINANCEIRO")).rejects.toMatchObject({ status: 403 });
    await expect(exigirArea(s("STAFF"), "CONSULTA_ALUNOS")).rejects.toMatchObject({ status: 403 });
  });

  it("direção não consulta o banco nem é bloqueada", async () => {
    await expect(exigirArea(s("ADMIN"), "FINANCEIRO")).resolves.toBeUndefined();
    expect(prismaMock.visibilidadeArea.findUnique).not.toHaveBeenCalled();
  });
});

describe("rota da família bloqueada pela direção", () => {
  it("boletos da família: 403 sem tocar nos boletos quando Financeiro está desligado", async () => {
    vi.clearAllMocks();
    perfil("GUARDIAN");
    prismaMock.visibilidadeArea.findUnique.mockResolvedValue({ liberado: false });
    const { GET } = await import("@/app/api/billing/boletos/route");
    const res = await GET();
    expect(res.status).toBe(403);
    expect(prismaMock.boleto.findMany).not.toHaveBeenCalled();
  });
});

describe("tela Configurações (API)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.visibilidadeArea.findMany.mockResolvedValue([]);
    prismaMock.visibilidadeHistorico.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
  });

  it("só a direção lê e muda; coordenação, professor e família recebem 403", async () => {
    for (const [role, extra] of [["STAFF", { isCoordenacao: true }], ["STAFF", {}], ["GUARDIAN", {}]] as const) {
      perfil(role, extra);
      expect((await getConfig()).status).toBe(403);
      expect((await put({ area: "MURAL", papel: "FAMILIAS", liberado: false })).status).toBe(403);
    }
    expect(prismaMock.visibilidadeArea.upsert).not.toHaveBeenCalled();
  });

  it("direção vê a situação de cada área com os padrões", async () => {
    perfil("ADMIN");
    const res = await getConfig();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const dados = await res.json();
    expect(dados.liberado.FINANCEIRO).toEqual({ COORDENACAO: false, PROFESSORES: false, AUXILIARES: false, FAMILIAS: true });
  });

  it("desligar grava a escolha e o histórico com nome do autor", async () => {
    perfil("ADMIN");
    const res = await put({ area: "FICHAS", papel: "PROFESSORES", liberado: false });
    expect(res.status).toBe(200);
    expect(prismaMock.visibilidadeArea.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ schoolId: "s1", area: "FICHAS", papel: "PROFESSORES", liberado: false, atualizadoPorId: "u1" }) }),
    );
    expect(prismaMock.visibilidadeHistorico.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ schoolId: "s1", area: "FICHAS", papel: "PROFESSORES", liberado: false, autorId: "u1", autorNome: "Fulana" }),
    });
  });

  it("liberar área sensível sem confirmação é recusado; com confirmação, grava", async () => {
    perfil("ADMIN");
    prismaMock.visibilidadeArea.findMany.mockResolvedValue([{ area: "FICHAS", papel: "PROFESSORES", liberado: false }]);
    expect((await put({ area: "FICHAS", papel: "PROFESSORES", liberado: true })).status).toBe(400);
    expect(prismaMock.visibilidadeArea.upsert).not.toHaveBeenCalled();
    expect((await put({ area: "FICHAS", papel: "PROFESSORES", liberado: true, confirmado: true })).status).toBe(200);
    expect(prismaMock.visibilidadeHistorico.create).toHaveBeenCalledTimes(1);
  });

  it("célula travada não pode ser liberada nem pela direção", async () => {
    perfil("ADMIN");
    const res = await put({ area: "FINANCEIRO", papel: "COORDENACAO", liberado: true, confirmado: true });
    expect(res.status).toBe(400);
    expect(prismaMock.visibilidadeArea.upsert).not.toHaveBeenCalled();
  });

  it("clique repetido (sem mudança) não polui o histórico; área inválida é 400", async () => {
    perfil("ADMIN");
    await put({ area: "MURAL", papel: "FAMILIAS", liberado: true });
    expect(prismaMock.visibilidadeHistorico.create).not.toHaveBeenCalled();
    expect((await put({ area: "XYZ", papel: "FAMILIAS", liberado: true })).status).toBe(400);
  });
});

describe("secretaria (administração sem ser direção)", () => {
  it("não lê nem muda as Configurações", async () => {
    vi.clearAllMocks();
    perfil("ADMIN", { funcao: "SECRETARIA" });
    expect((await getConfig()).status).toBe(403);
    expect((await put({ area: "MURAL", papel: "FAMILIAS", liberado: false })).status).toBe(403);
    expect(prismaMock.visibilidadeArea.upsert).not.toHaveBeenCalled();
    const menu = getNavLinks({ role: "ADMIN", isCoordenacao: false, funcao: "SECRETARIA" }).map((l) => l.href);
    expect(menu).not.toContain("/dashboard/admin/configuracoes");
  });
});
