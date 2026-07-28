import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, "../public/icons/icon.svg");
const svg = readFileSync(svgPath);

const sizes = [192, 512];

for (const size of sizes) {
  const outPath = path.join(__dirname, `../public/icons/icon-${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(outPath);
  console.log(`Gerado ${outPath}`);
}

// Ícone "maskable" com margem de segurança para Android
const maskableSvg = svg
  .toString()
  .replace('viewBox="0 0 512 512"', 'viewBox="-64 -64 640 640"');
const maskableOut = path.join(__dirname, "../public/icons/icon-maskable-512.png");
await sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile(maskableOut);
console.log(`Gerado ${maskableOut}`);
