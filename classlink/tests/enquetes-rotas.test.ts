import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  enqueteParticipacao: { create: vi.fn() },
  enqueteEnvio: { create: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  enqueteParticipacao: { count: vi.fn(), findMany: vi.fn() },
  enqueteItem: { findMany: vi.fn() },
  enqueteEnvio: { findMany: vi.fn() },
  enquete: { create: vi.fn() },
  class: { findFirst: vi.fn() },
  student: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));
const sessaoMock = vi.hoisted(() => ({ atual: { sub: "g1", role: "GUARDIAN", schoolId: "s1" } as { sub: string; role: string; schoolId: string } }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async () => sessaoMock.atual),
  requireSession: vi.fn(async () => sessaoMock.atual),
  AuthError: class extends Error {},
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn(async () => undefined) }));
const acessoMock = vi.hoisted(() => ({ carregarEnqueteVisivel: vi.fn(), publicoDaEnquete: vi.fn() }));
vi.mock("@/lib/enquetes-acesso", () => acessoMock);

import { POST as responder } from "@/app/api/enquetes/[id]/responder/route";
import { GET as resultados } from "@/app/api/enquetes/[id]/resultados/route";
import { GET as pendentes } from "@/app/api/enquetes/[id]/pendentes/route";
import { GET as exportar } from "@/app/api/enquetes/[id]/export/route";
import { POST as criar } from "@/app/api/enquetes/route";

