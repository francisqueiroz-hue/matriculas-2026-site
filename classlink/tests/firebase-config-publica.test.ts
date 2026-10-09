import { describe, expect, it } from "vitest";
import { limparValorPublico, problemasConfigPublica } from "@/lib/firebase-config-publica";

const CHAVE = "AIzaSyA1234567890abcdefghijklmnopqrstuv";

describe("limparValorPublico", () => {
  it("remove espaço invisível, BOM, aspas curvas e quebras de linha", () => {
    expect(limparValorPublico(`​${CHAVE}​`)).toBe(CHAVE);
    expect(limparValorPublico(`﻿“${CHAVE}”\n`)).toBe(CHAVE);
    expect(limparValorPublico(`"${CHAVE}"`)).toBe(CHAVE);
    expect(limparValorPublico("   ")).toBeUndefined();
  });

  it("o resultado sempre é aceito como cabeçalho HTTP", () => {
    expect(() => new Headers({ "x-goog-api-key": limparValorPublico(`${CHAVE}​ `)! })).not.toThrow();
  });
});

describe("problemasConfigPublica", () => {
  it("aponta a variável com caractere a mais ou formato errado, sem expor o valor", () => {
    const p = problemasConfigPublica({
      NEXT_PUBLIC_FIREBASE_API_KEY: `${CHAVE}​`,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "classlink-123",
      NEXT_PUBLIC_FIREBASE_APP_ID: "errado",
    });
    expect(p).toEqual([
      { nome: "NEXT_PUBLIC_FIREBASE_API_KEY", problema: "tem espaço, aspas ou caractere invisível a mais" },
      { nome: "NEXT_PUBLIC_FIREBASE_APP_ID", problema: "formato inesperado — confira se colou o valor certo" },
    ]);
    expect(JSON.stringify(p)).not.toContain(CHAVE);
  });
});

describe("teste da chave do Firebase", () => {
  it("detecta variáveis de projetos diferentes", async () => {
    const { conferirMesmoProjeto } = await import("@/lib/firebase-config-publica");
    const itens = conferirMesmoProjeto({
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "classlink-a",
      FIREBASE_PROJECT_ID: "classlink-b",
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:111:web:abc",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "222",
    });
    expect(itens.map((i) => i.ok)).toEqual([false, false]);
  });

  it("faz o pedido ao Google com a origem do site e traduz o 403", async () => {
    const { testarChaveNoGoogle } = await import("@/lib/firebase-config-publica");
    const chamadas: { url: string; init?: RequestInit }[] = [];
    const fetchFalso = (async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify({ error: { message: "The caller does not have permission" } }), { status: 403 });
    }) as unknown as typeof fetch;
    const r = await testarChaveNoGoogle(
      { NEXT_PUBLIC_FIREBASE_API_KEY: CHAVE, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "classlink-a", NEXT_PUBLIC_FIREBASE_APP_ID: "1:111:web:abc" },
      "https://classlink.vercel.app",
      fetchFalso,
    );
    expect(r.ok).toBe(false);
    expect(r.detalhe).toContain("outro projeto");
    expect(chamadas[0].url).toBe("https://firebaseinstallations.googleapis.com/v1/projects/classlink-a/installations");
    const headers = chamadas[0].init?.headers as Record<string, string>;
    expect(headers.Referer).toBe("https://classlink.vercel.app/");
    const corpo = JSON.parse(String(chamadas[0].init?.body));
    expect(corpo.fid).toMatch(/^[cdef][A-Za-z0-9_-]{21}$/);
  });
});
