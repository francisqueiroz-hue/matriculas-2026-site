import { describe, expect, it, vi } from "vitest";

vi.mock("@prisma/client", () => ({ PrismaClient: class {} }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));

import { urlComSslVerificado } from "@/lib/prisma";

describe("conexão com o banco", () => {
  it("fixa sslmode=verify-full (o comportamento atual do driver), sem mexer no resto", () => {
    expect(urlComSslVerificado("postgresql://u:p@h/db?sslmode=require")).toBe("postgresql://u:p@h/db?sslmode=verify-full");
    expect(urlComSslVerificado("postgresql://u:p@h/db?sslmode=require&channel_binding=require")).toBe(
      "postgresql://u:p@h/db?sslmode=verify-full&channel_binding=require",
    );
    expect(urlComSslVerificado("postgresql://u:p@h/db?x=1&sslmode=prefer")).toBe("postgresql://u:p@h/db?x=1&sslmode=verify-full");
    expect(urlComSslVerificado("postgresql://u:p@h/db?sslmode=disable")).toBe("postgresql://u:p@h/db?sslmode=disable");
    expect(urlComSslVerificado("postgresql://u:p@localhost/db")).toBe("postgresql://u:p@localhost/db");
  });
});
