import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { auditarArquivo } from "./helpers/auditar-a11y";

function* arquivosTsx(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* arquivosTsx(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}

describe("acessibilidade dos formulários (app inteiro)", () => {
  it("todo campo tem rótulo e todo botão tem type", () => {
    const achados = [...arquivosTsx("src")].flatMap(auditarArquivo);
    const resumo = achados.map((a) => `${a.arquivo}:${a.linha} ${a.problema}`);
    expect(resumo).toEqual([]);
  });

  it("o auditor detecta os problemas (não é um teste vazio)", () => {
    const achados = auditarArquivo("tests/helpers/exemplo-ruim.tsx");
    expect(achados.map((a) => a.problema.split(" ")[0]).sort()).toEqual(["<button>", "<input>", "<select>"]);
  });
});
