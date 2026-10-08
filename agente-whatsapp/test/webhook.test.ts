import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { extrairEcos, extrairMensagens, marcarProcessada, verificarAssinatura, verificarDesafio } from "../src/webhook";

const PUBLICO = "111";
const payload = (msg: object, phoneId = PUBLICO) => ({
  entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneId }, messages: [msg] } }] }],
});
const assinar = (corpo: string, segredo: string) => "sha256=" + createHmac("sha256", segredo).update(corpo).digest("hex");

describe("assinatura", () => {
  it("aceita assinatura válida e rejeita adulterada ou ausente", async () => {
    const corpo = '{"a":1}';
    expect(await verificarAssinatura(corpo, assinar(corpo, "segredo"), "segredo")).toBe(true);
    expect(await verificarAssinatura(corpo + " ", assinar(corpo, "segredo"), "segredo")).toBe(false);
    expect(await verificarAssinatura(corpo, null, "segredo")).toBe(false);
  });
});

describe("extrairMensagens", () => {
  it("lê texto, botão e interativo", () => {
    const m = extrairMensagens(payload({ id: "w1", from: "5521964699441", timestamp: "10", type: "text", text: { body: "oi" } }), PUBLICO);
    expect(m).toEqual([{ wamid: "w1", de: "5521964699441", tipo: "text", texto: "oi", ts: 10 }]);
    const b = extrairMensagens(payload({ id: "w2", from: "1", timestamp: "1", type: "button", button: { payload: "ACESSO" } }), PUBLICO);
    expect(b[0].texto).toBe("ACESSO");
  });
  it("ignora número diferente do público", () => {
    expect(extrairMensagens(payload({ id: "w", from: "1", timestamp: "1", type: "text", text: { body: "x" } }, "999"), PUBLICO)).toEqual([]);
  });
  it("áudio volta com tipo e texto vazio", () => {
    const m = extrairMensagens(payload({ id: "w3", from: "1", timestamp: "1", type: "audio" }), PUBLICO);
    expect(m[0]).toMatchObject({ tipo: "audio", texto: "" });
  });
  it("payload malformado não lança", () => {
    expect(extrairMensagens(null, PUBLICO)).toEqual([]);
    expect(extrairMensagens({ entry: "x" }, PUBLICO)).toEqual([]);
  });
});

describe("extrairEcos", () => {
  it("lê smb_message_echoes do número público", () => {
    const p = { entry: [{ changes: [{ field: "smb_message_echoes", value: { metadata: { phone_number_id: PUBLICO }, message_echoes: [{ id: "e1", to: "5521988887777", timestamp: "5", type: "text", text: { body: "Olá!" } }] } }] }] };
    expect(extrairEcos(p, PUBLICO)).toEqual([{ para: "5521988887777", wamid: "e1", texto: "Olá!", ts: 5 }]);
    expect(extrairEcos(p, "999")).toEqual([]);
  });
});

describe("deduplicação e desafio", () => {
  it("marcarProcessada é verdadeira só na primeira vez, mesmo em paralelo", async () => {
    const db = sqliteDb();
    const r = await Promise.all([marcarProcessada(db, "w9"), marcarProcessada(db, "w9")]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await marcarProcessada(db, "w9")).toBe(false);
  });
  it("verificarDesafio devolve o challenge só com o token certo", () => {
    const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "t", "hub.challenge": "123" });
    expect(verificarDesafio(ok, "t")).toBe("123");
    expect(verificarDesafio(ok, "outro")).toBeNull();
  });
});
