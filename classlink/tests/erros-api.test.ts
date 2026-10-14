import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError, z } from "zod";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { handleApiError } from "@/lib/http";
import { AuthError } from "@/lib/session";
import { ErroDeUsuario, MENSAGEM_ERRO_GENERICO } from "@/lib/erros";

async function corpo(res: Response) {
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("handleApiError", () => {
  it("repassa a mensagem de ErroDeUsuario com o status dele", async () => {
    expect(await corpo(handleApiError(new ErroDeUsuario("Data inválida (use AAAA-MM-DD)")))).toEqual({
      status: 400,
      json: { error: "Data inválida (use AAAA-MM-DD)" },
    });
    expect((await corpo(handleApiError(new ErroDeUsuario("x", 502)))).status).toBe(502);
  });

  it("NÃO vaza mensagem de Error comum (variável de ambiente, provedor)", async () => {
    const r = await corpo(handleApiError(new Error("JWT_ACCESS_SECRET não configurado")));
    expect(r.status).toBe(500);
    expect(r.json.error).toBe(MENSAGEM_ERRO_GENERICO);
    expect(JSON.stringify(r.json)).not.toContain("JWT_ACCESS_SECRET");
  });

  it("NÃO vaza detalhes de erro do Prisma", async () => {
    const prismaErr = Object.assign(new Error("Invalid `prisma.user.findMany()` invocation: column \"passwordHash\" ..."), {
      code: "P2022",
      name: "PrismaClientKnownRequestError",
    });
    const r = await corpo(handleApiError(prismaErr));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toMatch(/prisma|passwordHash/i);
  });

  it("registra o erro original no log do servidor", () => {
    const err = new Error("detalhe técnico");
    handleApiError(err);
    expect(console.error).toHaveBeenCalledWith(err);
  });

  it("valor que não é Error também vira resposta genérica", async () => {
    const r = await corpo(handleApiError("texto solto"));
    expect(r).toEqual({ status: 500, json: { error: MENSAGEM_ERRO_GENERICO } });
  });

  it("mantém o comportamento de AuthError, ZodError e violação de unicidade", async () => {
    expect(await corpo(handleApiError(new AuthError("Não autorizado", 401)))).toEqual({ status: 401, json: { error: "Não autorizado" } });
    const zod = z.object({ a: z.string() }).safeParse({});
    expect(zod.success).toBe(false);
    const rz = await corpo(handleApiError((zod as { error: ZodError }).error));
    expect(rz.status).toBe(400);
    expect(rz.json.error).toBe("Dados inválidos");
    const r = await corpo(handleApiError({ code: "P2002", meta: { target: ["phone"] }, message: "Unique" }));
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/celular/i);
  });
});
