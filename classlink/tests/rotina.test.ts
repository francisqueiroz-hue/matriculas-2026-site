import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  guardianStudent: { findFirst: vi.fn(), findMany: vi.fn() },
  student: { findFirst: vi.fn(), findMany: vi.fn() },
  visibilidadeArea: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  rotinaDiaria: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}));
const pushMock = vi.hoisted(() => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/push", () => pushMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
type Sessao = { sub: string; role: string; schoolId: string; name: string };
const sessaoMock = vi.hoisted(() => ({ atual: {} as Sessao }));
vi.mock("@/lib/session", () => {
  class AuthError extends Error {
    constructor(
      message: string,
      readonly status = 401,
    ) {
      super(message);
    }
  }
  return { AuthError, requireSession: vi.fn(async () => sessaoMock.atual) };
});

import { DELETE, GET, PUT } from "@/app/api/alunos/[id]/rotina/route";
import { GET as entrada } from "@/app/api/rotina/route";
import { alternarOpcao } from "@/components/RotinaFormulario";
import { avisoRotinaFamilia, hojeNaEscola, inicioDaJanela, salvarRotinaSchema, validarDataRotina } from "@/lib/rotina";
import { getNavLinks } from "@/lib/nav-links";

const ctx = { params: Promise.resolve({ id: "a1" }) } as never;
const DIRECAO: Sessao = { sub: "d1", role: "ADMIN", schoolId: "s1", name: "Direção" };
const SECRETARIA: Sessao = { sub: "s9", role: "ADMIN", schoolId: "s1", name: "Secretaria" };
const MAE: Sessao = { sub: "g1", role: "GUARDIAN", schoolId: "s1", name: "Ana Souza" };
const PROFESSORA: Sessao = { sub: "p1", role: "STAFF", schoolId: "s1", name: "Prof" };
const COORDENACAO: Sessao = { sub: "c1", role: "STAFF", schoolId: "s1", name: "Coord" };
const hoje = hojeNaEscola();
const linha = (extra: Record<string, unknown> = {}) => ({
  data: new Date(`${hoje}T00:00:00Z`),
  colacao: "TUDO",
  almoco: "POUCO",
  lanche: null,
  janta: null,
  sono: ["TARDE"],
  evacuacao: ["NORMAL"],
  banho: true,
  medicacoes: [{ horario: "10:00", nome: "Paracetamol", dosagem: "5 gotas", responsavel: "Tia Bia" }],
  observacoes: "Brincou bastante",
  preenchidoPorNome: "Direção",
  atualizadoEm: new Date(),
  familiaAvisadaEm: null,
  ...extra,
});
const req = (metodo = "GET", corpo?: unknown, qs = "") =>
  new NextRequest(`http://t/api/alunos/a1/rotina${qs}`, {
    method: metodo,
    ...(corpo !== undefined && { body: JSON.stringify(corpo) }),
  });
const corpoValido = { data: hoje, colacao: "TUDO", sono: ["MANHA"], medicacoes: [{ horario: "", nome: "", dosagem: "", responsavel: "" }] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessaoMock.atual = DIRECAO;
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ isCoordenacao: where.id === "c1" }));
  prismaMock.visibilidadeArea.findUnique.mockResolvedValue(null);
  prismaMock.guardianStudent.findFirst.mockResolvedValue({ id: "v1" });
  prismaMock.guardianStudent.findMany.mockResolvedValue([{ guardianId: "g1" }, { guardianId: "g2" }]);
  prismaMock.student.findFirst.mockResolvedValue({ id: "a1", name: "Lia Souza", class: { name: "Berçário" } });
  prismaMock.student.findMany.mockResolvedValue([{ id: "a1", name: "Lia Souza", class: { name: "Berçário" } }]);
  prismaMock.rotinaDiaria.findMany.mockResolvedValue([linha()]);
  prismaMock.rotinaDiaria.upsert.mockResolvedValue(linha());
  prismaMock.rotinaDiaria.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.rotinaDiaria.deleteMany.mockResolvedValue({ count: 1 });
  pushMock.notifyUsers.mockResolvedValue({ aparelhos: 1, enviados: 1, erros: [] });
});

