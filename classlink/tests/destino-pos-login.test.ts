import { describe, expect, it } from "vitest";
import { destinoPosLogin } from "@/lib/destino-pos-login";

describe("destinoPosLogin", () => {
  it("aceita caminhos do painel", () => {
    expect(destinoPosLogin("/dashboard")).toBe("/dashboard");
    expect(destinoPosLogin("/dashboard/mural")).toBe("/dashboard/mural");
    expect(destinoPosLogin("/dashboard/comunicados/abc123")).toBe("/dashboard/comunicados/abc123");
  });

  it("preserva query string e hash dentro do painel", () => {
    expect(destinoPosLogin("/dashboard/frequencia?mes=2026-10")).toBe("/dashboard/frequencia?mes=2026-10");
    expect(destinoPosLogin("/dashboard/mensagens#fim")).toBe("/dashboard/mensagens#fim");
  });

  it("usa /dashboard quando não há next", () => {
    expect(destinoPosLogin(null)).toBe("/dashboard");
    expect(destinoPosLogin(undefined)).toBe("/dashboard");
    expect(destinoPosLogin("")).toBe("/dashboard");
  });

  it("recusa URLs absolutas e esquemas perigosos", () => {
    expect(destinoPosLogin("https://site-falso.com")).toBe("/dashboard");
    expect(destinoPosLogin("http://site-falso.com/dashboard")).toBe("/dashboard");
    expect(destinoPosLogin("javascript:alert(1)")).toBe("/dashboard");
    expect(destinoPosLogin("data:text/html,<script>alert(1)</script>")).toBe("/dashboard");
  });

  it("recusa URLs relativas ao protocolo e variações com barra invertida", () => {
    expect(destinoPosLogin("//site-falso.com")).toBe("/dashboard");
    expect(destinoPosLogin("/\\site-falso.com")).toBe("/dashboard");
    expect(destinoPosLogin("\\\\site-falso.com")).toBe("/dashboard");
    expect(destinoPosLogin("/dashboard\\..\\x")).toBe("/dashboard");
  });

  it("recusa caracteres de controle usados para disfarçar o destino", () => {
    expect(destinoPosLogin("/\t/site-falso.com")).toBe("/dashboard");
    expect(destinoPosLogin("/\n/site-falso.com")).toBe("/dashboard");
    expect(destinoPosLogin("/dashboard/\r\nx")).toBe("/dashboard");
    expect(destinoPosLogin("/dashboard/\u0000")).toBe("/dashboard");
  });

  it("recusa caminhos fora do painel", () => {
    expect(destinoPosLogin("/login")).toBe("/dashboard");
    expect(destinoPosLogin("/api/auth/logout")).toBe("/dashboard");
    expect(destinoPosLogin("/dashboardx")).toBe("/dashboard");
    expect(destinoPosLogin("/dashboard-falso/x")).toBe("/dashboard");
  });

  it("recusa saída do painel via ..", () => {
    expect(destinoPosLogin("/dashboard/../login")).toBe("/dashboard");
    expect(destinoPosLogin("/dashboard/%2e%2e/login")).toBe("/dashboard");
  });

  it("recusa valores absurdamente longos", () => {
    expect(destinoPosLogin(`/dashboard/${"a".repeat(3000)}`)).toBe("/dashboard");
  });
});
