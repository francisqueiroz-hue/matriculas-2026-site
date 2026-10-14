import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { JANELA_REUSO_MS, caminhoParaRenovar, situacaoRefresh, type RefreshArmazenado } from "@/lib/renovacao-sessao";

// Estas rotas importam o banco só por meio do helper; ele é simulado aqui.
const renovarSessao = vi.fn();
vi.mock("@/lib/renovar-sessao-servidor", () => ({ renovarSessao: (...args: unknown[]) => renovarSessao(...args) }));

const agora = new Date("2026-10-14T15:00:00Z");
const base = (extra: Partial<RefreshArmazenado> = {}): RefreshArmazenado => ({
  revokedAt: null,
  expiresAt: new Date("2026-11-01T00:00:00Z"),
  user: { active: true, deletedAt: null },
  ...extra,
});

describe("situacaoRefresh", () => {
  it("aceita token ativo", () => {
    expect(situacaoRefresh(base(), agora)).toBe("valido");
  });

  it("recusa token inexistente, expirado ou de conta desativada/excluída", () => {
    expect(situacaoRefresh(null, agora)).toBe("invalido");
    expect(situacaoRefresh(undefined, agora)).toBe("invalido");
    expect(situacaoRefresh(base({ expiresAt: new Date("2026-10-14T14:59:59Z") }), agora)).toBe("invalido");
    expect(situacaoRefresh(base({ expiresAt: agora }), agora)).toBe("invalido");
    expect(situacaoRefresh(base({ user: { active: false, deletedAt: null } }), agora)).toBe("invalido");
    expect(situacaoRefresh(base({ user: { active: true, deletedAt: new Date("2026-10-01") } }), agora)).toBe("invalido");
  });

  it("tolera reuso de token revogado há poucos segundos (várias requisições ao abrir o app)", () => {
    const revogadoHa = (ms: number) => base({ revokedAt: new Date(agora.getTime() - ms) });
    expect(situacaoRefresh(revogadoHa(0), agora)).toBe("reuso_recente");
    expect(situacaoRefresh(revogadoHa(2_000), agora)).toBe("reuso_recente");
    expect(situacaoRefresh(revogadoHa(JANELA_REUSO_MS), agora)).toBe("reuso_recente");
  });

  it("recusa reuso fora da janela (possível roubo) e revogação 'no futuro'", () => {
    expect(situacaoRefresh(base({ revokedAt: new Date(agora.getTime() - JANELA_REUSO_MS - 1) }), agora)).toBe("invalido");
    expect(situacaoRefresh(base({ revokedAt: new Date(agora.getTime() - 3_600_000) }), agora)).toBe("invalido");
    expect(situacaoRefresh(base({ revokedAt: new Date(agora.getTime() + 5_000) }), agora)).toBe("invalido");
  });

  it("reuso recente não vale para token expirado nem de conta excluída", () => {
    const rev = new Date(agora.getTime() - 1_000);
    expect(situacaoRefresh(base({ revokedAt: rev, expiresAt: new Date("2026-10-14T14:00:00Z") }), agora)).toBe("invalido");
    expect(situacaoRefresh(base({ revokedAt: rev, user: { active: true, deletedAt: new Date() } }), agora)).toBe("invalido");
  });
});

describe("caminhoParaRenovar", () => {
  it("codifica o destino, com query", () => {
    expect(caminhoParaRenovar("/dashboard/mural")).toBe("/api/auth/renovar?next=%2Fdashboard%2Fmural");
    expect(caminhoParaRenovar("/dashboard/frequencia", "?mes=2026-10")).toBe(
      "/api/auth/renovar?next=%2Fdashboard%2Ffrequencia%3Fmes%3D2026-10",
    );
  });
});

describe("GET /api/auth/renovar", () => {
  beforeEach(() => renovarSessao.mockReset());

  async function chamar(url: string, cookie?: string) {
    const { GET } = await import("@/app/api/auth/renovar/route");
    const request = new NextRequest(url, { headers: cookie ? { cookie } : {} });
    return GET(request);
  }

  it("com refresh válido: volta ao destino e grava os dois cookies", async () => {
    renovarSessao.mockResolvedValue({ accessToken: "ACESSO", refreshToken: "REFRESH2" });
    const res = await chamar("https://app.test/api/auth/renovar?next=%2Fdashboard%2Fagenda", "classlink_refresh=REFRESH1");
    expect(renovarSessao).toHaveBeenCalledWith("REFRESH1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/dashboard/agenda");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("classlink_access=ACESSO");
    expect(cookies).toContain("classlink_refresh=REFRESH2");
  });

  it("sem cookie de refresh: vai ao login guardando o destino, sem consultar o banco", async () => {
    const res = await chamar("https://app.test/api/auth/renovar?next=%2Fdashboard%2Fmural");
    expect(renovarSessao).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://app.test/login?next=%2Fdashboard%2Fmural");
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("refresh inválido ou falha no banco: vai ao login", async () => {
    renovarSessao.mockResolvedValueOnce(null);
    let res = await chamar("https://app.test/api/auth/renovar?next=%2Fdashboard%2Fmural", "classlink_refresh=X");
    expect(res.headers.get("location")).toBe("https://app.test/login?next=%2Fdashboard%2Fmural");

    renovarSessao.mockRejectedValueOnce(new Error("banco fora"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    res = await chamar("https://app.test/api/auth/renovar?next=%2Fdashboard%2Fmural", "classlink_refresh=X");
    expect(res.headers.get("location")).toBe("https://app.test/login?next=%2Fdashboard%2Fmural");
    erro.mockRestore();
  });

  it("não permite open redirect: destino fora do painel vira /dashboard", async () => {
    renovarSessao.mockResolvedValue({ accessToken: "A", refreshToken: "R" });
    for (const next of ["https://site-falso.com", "//site-falso.com", "/login", "javascript:alert(1)"]) {
      const res = await chamar(`https://app.test/api/auth/renovar?next=${encodeURIComponent(next)}`, "classlink_refresh=X");
      expect(res.headers.get("location")).toBe("https://app.test/dashboard");
    }
  });
});
