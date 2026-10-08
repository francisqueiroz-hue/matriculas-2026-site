import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { anonimizar } from "../src/anonimizar";
import { buscar } from "../src/conhecimento";
import { gerarSugestoes } from "../src/aprendizado";
import { provedorFake } from "../src/provedor";

const resposta = '{"pergunta":"A escola tem aula de natação?","resposta":"[CONFIRMAR] Informação sobre natação."}';
const ia = () => provedorFake(() => ({ texto: resposta, chamadas: [], tokens: 0 }));
const agora = Date.now();
const guardar = (db: ReturnType<typeof sqliteDb>, t: string, resolvida = 0) =>
  db.run("INSERT INTO perguntas (texto_anon, resolvida, criado_em) VALUES (?, ?, ?)", [t, resolvida, agora]);

describe("aprendizado supervisionado", () => {
  it("3 perguntas parecidas sem resposta geram 1 sugestão com frequência 3", async () => {
    const db = sqliteDb();
    await guardar(db, "tem aula de natação na escola?");
    await guardar(db, "vocês têm natação?");
    await guardar(db, "a escola tem aula de natação para o infantil?");
    await guardar(db, "qual o horário da biblioteca?");
    expect(await gerarSugestoes(db, ia(), new Date(agora - 1000))).toBe(1);
    const s = await db.all<{ frequencia: number; status: string }>("SELECT frequencia, status FROM sugestoes");
    expect(s).toEqual([{ frequencia: 3, status: "pendente" }]);
  });
  it("menos de 3 ocorrências não gera sugestão; perguntas resolvidas são ignoradas", async () => {
    const db = sqliteDb();
    await guardar(db, "tem natação?");
    await guardar(db, "vocês têm natação?");
    await guardar(db, "tem natação na escola?", 1);
    expect(await gerarSugestoes(db, ia(), new Date(agora - 1000))).toBe(0);
  });
  it("telefone, CPF e e-mail nunca chegam ao provedor", async () => {
    const db = sqliteDb();
    for (const t of ["natação? meu zap 21 98888-7777", "tem natação? cpf 123.456.789-09", "natação na escola? maria@x.com"]) await guardar(db, t);
    const p = ia();
    await gerarSugestoes(db, p, new Date(agora - 1000));
    const enviado = JSON.stringify(p.chamadas);
    expect(enviado).not.toMatch(/98888|123\.456|maria@x/);
  });
  it("a sugestão não entra na busca antes de aprovada e rodar de novo não duplica", async () => {
    const db = sqliteDb();
    for (let i = 0; i < 3; i++) await guardar(db, `tem aula de natação? ${i}`);
    await gerarSugestoes(db, ia(), new Date(agora - 1000));
    await gerarSugestoes(db, ia(), new Date(agora - 1000));
    expect(await buscar(db, "natação")).toEqual([]);
    expect(await db.all("SELECT * FROM sugestoes")).toHaveLength(1);
  });
  it("JSON inválido do provedor não grava sugestão", async () => {
    const db = sqliteDb();
    for (let i = 0; i < 3; i++) await guardar(db, "tem natação?");
    const ruim = provedorFake(() => ({ texto: "não sei", chamadas: [], tokens: 0 }));
    expect(await gerarSugestoes(db, ruim, new Date(agora - 1000))).toBe(0);
  });
});

describe("anonimizar", () => {
  it("mascara e-mail, CPF, telefone e números longos", () => {
    const r = anonimizar("fale com ana@x.com cpf 123.456.789-09 tel (21) 98888-7777 matrícula 12345678");
    expect(r).not.toMatch(/ana@|123\.456|98888|12345678/);
  });
});
