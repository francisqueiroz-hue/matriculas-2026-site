import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Página pública de matrículas (gerada a partir de site/index.html — ver src/lib/matriculas-page.ts).
  rewrites: async () => [{ source: "/matriculas", destination: "/matriculas.html" }],
};

export default nextConfig;
