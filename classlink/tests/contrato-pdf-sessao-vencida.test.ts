import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Link do PDF aberto direto no navegador com a sessão de 15 min vencida: antes o navegador
// baixava a resposta de erro (JSON) no lugar do contrato. Agora renova a sessão e leva a
// família à tela de Contratos; chamadas do app (fetch) continuam recebendo 401.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));
vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/session", () => {
  class AuthError extends Error {
    constructor(
      m: string,
      readonly status = 401,
    ) {
      super(m);
    }
  }
  return {
    AuthError,
    requireRole: vi.fn(async () => {
      throw new AuthError("Não autenticado", 401);
    }),
  };
});

import { GET as baixar } from "@/app/api/contratos/[id]/arquivos/[arquivoId]/route";

const ctx = { params: Promise.resolve({ id: "c1", arquivoId: "f1" }) } as never;
const pedir = (headers: Record<string, string>) =>
  baixar(new NextRequest("http://t/api/contratos/c1/arquivos/f1?download=1", { headers }), ctx);

describe("PDF do contrato com a sessão vencida", () => {
  it("navegação do navegador: renova a sessão e volta para Contratos", async () => {
    const res = await pedir({ "sec-fetch-dest": "document", accept: "text/html,application/pdf" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://t/api/auth/renovar?next=%2Fdashboard%2Fcontratos");
  });

  it("navegador sem Sec-Fetch-Dest: decide pelo Accept", async () => {
    const res = await pedir({ accept: "text/html" });
    expect(res.status).toBe(307);
  });

  it("fetch do app: continua 401 em JSON (o app renova e tenta de novo)", async () => {
    const res = await pedir({ "sec-fetch-dest": "empty", accept: "*/*" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Não autenticado" });
  });
});
