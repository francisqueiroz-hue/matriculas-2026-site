import { describe, it, expect } from "vitest";
import { auditarArquivo } from "./helpers/auditar-a11y";

// Arquivos já corrigidos: não podem voltar a ter campo sem rótulo nem botão sem `type`.
// Cada lote de correção de acessibilidade acrescenta os seus arquivos aqui.
const ARQUIVOS_CORRIGIDOS = [
  "src/app/login/page.tsx",
  "src/app/esqueci-senha/page.tsx",
  "src/app/dashboard/conta/page.tsx",
  "src/app/dashboard/agenda/page.tsx",
  "src/app/dashboard/boletim/page.tsx",
  "src/app/dashboard/notas/page.tsx",
  "src/app/dashboard/mensagens/page.tsx",
  "src/app/dashboard/mensagens/[id]/page.tsx",
];

describe("acessibilidade dos formulários", () => {
  for (const arquivo of ARQUIVOS_CORRIGIDOS) {
    it(`${arquivo}: campos com rótulo e botões com type`, () => {
      expect(auditarArquivo(arquivo)).toEqual([]);
    });
  }

  it("o auditor detecta os problemas (não é um teste vazio)", () => {
    const achados = auditarArquivo("tests/helpers/exemplo-ruim.tsx");
    expect(achados.map((a) => a.problema.split(" ")[0]).sort()).toEqual(["<button>", "<input>", "<select>"]);
  });
});