describe("quem vê e quem preenche", () => {
  it("professora: 403 em tudo", async () => {
    sessaoMock.atual = PROFESSORA;
    expect((await GET(req(), ctx)).status).toBe(403);
    expect((await PUT(req("PUT", corpoValido), ctx)).status).toBe(403);
    expect((await DELETE(req("DELETE", undefined, `?data=${hoje}`), ctx)).status).toBe(403);
    expect((await entrada()).status).toBe(403);
    expect(prismaMock.rotinaDiaria.upsert).not.toHaveBeenCalled();
    expect(prismaMock.rotinaDiaria.deleteMany).not.toHaveBeenCalled();
  });

  it("professora continua sem acesso mesmo se houver escolha salva liberando (célula fixa)", async () => {
    sessaoMock.atual = PROFESSORA;
    prismaMock.visibilidadeArea.findUnique.mockResolvedValue({ liberado: true });
    expect((await GET(req(), ctx)).status).toBe(403);
    expect((await PUT(req("PUT", corpoValido), ctx)).status).toBe(403);
    expect((await entrada()).status).toBe(403);
  });

  it("coordenação vê, preenche, corrige e apaga", async () => {
    sessaoMock.atual = COORDENACAO;
    const lista = await entrada();
    expect(lista.status).toBe(200);
    expect((await lista.json()).papel).toBe("ESCOLA");
    const r = await GET(req(), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).papel).toBe("ESCOLA");
    expect((await PUT(req("PUT", corpoValido), ctx)).status).toBe(200);
    expect(prismaMock.rotinaDiaria.upsert.mock.calls[0][0].create.preenchidoPorNome).toBe("Coord");
    expect((await DELETE(req("DELETE", undefined, `?data=${hoje}`), ctx)).status).toBe(200);
  });

  it("direção desligou a Rotina para a coordenação em Configurações: 403", async () => {
    sessaoMock.atual = COORDENACAO;
    prismaMock.visibilidadeArea.findUnique.mockResolvedValue({ liberado: false });
    expect((await GET(req(), ctx)).status).toBe(403);
    expect((await PUT(req("PUT", corpoValido), ctx)).status).toBe(403);
    expect((await entrada()).status).toBe(403);
    expect(prismaMock.rotinaDiaria.upsert).not.toHaveBeenCalled();
  });

  it("família vê a rotina do próprio filho, com medicação", async () => {
    sessaoMock.atual = MAE;
    const r = await GET(req(), ctx);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toContain("no-store");
    const j = await r.json();
    expect(j.papel).toBe("FAMILIA");
    expect(j.rotinas[0]).toMatchObject({ data: hoje, colacao: "TUDO", banho: true });
    expect(j.rotinas[0].medicacoes[0].nome).toBe("Paracetamol");
  });

  it("família de outro aluno: 404 (sem revelar que o aluno existe)", async () => {
    sessaoMock.atual = MAE;
    prismaMock.guardianStudent.findFirst.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
    expect(prismaMock.rotinaDiaria.findMany).not.toHaveBeenCalled();
  });

  it("família não preenche nem apaga", async () => {
    sessaoMock.atual = MAE;
    expect((await PUT(req("PUT", corpoValido), ctx)).status).toBe(403);
    expect((await DELETE(req("DELETE", undefined, `?data=${hoje}`), ctx)).status).toBe(403);
    expect(prismaMock.rotinaDiaria.upsert).not.toHaveBeenCalled();
    expect(prismaMock.rotinaDiaria.deleteMany).not.toHaveBeenCalled();
  });

  it("direção desligou a Rotina para as famílias em Configurações: 403", async () => {
    sessaoMock.atual = MAE;
    prismaMock.visibilidadeArea.findUnique.mockResolvedValue({ liberado: false });
    expect((await GET(req(), ctx)).status).toBe(403);
    expect((await entrada()).status).toBe(403);
  });

  it("secretaria (ADMIN sem financeiro) preenche", async () => {
    sessaoMock.atual = SECRETARIA;
    expect((await PUT(req("PUT", corpoValido), ctx)).status).toBe(200);
  });

  it("entrada: escola recebe os alunos com turma; família só os filhos", async () => {
    const e = await (await entrada()).json();
    expect(e).toEqual({ papel: "ESCOLA", alunos: [{ id: "a1", name: "Lia Souza", turma: "Berçário" }] });
    sessaoMock.atual = MAE;
    prismaMock.guardianStudent.findMany.mockResolvedValue([{ student: { id: "a1", name: "Lia Souza", class: null } }]);
    const f = await (await entrada()).json();
    expect(f).toEqual({ papel: "FAMILIA", alunos: [{ id: "a1", name: "Lia Souza", turma: null }] });
  });
});

