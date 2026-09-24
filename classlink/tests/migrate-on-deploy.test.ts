import { describe, expect, it } from "vitest";
import { descreverConexao, explicarErro, urlDiretaNeon } from "../scripts/migrate-helpers.mjs";

describe("migração no deploy", () => {
  it("descreve a conexão sem expor a senha e detecta pooler", () => {
    const d = descreverConexao("postgresql://user:segredo@ep-cool-1234-pooler.sa-east-1.aws.neon.tech/db?sslmode=require");
    expect(d).toEqual({ host: "ep-cool-1234-pooler.sa-east-1.aws.neon.tech", porta: "5432", pooler: true });
    expect(JSON.stringify(d)).not.toContain("segredo");
    expect(descreverConexao("postgresql://u:p@db.x.supabase.co:6543/postgres")?.pooler).toBe(true);
    expect(descreverConexao("postgresql://u:p@db.local:5432/x")?.pooler).toBe(false);
    expect(descreverConexao("nada")).toBeNull();
  });

  it("deriva a conexão direta do Neon tirando -pooler do host", () => {
    expect(urlDiretaNeon("postgresql://u:p@ep-cool-1234-pooler.sa-east-1.aws.neon.tech/db?sslmode=require&pgbouncer=true")).toBe(
      "postgresql://u:p@ep-cool-1234.sa-east-1.aws.neon.tech/db?sslmode=require",
    );
    expect(urlDiretaNeon("postgresql://u:p@ep-cool-1234.sa-east-1.aws.neon.tech/db")).toBeNull();
    expect(urlDiretaNeon("postgresql://u:p@db.x.supabase.co:6543/postgres")).toBeNull();
  });

  it("explica os erros mais comuns em português", () => {
    expect(explicarErro("Error: P1002 Timed out trying to acquire a postgres advisory lock")).toMatch(/DIRECT_URL/);
    expect(explicarErro("Error: P1001: Can't reach database server")).toMatch(/conectar/);
    expect(explicarErro("P3009 migrate found failed migrations")).toMatch(/migrate resolve/);
    expect(explicarErro("tudo certo")).toBeNull();
  });
});
