import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { toClassLinkPage } from "../src/lib/matriculas-page";

// Gera public/matriculas.html (servido em /matriculas) a partir de site/index.html.
const root = path.join(__dirname, "..");
const source = path.join(root, "../site/index.html");
const target = path.join(root, "public/matriculas.html");

writeFileSync(target, toClassLinkPage(readFileSync(source, "utf8")));
console.log(`Gerado ${path.relative(root, target)} a partir de ${path.relative(root, source)}`);