describe("salvar", () => {
  it("primeira vez no dia: grava e avisa os responsáveis sem dado de saúde no texto", async () => {
    const r = await PUT(req("PUT", corpoValido), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).familiaAvisada).toBe(true);
    const args = prismaMock.rotinaDiaria.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({ schoolId: "s1", studentId: "a1", colacao: "TUDO", sono: ["MANHA"], medicacoes: [], preenchidoPorNome: "Direção" });
    expect(pushMock.notifyUsers).toHaveBeenCalledTimes(1);
    const [ids, aviso] = pushMock.notifyUsers.mock.calls[0];
    expect(ids).toEqual(["g1", "g2"]);
    expect(aviso.url).toBe("/dashboard/rotina?aluno=a1");
    expect(aviso.body).toContain("Lia");
    expect(aviso.body).not.toMatch(/Paracetamol|evacua|medica/i);
  });

  it("correção do mesmo dia não avisa de novo", async () => {
    prismaMock.rotinaDiaria.upsert.mockResolvedValue(linha({ familiaAvisadaEm: new Date() }));
    const r = await PUT(req("PUT", corpoValido), ctx);
    expect((await r.json()).familiaAvisada).toBe(false);
    expect(pushMock.notifyUsers).not.toHaveBeenCalled();
  });

  it("dois salvamentos ao mesmo tempo: só quem marcou primeiro avisa", async () => {
    prismaMock.rotinaDiaria.updateMany.mockResolvedValue({ count: 0 });
    await PUT(req("PUT", corpoValido), ctx);
    expect(pushMock.notifyUsers).not.toHaveBeenCalled();
  });

  it("falha no aviso não desfaz o que foi salvo", async () => {
    pushMock.notifyUsers.mockRejectedValue(new Error("firebase fora"));
    expect((await PUT(req("PUT", corpoValido), ctx)).status).toBe(200);
  });

  it("recusa ficha em branco, dia futuro e medicação sem nome do remédio", async () => {
    expect((await PUT(req("PUT", { data: hoje }), ctx)).status).toBe(400);
    expect((await PUT(req("PUT", { ...corpoValido, data: "2999-01-01" }), ctx)).status).toBe(400);
    const semNome = { ...corpoValido, medicacoes: [{ horario: "10:00", nome: "", dosagem: "5ml", responsavel: "" }] };
    expect((await PUT(req("PUT", semNome), ctx)).status).toBe(400);
    expect((await PUT(req("PUT", { ...corpoValido, colacao: "MUITO" }), ctx)).status).toBe(400);
    expect(prismaMock.rotinaDiaria.upsert).not.toHaveBeenCalled();
  });

  it("apagar dia sem rotina: 404; com rotina: ok", async () => {
    expect((await DELETE(req("DELETE", undefined, `?data=${hoje}`), ctx)).status).toBe(200);
    prismaMock.rotinaDiaria.deleteMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(req("DELETE", undefined, `?data=${hoje}`), ctx)).status).toBe(404);
    expect((await DELETE(req("DELETE", undefined, "?data=x"), ctx)).status).toBe(400);
  });
});

describe("regras da ficha", () => {
  it('"Não" exclui as outras opções de sono e evacuação', () => {
    expect(alternarOpcao(["MANHA"], "TARDE")).toEqual(["MANHA", "TARDE"]);
    expect(alternarOpcao(["MANHA", "TARDE"], "NAO")).toEqual(["NAO"]);
    expect(alternarOpcao(["NAO"], "PASTOSA")).toEqual(["PASTOSA"]);
    expect(alternarOpcao(["MANHA"], "MANHA")).toEqual([]);
    const p = salvarRotinaSchema.parse({ data: hoje, sono: ["MANHA", "NAO"], evacuacao: ["NORMAL", "NORMAL"] });
    expect(p.sono).toEqual(["NAO"]);
    expect(p.evacuacao).toEqual(["NORMAL"]);
  });

  it("datas: calendário real, nada futuro, janela conta hoje", () => {
    expect(validarDataRotina("2026-02-30")).toBe("Data inválida");
    expect(validarDataRotina("2026-11-18", new Date("2026-11-18T02:00:00Z"))).toMatch(/futuro/); // 23h do dia 17 em Brasília
    expect(validarDataRotina("2026-11-17", new Date("2026-11-18T02:00:00Z"))).toBeNull();
    expect(inicioDaJanela(1, new Date("2026-11-18T15:00:00Z"))).toBe("2026-11-18");
    expect(inicioDaJanela(14, new Date("2026-11-18T15:00:00Z"))).toBe("2026-11-05");
  });

  it("aviso usa só o primeiro nome e a data", () => {
    expect(avisoRotinaFamilia("Lia Souza Lima", "2026-11-18").body).toBe("A rotina de Lia de 18/11/2026 está disponível no app.");
  });

  it("menu: direção, secretaria, coordenação e família têm Rotina; professores não", () => {
    const tem = (u: Parameters<typeof getNavLinks>[0]) => getNavLinks(u).some((l) => l.href === "/dashboard/rotina");
    expect(tem({ role: "ADMIN", isCoordenacao: false, funcao: null, areasBloqueadas: [] })).toBe(true);
    expect(tem({ role: "ADMIN", isCoordenacao: false, funcao: "SECRETARIA", areasBloqueadas: [] })).toBe(true);
    expect(tem({ role: "GUARDIAN", isCoordenacao: false, funcao: null, areasBloqueadas: [] })).toBe(true);
    expect(tem({ role: "GUARDIAN", isCoordenacao: false, funcao: null, areasBloqueadas: ["ROTINA"] })).toBe(false);
    expect(tem({ role: "STAFF", isCoordenacao: true, funcao: null, areasBloqueadas: [] })).toBe(true);
    expect(tem({ role: "STAFF", isCoordenacao: true, funcao: null, areasBloqueadas: ["ROTINA"] })).toBe(false);
    expect(tem({ role: "STAFF", isCoordenacao: false, funcao: null, areasBloqueadas: [] })).toBe(false);
  });
});
