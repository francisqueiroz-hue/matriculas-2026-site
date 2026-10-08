import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { esquecer, lerFatos, salvarFato } from "../src/memoria";

describe("memória por família", () => {
  it("isola famílias", async () => {
    const db = sqliteDb();
    await salvarFato(db, "5521988887777", "Filha no 7º ano");
    expect(await lerFatos(db, "5521988887777")).toEqual(["Filha no 7º ano"]);
    expect(await lerFatos(db, "5521955554444")).toEqual([]);
  });
  it("mantém no máximo 12 fatos e remove o menos usado", async () => {
    const db = sqliteDb();
    const tel = "5521988887777";
    for (let i = 1; i <= 13; i++) await salvarFato(db, tel, `fato ${i}`, 1000 + i);
    const fatos = await lerFatos(db, tel, 5000);
    expect(fatos).toHaveLength(12);
    expect(fatos).not.toContain("fato 1");
    expect(fatos).toContain("fato 13");
  });
  it("rejeita CPF e e-mail", async () => {
    const db = sqliteDb();
    await expect(salvarFato(db, "5521988887777", "CPF 123.456.789-09")).rejects.toThrow(/sensível/);
    await expect(salvarFato(db, "5521988887777", "email maria@x.com")).rejects.toThrow(/sensível/);
  });
  it("limita o texto a 200 caracteres", async () => {
    const db = sqliteDb();
    await salvarFato(db, "5521988887777", "x".repeat(500));
    expect((await lerFatos(db, "5521988887777"))[0]).toHaveLength(200);
  });
  it("variantes do mesmo número compartilham memória e esquecer apaga tudo", async () => {
    const db = sqliteDb();
    await salvarFato(db, "5521964699441", "Prefere tarde");
    expect(await lerFatos(db, "552164699441")).toEqual(["Prefere tarde"]);
    await esquecer(db, "552164699441");
    expect(await lerFatos(db, "5521964699441")).toEqual([]);
  });
});
