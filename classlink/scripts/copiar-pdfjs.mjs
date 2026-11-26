import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copia do pacote pdfjs-dist para public/pdfjs/ os arquivos que o navegador busca sozinho ao
 * converter PDF em imagem no Mural: o "worker" (processa o PDF fora da tela), os decodificadores
 * em WebAssembly (imagens JPEG2000/JBIG2 de documentos escaneados), as fontes padrão e os perfis
 * de cor. Servidos pelo próprio app (CSP 'self'), sem CDN de terceiros. Roda no postinstall,
 * então acompanha a versão instalada; a pasta não é versionada.
 */
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "node_modules", "pdfjs-dist");
const destino = join(raiz, "public", "pdfjs");

if (!existsSync(origem)) {
  console.warn("[copiar-pdfjs] pdfjs-dist não instalado; nada copiado.");
  process.exit(0);
}

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
cpSync(join(origem, "legacy", "build", "pdf.worker.min.mjs"), join(destino, "pdf.worker.min.mjs"));
for (const pasta of ["wasm", "standard_fonts", "iccs"]) {
  cpSync(join(origem, pasta), join(destino, pasta), { recursive: true });
}
console.log("[copiar-pdfjs] arquivos do leitor de PDF copiados para public/pdfjs/");
