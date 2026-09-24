import { spawnSync } from "child_process";
import { descreverConexao, explicarErro, urlDiretaNeon } from "./migrate-helpers.mjs";

/**
 * Roda `prisma migrate deploy` no build da Vercel, apenas no deploy de produção.
 * Deploys de preview (um por pull request) podem apontar para o mesmo banco e não
 * devem aplicar migrações antes do merge. Se a migração falhar, o build falha e a
 * versão anterior continua no ar — nunca sobe código esperando tabelas que não existem.
 *
 * Robustez para conexões via pooler (Neon "-pooler", PgBouncer), onde a trava
 * (advisory lock) do Prisma costuma falhar:
 *  - usa DIRECT_URL quando definida (prisma.config.ts); no Neon, sem DIRECT_URL, deriva
 *    a conexão direta tirando "-pooler" do host;
 *  - até 3 tentativas; a 2ª e a 3ª com PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1;
 *  - log com host (sem senha) e explicação em português do erro.
 */
const ambiente = process.env.VERCEL_ENV;

if (ambiente !== "production") {
  console.log(`[migrate-on-deploy] VERCEL_ENV=${ambiente ?? "(não definido)"}: migrações não aplicadas (só em produção).`);
  process.exit(0);
}

const env = { ...process.env };
if (!env.DIRECT_URL && env.DATABASE_URL) {
  const direta = urlDiretaNeon(env.DATABASE_URL);
  if (direta) {
    env.DIRECT_URL = direta;
    console.log("[migrate-on-deploy] DATABASE_URL usa o pooler do Neon; migrando pela conexão direta (host sem \"-pooler\").");
  }
}

const conexao = descreverConexao(env.DIRECT_URL || env.DATABASE_URL || "");
if (conexao) {
  console.log(
    `[migrate-on-deploy] Banco: ${conexao.host}:${conexao.porta} (${env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL"})` +
      (conexao.pooler ? " — parece ser um pooler; se falhar, cadastre DIRECT_URL com a conexão direta." : ""),
  );
} else {
  console.error("[migrate-on-deploy] DATABASE_URL não definida ou inválida.");
}

const TENTATIVAS = 3;
const ESPERA_MS = [0, 5000, 15000];
const LIMITE_POR_TENTATIVA_MS = 120_000;

function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let ultimaSaida = "";
for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
  if (ESPERA_MS[tentativa - 1]) esperar(ESPERA_MS[tentativa - 1]);
  const semTrava = tentativa > 1;
  console.log(
    `[migrate-on-deploy] Aplicando migrações pendentes (tentativa ${tentativa}/${TENTATIVAS}${semTrava ? ", sem advisory lock" : ""})...`,
  );

  const resultado = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env: semTrava ? { ...env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" } : env,
    encoding: "utf8",
    timeout: LIMITE_POR_TENTATIVA_MS,
    shell: process.platform === "win32",
  });
  if (resultado.stdout) process.stdout.write(resultado.stdout);
  if (resultado.stderr) process.stderr.write(resultado.stderr);

  if (resultado.status === 0) {
    console.log("[migrate-on-deploy] Migrações em dia.");
    process.exit(0);
  }

  ultimaSaida = `${resultado.stdout ?? ""}\n${resultado.stderr ?? ""}\n${resultado.error?.message ?? ""}`;
  const motivo = resultado.error?.code === "ETIMEDOUT" ? "tempo limite de 2 min excedido" : `código ${resultado.status}`;
  console.error(`[migrate-on-deploy] Tentativa ${tentativa} falhou (${motivo}).`);
  const dica = explicarErro(ultimaSaida);
  if (dica) console.error(`[migrate-on-deploy] Provável causa: ${dica}`);
}

console.error("[migrate-on-deploy] Falha ao aplicar as migrações — deploy interrompido. A versão anterior continua no ar.");
process.exit(1);
