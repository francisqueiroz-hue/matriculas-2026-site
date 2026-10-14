import type { NextConfig } from "next";
import { CABECALHOS_SEGURANCA } from "./src/lib/cabecalhos-seguranca";

const nextConfig: NextConfig = {
  headers: async () => [{ source: "/:path*", headers: [...CABECALHOS_SEGURANCA] }],
  // Página pública de matrículas (gerada a partir de site/index.html — ver src/lib/matriculas-page.ts).
  rewrites: async () => [{ source: "/matriculas", destination: "/matriculas.html" }],
};

export default nextConfig;
