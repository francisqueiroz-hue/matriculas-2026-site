/**
 * Funções puras usadas por migrate-on-deploy.mjs (separadas para poder testar).
 */

/** Descreve a conexão sem expor usuário/senha: host, porta e se parece passar por pooler. */
export function descreverConexao(url) {
  try {
    const u = new URL(url);
    const pooler =
      u.hostname.includes("-pooler.") || u.port === "6543" || u.searchParams.get("pgbouncer") === "true";
    return { host: u.hostname, porta: u.port || "5432", pooler };
  } catch {
    return null;
  }
}

/**
 * Neon: a conexão direta é o mesmo endereço sem "-pooler" no host
 * (ep-xxx-pooler.região.aws.neon.tech → ep-xxx.região.aws.neon.tech).
 * Retorna null quando não dá para derivar com segurança.
 */
export function urlDiretaNeon(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith(".neon.tech") || !u.hostname.includes("-pooler.")) return null;
    u.hostname = u.hostname.replace("-pooler.", ".");
    u.searchParams.delete("pgbouncer");
    return u.toString();
  } catch {
    return null;
  }
}

/** Explicação em português para os erros mais comuns do `prisma migrate deploy`. */
export function explicarErro(saida) {
  if (/P1002|advisory lock/i.test(saida)) {
    return "Tempo esgotado esperando a trava de migração (comum com pooler). Cadastre DIRECT_URL com a conexão direta do banco.";
  }
  if (/P1001|Can't reach database|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(saida)) {
    return "Não foi possível conectar ao banco. Confira DATABASE_URL/DIRECT_URL na Vercel e se o banco está ativo.";
  }
  if (/P1000|authentication failed|password authentication/i.test(saida)) {
    return "Usuário ou senha do banco recusados. Confira DATABASE_URL/DIRECT_URL na Vercel.";
  }
  if (/P3009|failed migrations/i.test(saida)) {
    return "Há uma migração marcada como falha no banco. Veja qual com `npx prisma migrate status` e resolva com `npx prisma migrate resolve`.";
  }
  if (/P3018|P3006|migration failed to apply/i.test(saida)) {
    return "O SQL de uma migração falhou no banco de produção. Veja a mensagem acima.";
  }
  if (/prepared statement .* already exists/i.test(saida)) {
    return "Conexão via pooler em modo transação. Cadastre DIRECT_URL com a conexão direta do banco.";
  }
  return null;
}
