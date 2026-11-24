// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";

const prismaMock = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  refreshToken: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ sub: "u1", role: "GUARDIAN", schoolId: "s1", name: "Maria" })),
  AuthError: class AuthError extends Error {},
}));
const caminho = vi.hoisted(() => ({ atual: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => caminho.atual }));

import { POST as trocarSenha } from "@/app/api/account/change-password/route";
import { SenhaProvisoriaBanner } from "@/components/SenhaProvisoriaBanner";
import { UserProvider } from "@/components/UserContext";

const usuario = (senhaProvisoria: boolean): SessionUser => ({
  id: "u1",
  name: "Maria",
  email: null,
  role: "GUARDIAN",
  schoolId: "s1",
  schoolName: "Escola",
  isCoordenacao: false,
  senhaProvisoria,
});

describe("aviso de senha provisória", () => {
  it("aparece para quem entrou com senha provisória e leva a Minha conta", () => {
    caminho.atual = "/dashboard";
    render(createElement(UserProvider, { user: usuario(true), children: createElement(SenhaProvisoriaBanner) }));
    expect(screen.getByText(/senha provisória/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Trocar senha agora" }).getAttribute("href")).toBe("/dashboard/conta#trocar-senha");
  });

  it("não aparece para quem já tem senha própria", () => {
    cleanup();
    const { container } = render(createElement(UserProvider, { user: usuario(false), children: createElement(SenhaProvisoriaBanner) }));
    expect(container.textContent).toBe("");
  });
});

describe("trocar a senha", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ id: "u1", passwordHash: await hashPassword("provisoria1") });
    prismaMock.user.update.mockReturnValue("update");
    prismaMock.refreshToken.updateMany.mockReturnValue("sessoes");
    prismaMock.$transaction.mockResolvedValue([]);
  });

  it("tira a marca de senha provisória", async () => {
    const req = new NextRequest("http://t/api/account/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: "provisoria1", newPassword: "minha-senha-nova" }),
    });
    const res = await trocarSenha(req);
    expect(res.status).toBe(200);
    expect(prismaMock.user.update.mock.calls[0][0].data).toMatchObject({ senhaProvisoria: false });
  });
});
