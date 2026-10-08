/** Embute painel/* em src/painel-html.ts (o Worker não lê arquivos em tempo de execução). */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ARQUIVOS: [string, string][] = [
  ["index.html", "text/html; charset=utf-8"],
  ["manifest.json", "application/manifest+json; charset=utf-8"],
  ["sw.js", "text/javascript; charset=utf-8"],
];

export function gerarModuloPainel(): string {
  const dir = join(import.meta.dirname, "..", "painel");
  const corpo = Object.fromEntries(ARQUIVOS.map(([nome, tipo]) => [nome, { tipo, corpo: readFileSync(join(dir, nome), "utf8") }]));
  return `// GERADO por scripts/gerar-painel.ts (npm run gerar:painel) — não edite.\nexport const PAINEL_ARQUIVOS: Record<string, { tipo: string; corpo: string }> = ${JSON.stringify(corpo, null, 2)};\n`;
}

if (process.argv[1]?.endsWith("gerar-painel.ts")) {
  writeFileSync(join(import.meta.dirname, "..", "src", "painel-html.ts"), gerarModuloPainel());
  console.log("src/painel-html.ts atualizado");
}