const ctx = { params: Promise.resolve({ id: "e1" }) } as never;
const perguntas = [
  { id: "p1", ordem: 0, tipo: "NOTA", texto: "Nota?", obrigatoria: true, opcoes: { max: 5 } },
  { id: "p2", ordem: 1, tipo: "TEXTO", texto: "Comentário", obrigatoria: false, opcoes: null },
];
const enquete = (extra = {}) => ({
  id: "e1", schoolId: "s1", audience: "SCHOOL", classId: null, alunoId: null, anonima: true, prazo: null, encerradaEm: null, perguntas, ...extra,
});
const post = (corpo: unknown) => new NextRequest("http://t/api/enquetes/e1/responder", { method: "POST", body: JSON.stringify(corpo) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessaoMock.atual = { sub: "g1", role: "GUARDIAN", schoolId: "s1" };
  acessoMock.carregarEnqueteVisivel.mockResolvedValue(enquete());
  acessoMock.publicoDaEnquete.mockResolvedValue([{ id: "g1", name: "Ana" }, { id: "g2", name: "Bia" }, { id: "g3", name: "Caio" }]);
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe("responder enquete", () => {
  it("anônima: grava a participação com o responsável, mas o envio sem userId nem horário", async () => {
    const res = await responder(post({ respostas: { p1: 5, p2: "ótima" } }), ctx);
    expect(res.status).toBe(201);
    expect(tx.enqueteParticipacao.create.mock.calls[0][0].data).toMatchObject({ enqueteId: "e1", userId: "g1" });
    const envio = tx.enqueteEnvio.create.mock.calls[0][0].data;
    expect(envio).not.toHaveProperty("userId");
    expect(envio).not.toHaveProperty("respondidoEm");
    expect(envio.itens.create).toEqual([
      { perguntaId: "p1", numero: 5, texto: null },
      { perguntaId: "p2", numero: null, texto: "ótima" },
    ]);
  });

  it("identificada: o envio leva o userId e o horário", async () => {
    acessoMock.carregarEnqueteVisivel.mockResolvedValue(enquete({ anonima: false }));
    await responder(post({ respostas: { p1: 3 } }), ctx);
    expect(tx.enqueteEnvio.create.mock.calls[0][0].data).toMatchObject({ userId: "g1" });
    expect(tx.enqueteEnvio.create.mock.calls[0][0].data.respondidoEm).toBeInstanceOf(Date);
  });

  it("segunda resposta da mesma pessoa vira 409 e não grava nada a mais", async () => {
    tx.enqueteParticipacao.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await responder(post({ respostas: { p1: 4 } }), ctx);
    expect(res.status).toBe(409);
    expect(tx.enqueteEnvio.create).not.toHaveBeenCalled();
  });

  it("enquete encerrada ou fora do prazo recusa", async () => {
    acessoMock.carregarEnqueteVisivel.mockResolvedValue(enquete({ prazo: new Date("2020-01-01") }));
    expect((await responder(post({ respostas: { p1: 4 } }), ctx)).status).toBe(400);
    acessoMock.carregarEnqueteVisivel.mockResolvedValue(enquete({ encerradaEm: new Date() }));
    expect((await responder(post({ respostas: { p1: 4 } }), ctx)).status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("quem não enxerga a enquete recebe 404; resposta inválida recebe 400", async () => {
    acessoMock.carregarEnqueteVisivel.mockResolvedValue(null);
    expect((await responder(post({ respostas: { p1: 4 } }), ctx)).status).toBe(404);
    acessoMock.carregarEnqueteVisivel.mockResolvedValue(enquete());
    expect((await responder(post({ respostas: { p1: 9 } }), ctx)).status).toBe(400);
    expect((await responder(post({ respostas: {} }), ctx)).status).toBe(400);
  });
});

describe("painel da escola", () => {
  beforeEach(() => {
    sessaoMock.atual = { sub: "d1", role: "ADMIN", schoolId: "s1" };
  });

  it("anônima com menos de 3 respostas: não mostra resultados nem exporta", async () => {
    prismaMock.enqueteParticipacao.count.mockResolvedValue(2);
    const r = await (await resultados(new Request("http://t"), ctx)).json();
    expect(r.detalhesLiberados).toBe(false);
    expect(r.resultados).toEqual([]);
    expect(prismaMock.enqueteItem.findMany).not.toHaveBeenCalled();

    prismaMock.enqueteEnvio.findMany.mockResolvedValue([{ id: "a", itens: [], user: null, respondidoEm: null }]);
    expect((await exportar(new Request("http://t"), ctx)).status).toBe(400);
  });

  it("anônima com 3 respostas: mostra a média", async () => {
    prismaMock.enqueteParticipacao.count.mockResolvedValue(3);
    prismaMock.enqueteItem.findMany.mockResolvedValue([
      { perguntaId: "p1", numero: 5, texto: null },
      { perguntaId: "p1", numero: 4, texto: null },
      { perguntaId: "p1", numero: 3, texto: null },
    ]);
    const r = await (await resultados(new Request("http://t"), ctx)).json();
    expect(r.detalhesLiberados).toBe(true);
    expect(r.resultados[0].media).toBe(4);
  });

  it("lista de quem falta só existe em enquete identificada", async () => {
    expect((await pendentes(new Request("http://t"), ctx)).status).toBe(400);
    acessoMock.carregarEnqueteVisivel.mockResolvedValue(enquete({ anonima: false }));
    prismaMock.enqueteParticipacao.findMany.mockResolvedValue([{ userId: "g1" }]);
    const r = await (await pendentes(new Request("http://t"), ctx)).json();
    expect(r.pendentes.map((p: { id: string }) => p.id)).toEqual(["g2", "g3"]);
  });

  it("exportação anônima não leva nome nem horário e protege contra fórmula no Excel", async () => {
    prismaMock.enqueteEnvio.findMany.mockResolvedValue(
      ["a", "b", "c"].map((id, i) => ({
        id, user: { name: "NÃO DEVE APARECER" }, respondidoEm: new Date(),
        itens: [{ perguntaId: "p1", numero: 3, texto: null }, { perguntaId: "p2", numero: null, texto: i === 0 ? "=1+1" : "ok" }],
      })),
    );
    const csv = await (await exportar(new Request("http://t"), ctx)).text();
    expect(csv).not.toContain("NÃO DEVE APARECER");
    expect(csv).toContain("Nota?,Comentário");
    expect(csv).toContain("'=1+1");
  });
});

describe("criar enquete", () => {
  const corpo = (extra = {}) => ({
    titulo: "Satisfação", audience: "CLASS", classId: "c1", anonima: true,
    perguntas: [{ tipo: "NOTA", texto: "Nota?", obrigatoria: true }], ...extra,
  });
  const req = (b: unknown) => new NextRequest("http://t/api/enquetes", { method: "POST", body: JSON.stringify(b) });

  beforeEach(() => {
    sessaoMock.atual = { sub: "d1", role: "ADMIN", schoolId: "s1" };
    prismaMock.class.findFirst.mockResolvedValue({ id: "c1" });
    prismaMock.enquete.create.mockResolvedValue({ id: "e9", titulo: "Satisfação", schoolId: "s1", audience: "CLASS", classId: "c1", alunoId: null });
  });

  it("cria anônima por padrão e notifica o público", async () => {
    const res = await criar(req(corpo({ anonima: undefined })));
    expect(res.status).toBe(201);
    expect(prismaMock.enquete.create.mock.calls[0][0].data.anonima).toBe(true);
  });

  it("aluno individual não pode ser anônima", async () => {
    prismaMock.student.findFirst.mockResolvedValue({ id: "a1", classId: "c1" });
    const res = await criar(req(corpo({ audience: "STUDENT", alunoId: "a1", anonima: true })));
    expect(res.status).toBe(400);
    expect(prismaMock.enquete.create).not.toHaveBeenCalled();
  });

  it("múltipla escolha sem opções suficientes e tipo desconhecido são recusados", async () => {
    expect((await criar(req(corpo({ perguntas: [{ tipo: "ESCOLHA", texto: "Q", opcoes: { escolhas: ["só"] } }] })))).status).toBe(400);
    expect((await criar(req(corpo({ perguntas: [{ tipo: "EMOJI", texto: "Q" }] })))).status).toBe(400);
  });

  it("professor não publica para a escola toda", async () => {
    sessaoMock.atual = { sub: "p1", role: "STAFF", schoolId: "s1" };
    expect((await criar(req(corpo({ audience: "SCHOOL" })))).status).toBe(403);
  });
});
