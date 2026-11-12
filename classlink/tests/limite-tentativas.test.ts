import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  loginTentativa: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { contarTentativa, contarTentativaSemFalhar, estaBloqueada } from "@/lib/limite-tentativas";

const politica = { max: 3, janelaMs: 60_000, bloqueioMs: 120_000 };
const agora = new Date("2026-11-12T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.loginTentativa.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.loginTentativa.updateMany.mockResolvedValue({ count: 1 });
});

describe("contarTentativa", () => {
  it("incrementa pelo banco (atômico) em vez de ler e gravar", async () => {
    prismaMock.loginTentativa.upsert.mockResolvedValue({ falhas: 1, bloqueadoAte: null });
    const r = await contarTentativa("k", politica, agora);
    const arg = prismaMock.loginTentativa.upsert.mock.calls[0][0];
    expect(arg.update).toEqual({ falhas: { increment: 1 } });
    expect(arg.create).toMatchObject({ chave: "k", falhas: 1, bloqueadoAte: null });
    expect(r).toMatchObject({ falhas: 1, bloqueado: false, segundos: 0 });
  });

  it("dentro do máximo não bloqueia nem grava bloqueio", async () => {
    prismaMock.loginTentativa.upsert.mockResolvedValue({ falhas: 3, bloqueadoAte: null });
    const r = await contarTentativa("k", politica, agora);
    expect(r.bloqueado).toBe(false);
    expect(prismaMock.loginTentativa.updateMany).not.toHaveBeenCalled();
  });

  it("passou do máximo: bloqueia e grava o fim do bloqueio só se ainda não houver um", async () => {
    prismaMock.loginTentativa.upsert.mockResolvedValue({ falhas: 4, bloqueadoAte: null });
    const r = await contarTentativa("k", politica, agora);
    expect(r.bloqueado).toBe(true);
    expect(r.segundos).toBe(120);
    expect(prismaMock.loginTentativa.updateMany).toHaveBeenCalledWith({
      where: { chave: "k", bloqueadoAte: null },
      data: { bloqueadoAte: new Date(agora.getTime() + 120_000) },
    });
  });

  it("já bloqueada: devolve os segundos que faltam sem estender o bloqueio", async () => {
    prismaMock.loginTentativa.upsert.mockResolvedValue({ falhas: 9, bloqueadoAte: new Date(agora.getTime() + 30_000) });
    const r = await contarTentativa("k", politica, agora);
    expect(r).toMatchObject({ bloqueado: true, segundos: 30 });
    expect(prismaMock.loginTentativa.updateMany).not.toHaveBeenCalled();
  });

  it("antes de contar, zera só o registro vencido (bloqueio acabou ou janela expirou)", async () => {
    prismaMock.loginTentativa.upsert.mockResolvedValue({ falhas: 1, bloqueadoAte: null });
    await contarTentativa("k", politica, agora);
    expect(prismaMock.loginTentativa.deleteMany).toHaveBeenCalledWith({
      where: {
        chave: "k",
        OR: [{ bloqueadoAte: { lte: agora } }, { primeiraFalhaEm: { lt: new Date(agora.getTime() - 60_000) } }],
      },
    });
  });

  it("duas primeiras tentativas simultâneas: a que perde a criação tenta de novo e só incrementa", async () => {
    prismaMock.loginTentativa.upsert
      .mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }))
      .mockResolvedValueOnce({ falhas: 2, bloqueadoAte: null });
    const r = await contarTentativa("k", politica, agora);
    expect(prismaMock.loginTentativa.upsert).toHaveBeenCalledTimes(2);
    expect(r.falhas).toBe(2);
  });

  it("outros erros do banco não são engolidos", async () => {
    prismaMock.loginTentativa.upsert.mockRejectedValue(new Error("fora do ar"));
    await expect(contarTentativa("k", politica, agora)).rejects.toThrow("fora do ar");
  });

  it("rajada paralela: cada requisição recebe uma contagem diferente e só as 3 primeiras ficam livres", async () => {
    let n = 0;
    prismaMock.loginTentativa.upsert.mockImplementation(async () => ({ falhas: ++n, bloqueadoAte: null }));
    const resultados = await Promise.all(Array.from({ length: 20 }, () => contarTentativa("k", politica, agora)));
    expect(resultados.filter((r) => !r.bloqueado)).toHaveLength(3);
    expect(new Set(resultados.map((r) => r.falhas)).size).toBe(20);
  });
});

describe("contarTentativaSemFalhar", () => {
  it("se a tabela falhar, registra o erro e libera (o limitador não derruba o login)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.loginTentativa.deleteMany.mockRejectedValue(new Error("relation does not exist"));
    const r = await contarTentativaSemFalhar("k", politica, agora);
    expect(r.bloqueado).toBe(false);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("estaBloqueada", () => {
  it("sem registro ou com bloqueio vencido, não bloqueia", async () => {
    prismaMock.loginTentativa.findUnique.mockResolvedValue(null);
    expect(await estaBloqueada("k", agora)).toEqual({ bloqueado: false });
    prismaMock.loginTentativa.findUnique.mockResolvedValue({ bloqueadoAte: new Date(agora.getTime() - 1) });
    expect(await estaBloqueada("k", agora)).toEqual({ bloqueado: false });
  });

  it("com bloqueio ativo, informa os segundos (arredondando para cima) e não conta tentativa", async () => {
    prismaMock.loginTentativa.findUnique.mockResolvedValue({ bloqueadoAte: new Date(agora.getTime() + 1_500) });
    expect(await estaBloqueada("k", agora)).toEqual({ bloqueado: true, segundos: 2 });
    expect(prismaMock.loginTentativa.upsert).not.toHaveBeenCalled();
  });
});
