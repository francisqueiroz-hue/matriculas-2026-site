import { describe, it, expect } from "vitest";
import { FONTE_REGRAS_CACHE_SW } from "@/lib/sw-cache";
import { GET } from "@/app/sw.js/route";

type Req = { method?: string; url: string; mode?: string; headers?: Record<string, string> };
type Res = { ok?: boolean; status?: number; type?: string; headers?: Record<string, string> };

// Executa o mesmo código-fonte que vai dentro do sw.js.
const regras = new Function(`${FONTE_REGRAS_CACHE_SW}; return { requisicaoPodeIrParaCache, respostaPodeIrParaCache };`)() as {
  requisicaoPodeIrParaCache: (r: unknown, origem: string) => boolean;
  respostaPodeIrParaCache: (r: unknown) => boolean;
};

const ORIGEM = "https://app.escola.com.br";

function pode({ method = "GET", url, mode = "no-cors", headers = {} }: Req) {
  return regras.requisicaoPodeIrParaCache({ method, url: new URL(url, ORIGEM).href, mode, headers: new Headers(headers) }, ORIGEM);
}

function guarda({ ok = true, status = 200, type = "basic", headers = {} }: Res) {
  return regras.respostaPodeIrParaCache({ ok, status, type, headers: new Headers(headers) });
}

describe("service worker: o que pode ir para o cache", () => {
  it("aceita arquivos estáticos e públicos", () => {
    expect(pode({ url: "/_next/static/chunks/app-123.js" })).toBe(true);
    expect(pode({ url: "/_next/static/css/abc.css" })).toBe(true);
    expect(pode({ url: "/icons/icon-192.png" })).toBe(true);
    expect(pode({ url: "/logos/logo-espaco-kids.png" })).toBe(true);
    expect(pode({ url: "/manifest.json" })).toBe(true);
    expect(pode({ url: "/_next/image?url=%2Flogos%2Flogo-instituto-fokus.png&w=256&q=75" })).toBe(true);
  });

  it("recusa navegação (HTML de página)", () => {
    expect(pode({ url: "/_next/static/x.js", mode: "navigate" })).toBe(false);
    expect(pode({ url: "/dashboard", mode: "navigate" })).toBe(false);
    expect(pode({ url: "/icons/icon-192.png", headers: { Accept: "text/html,application/xhtml+xml" } })).toBe(false);
  });

  it("recusa dados de página do Next (RSC)", () => {
    expect(pode({ url: "/_next/static/x.js?_rsc=abc" })).toBe(false);
    expect(pode({ url: "/dashboard/alunos?_rsc=1x2y" })).toBe(false);
    expect(pode({ url: "/icons/icon-192.png", headers: { RSC: "1" } })).toBe(false);
    expect(pode({ url: "/icons/icon-192.png", headers: { "Next-Router-State-Tree": "%5B%5D" } })).toBe(false);
  });

  it("recusa /dashboard, /api, outras origens, outros métodos e caminhos fora da lista", () => {
    expect(pode({ url: "/dashboard/alunos/1" })).toBe(false);
    expect(pode({ url: "/api/auth/me" })).toBe(false);
    expect(pode({ url: "https://outro.site/_next/static/x.js" })).toBe(false);
    expect(pode({ url: "/_next/static/x.js", method: "POST" })).toBe(false);
    expect(pode({ url: "/" })).toBe(false);
    expect(pode({ url: "/login" })).toBe(false);
    expect(pode({ url: "/matriculas.html" })).toBe(false);
    expect(pode({ url: "/_next/image?url=https%3A%2F%2Fstorage.googleapis.com%2Ffoto.jpg&w=640&q=75" })).toBe(false);
    expect(pode({ url: "/_next/image?url=%2Flogos%2F..%2Fdashboard&w=64&q=75" })).toBe(false);
  });

  it("só guarda respostas 200 da própria origem sem no-store/private", () => {
    expect(guarda({})).toBe(true);
    expect(guarda({ headers: { "Cache-Control": "public, max-age=31536000, immutable" } })).toBe(true);
    expect(guarda({ headers: { "Cache-Control": "no-store" } })).toBe(false);
    expect(guarda({ headers: { "Cache-Control": "private, no-cache, max-age=0" } })).toBe(false);
    expect(guarda({ headers: { "Cache-Control": "max-age=0, No-Store" } })).toBe(false);
    expect(guarda({ ok: false, status: 404 })).toBe(false);
    expect(guarda({ ok: false, status: 500 })).toBe(false);
    expect(guarda({ status: 206 })).toBe(false);
    expect(guarda({ type: "opaque", ok: false, status: 0 })).toBe(false);
    expect(guarda({ type: "cors" })).toBe(false);
  });

  it("recusa respostas de página (HTML) ou de dados RSC, mesmo num caminho permitido", () => {
    expect(guarda({ headers: { "Content-Type": "image/png" } })).toBe(true);
    expect(guarda({ headers: { "Content-Type": "application/javascript; charset=utf-8" } })).toBe(true);
    expect(guarda({ headers: { "Content-Type": "text/css; charset=utf-8" } })).toBe(true);
    expect(guarda({ headers: { "Content-Type": "application/manifest+json" } })).toBe(true);
    expect(guarda({ headers: { "Content-Type": "text/html; charset=utf-8" } })).toBe(false);
    expect(guarda({ headers: { "Content-Type": "application/xhtml+xml" } })).toBe(false);
    expect(guarda({ headers: { "Content-Type": "text/x-component" } })).toBe(false);
    expect(guarda({ headers: { "Content-Type": "application/x-rsc" } })).toBe(false);
  });
});

describe("GET /sw.js", () => {
  it("serve o script v2 com as regras, sem cache HTTP e com sintaxe válida", async () => {
    const res = await GET();
    const corpo = await res.text();
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(corpo).toContain('const CACHE_NAME = "classlink-shell-v2"');
    expect(corpo).not.toContain('"classlink-shell-v1"');
    expect(corpo).toContain("function requisicaoPodeIrParaCache");
    expect(corpo).toContain("self.skipWaiting()");
    expect(corpo).toContain("self.clients.claim()");
    expect(corpo).toContain('addEventListener("notificationclick"');
    // O install também passa pelo predicado (nada de cache.addAll direto).
    expect(corpo).not.toContain("addAll(");
    expect(corpo).toMatch(/respostaPodeIrParaCache\(response\) \? cache\.put\(caminho, response\)/);
    // Só compila (não executa): erro de sintaxe no script quebraria o service worker inteiro.
    expect(() => new Function(corpo)).not.toThrow();
  });
});
