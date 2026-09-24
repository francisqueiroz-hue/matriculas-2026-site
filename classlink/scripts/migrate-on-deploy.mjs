import { spawnSync } from "child_process";

/**
 * Roda `prisma migrate deploy` no build da Vercel, apenas no deploy de produção.
 * Deploys de preview (um por pull request) podem apontar para o mesmo banco e não
 * devem aplicar migrações antes do merge. Se a migração falhar, o build falha e a
 * versão anterior continua no ar — nunca sobe código esperando tabelas que não existem.
 *
 * Com conexão via pooler (ex.: Neon "-pooler", PgBouncer), defina DIRECT_URL com a
 * conexão direta: o prisma.config.ts usa DIRECT_URL para migrações quando existir.
 */
const ambiente = process.env.VERCEL_ENV;

if (ambiente !== "production") {
  console.log(`[migrate-on-deploy] VERCEL_ENV=${ambiente ?? "(não definido)"}: migrações não aplicadas (só em produção).`);
  process.exit(0);
}

console.log("[migrate-on-deploy] Aplicando migrações pendentes no banco de produção...");
const resultado = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", shell: process.platform === "win32" });
if (resultado.status !== 0) {
  console.error("[migrate-on-deploy] Falha ao aplicar as migrações — deploy interrompido.");
  process.exit(resultado.status ?? 1);
}
