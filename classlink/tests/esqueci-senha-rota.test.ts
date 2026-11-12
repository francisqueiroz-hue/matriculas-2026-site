import { describe, it, expect, vi, beforeEach } from "vitest";

const afterTarefas = vi.hoisted(() => [] as Array<() => Promise<void> | void>);
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return { ...real, after: (fn: () => Promise<void> | void) => void afterTarefas.push(fn) };
});

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  refreshToken: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ hashPassword: vi.fn(async () => "hash-novo") }));
vi.mock("@/lib/envio-acesso", () => ({ enviarAcessoPeloApp: vi.fn() }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: vi.fn(() => true), sendPlainEmail: vi.fn() }));
vi.mock("@/lib/push", () => ({ origemPublica: vi.fn(() => "https://app.escola.com") }));
vi.mock("@/lib/limite-tentativas", () => ({ contarTentativaSemFalhar: vi.fn() }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/forgot-password/route";
import { contarTentativaSemFalhar } from "@/lib/limite-tentativas";
import { enviarAcessoPeloApp } from "@/lib/envio-acesso";
import { sendPlainEmail } from "@/lib/email";

const livre = { falhas: 1, bloqueado: false as const, segundos: 0, bloqueadoAte: null };
const travado = { falhas: 4, bloqueado: true as const, segundos: 3600, bloqueadoAte: new Date() };

function req(identifier = "pai@escola.com", ip?: string) {
  return new NextRequest("http://t/api/auth/forgot-password", {
    method: "POST",
    headers: ip ? { "x-real-ip": ip } : {},
    body: JSON.stringify({ identifier }),
  });
}

async function rodarTarefas() {
  for (const t of afterTarefas.splice(0)) await t();
}

const usuario = { id: "u1", email: "pai@escola.com", phone: null, active: true, deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  afterTarefas.length = 0;
  process.env.JWT_ACCESS_SECRET = "segredo-de-teste";
  vi.mocked(contarTentativaSemFalhar).mockResolvedValue(livre);
  prismaMock.user.findUnique.mockResolvedValue(usuario);
  prismaMock.user.update.mockReturnValue("update");
  prismaMock.refreshToken.updateMany.mockReturnValue("revoga");
  prismaMock.$transaction.mockResolvedValue([]);
});

describe("POST /api/auth/forgot-password", () => {
  it("responde a mesma mensagem genérica sem fazer o trabalho na hora", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/Se encontrarmos uma conta/);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled(); // só roda depois da resposta
    expect(afterTarefas).toHaveLength(1);
  });

  it("conta existente e e-mail enviado: troca a senha e derruba as sessões", async () => {
    await POST(req());
    await rodarTarefas();
    expect(sendPlainEmail).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("conta inexistente: mesma resposta, nada é enviado nem trocado", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await POST(req("ninguem@escola.com"));
    expect(res.status).toBe(200);
    await rodarTarefas();
    expect(sendPlainEmail).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("e-mail falhou: a senha não é trocada (a pessoa não fica sem acesso)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendPlainEmail).mockRejectedValue(new Error("smtp"));
    await POST(req());
    await rodarTarefas();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("entrega pelo WhatsApp aceita: não troca senha nem manda e-mail", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...usuario, phone: "5511999999999" });
    vi.mocked(enviarAcessoPeloApp).mockResolvedValue({ enviado: true } as never);
    await POST(req());
    await rodarTarefas();
    expect(sendPlainEmail).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("conta bloqueada: 429 com Retry-After e nenhum trabalho agendado", async () => {
    vi.mocked(contarTentativaSemFalhar).mockResolvedValueOnce(travado);
    const res = await POST(req("pai@escola.com"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect((await res.json()).error).toMatch(/Muitas tentativas/);
    expect(afterTarefas).toHaveLength(0);
  });

  it("IP bloqueado: 429 sem nem contar a conta", async () => {
    vi.mocked(contarTentativaSemFalhar).mockResolvedValueOnce(travado);
    const res = await POST(req("pai@escola.com", "203.0.113.7"));
    expect(res.status).toBe(429);
    expect(contarTentativaSemFalhar).toHaveBeenCalledTimes(1);
    expect(afterTarefas).toHaveLength(0);
  });

  it("conta o IP e a conta, mesmo quando o e-mail não existe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await POST(req("ninguem@escola.com", "203.0.113.7"));
    expect(contarTentativaSemFalhar).toHaveBeenCalledTimes(2);
  });

  it("sem identificador válido: resposta genérica, sem contar nada", async () => {
    const res = await POST(req("sem-formato-valido"));
    expect(res.status).toBe(200);
    expect(contarTentativaSemFalhar).not.toHaveBeenCalled();
    expect(afterTarefas).toHaveLength(0);
  });
});
