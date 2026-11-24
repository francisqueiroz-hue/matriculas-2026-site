import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ sub: "u1", role: "GUARDIAN", schoolId: "s1", name: "Maria" })),
  AuthError: class AuthError extends Error {},
}));

import { POST } from "@/app/api/account/update-email/route";

const req = (corpo: unknown) => new NextRequest("http://t/api/account/update-email", { method: "POST", body: JSON.stringify(corpo) });

beforeEach(async () => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.user.findUniqueOrThrow.mockResolvedValue({ passwordHash: await hashPassword("senha-certa") });
  prismaMock.user.update.mockImplementation(async ({ data }: { data: { email: string } }) => ({ id: "u1", email: data.email }));
});

describe("adicionar e-mail à conta", () => {
  it("com a senha atual correta, salva o e-mail", async () => {
    const res = await POST(req({ email: "Maria@Exemplo.com", currentPassword: "senha-certa" }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update.mock.calls[0][0]).toMatchObject({ where: { id: "u1" }, data: { email: "maria@exemplo.com" } });
  });

  it("com a senha errada, recusa sem mexer no cadastro", async () => {
    const res = await POST(req({ email: "maria@exemplo.com", currentPassword: "outra" }));
    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("sem a senha, recusa (quem só tem a sessão aberta não troca o canal de recuperação)", async () => {
    const res = await POST(req({ email: "maria@exemplo.com" }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
