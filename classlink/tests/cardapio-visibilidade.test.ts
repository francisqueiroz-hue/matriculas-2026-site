import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  guardianStudent: { findMany: vi.fn() },
  classTeacher: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/firebase-storage", () => ({ getSignedMediaUrl: vi.fn() }));
vi.mock("@/lib/permissoes-mensagens", () => ({ perfilDoUsuario: vi.fn(async () => "familia") }));

import { turmasVisiveis } from "@/lib/cardapios-acesso";

beforeEach(() => vi.clearAllMocks());

describe("cardápio por turma", () => {
  it("família só enxerga as turmas dos filhos (5º ano nunca vê o berçário)", async () => {
    prismaMock.guardianStudent.findMany.mockResolvedValue([{ student: { classId: "5ano" } }]);
    expect(await turmasVisiveis({ sub: "pai1", role: "GUARDIAN" })).toEqual(["5ano"]);
  });

  it("família com filhos em duas turmas vê as duas, sem repetir", async () => {
    prismaMock.guardianStudent.findMany.mockResolvedValue([
      { student: { classId: "bercario" } },
      { student: { classId: "5ano" } },
      { student: { classId: "5ano" } },
    ]);
    expect(await turmasVisiveis({ sub: "pai2", role: "GUARDIAN" })).toEqual(["bercario", "5ano"]);
  });
});
