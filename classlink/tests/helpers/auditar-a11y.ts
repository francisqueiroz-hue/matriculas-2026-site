import ts from "typescript";
import fs from "node:fs";

export type Achado = { arquivo: string; linha: number; problema: string };

function atributos(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement) {
  const m: Record<string, string> = {};
  let spread = false;
  for (const a of el.attributes.properties) {
    if (ts.isJsxAttribute(a)) m[a.name.getText()] = a.initializer ? a.initializer.getText() : "true";
    else spread = true;
  }
  return { m, spread };
}

/** Procura, no JSX de um arquivo .tsx, campos sem rótulo associado e botões sem `type`. */
export function auditarArquivo(arquivo: string): Achado[] {
  const sf = ts.createSourceFile(arquivo, fs.readFileSync(arquivo, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const achados: Achado[] = [];
  const labelFor = new Set<string>();

  const coletar = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText() === "label") {
      const { m } = atributos(n);
      if (m.htmlFor) labelFor.add(m.htmlFor);
    }
    ts.forEachChild(n, coletar);
  };
  coletar(sf);

  const visitar = (n: ts.Node, dentroDeLabel: boolean) => {
    const dentro = dentroDeLabel || (ts.isJsxElement(n) && n.openingElement.tagName.getText() === "label");
    const el = ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n) ? n : null;
    if (el) {
      const tag = el.tagName.getText();
      const { m, spread } = atributos(el);
      const linha = sf.getLineAndCharacterOfPosition(el.getStart()).line + 1;
      if (["input", "select", "textarea"].includes(tag) && !spread) {
        const tipo = (m.type ?? "").replace(/['"]/g, "");
        const rotulado = m["aria-label"] || m["aria-labelledby"] || (m.id && labelFor.has(m.id)) || dentro || tipo === "hidden";
        if (!rotulado) achados.push({ arquivo, linha, problema: `<${tag}> sem rótulo (use <label htmlFor>, aria-label ou envolva em <label>)` });
      }
      if (tag === "button" && !m.type && !spread) achados.push({ arquivo, linha, problema: '<button> sem type (use type="button" ou type="submit")' });
    }
    ts.forEachChild(n, (c) => visitar(c, dentro));
  };
  visitar(sf, false);
  return achados;
}
