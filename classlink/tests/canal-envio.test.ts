import { describe, expect, it } from "vitest";
import { JANELA_CONVERSA_MS, explicacaoDoCanal, janelaWhatsApp, reciboPorCanal } from "@/lib/canal-envio";

const agora = new Date("2026-10-14T17:00:00Z").getTime();

describe("janelaWhatsApp", () => {
  it("família nunca escreveu: fechada", () => {
    expect(janelaWhatsApp(null, agora)).toEqual({ aberta: false, ate: null });
  });

  it("escreveu há 1h: aberta até 23h depois da mensagem", () => {
    const ultima = new Date(agora - 60 * 60 * 1000);
    const j = janelaWhatsApp(ultima, agora);
    expect(j.aberta).toBe(true);
    expect(j.ate?.getTime()).toBe(ultima.getTime() + JANELA_CONVERSA_MS);
  });

  it("escreveu há 24h: fechada", () => {
    expect(janelaWhatsApp(new Date(agora - 24 * 60 * 60 * 1000), agora).aberta).toBe(false);
  });
});

describe("explicacaoDoCanal", () => {
  const aberta = { aberta: true, ate: new Date("2026-10-15T10:00:00Z") };
  const fechada = { aberta: false, ate: null };

  it("ClassLink: avisa que há notificação e confirmação de leitura", () => {
    expect(explicacaoDoCanal("APP", fechada)).toMatch(/notificação.*✓✓/);
  });

  it("WhatsApp aberto: diz até quando e que a leitura não é acompanhada", () => {
    const t = explicacaoDoCanal("WHATSAPP", aberta);
    expect(t).toMatch(/Pode enviar até/);
    expect(t).toMatch(/não informa se foi lida/);
  });

  it("WhatsApp fechado: indisponível, sugere o ClassLink", () => {
    expect(explicacaoDoCanal("WHATSAPP", fechada)).toMatch(/Indisponível.*ClassLink/);
  });

  it("e-mail: não informa abertura", () => {
    expect(explicacaoDoCanal("EMAIL", fechada)).toMatch(/não informa se foi aberto/);
  });
});

describe("reciboPorCanal", () => {
  it("só o ClassLink comprova abertura; WhatsApp/e-mail dizem o que não é acompanhado", () => {
    expect(reciboPorCanal("APP", null).texto).toMatch(/ainda não aberta/);
    expect(reciboPorCanal("WHATSAPP", null).texto).toMatch(/não é acompanhada/);
    expect(reciboPorCanal("EMAIL", null).texto).toMatch(/Enviada por e-mail/);
  });

  it("aberta no ClassLink: ✓✓ com data e hora, qualquer que tenha sido o canal", () => {
    const r = reciboPorCanal("WHATSAPP", "2026-10-14T17:05:00.000Z");
    expect(r.marca).toBe("✓✓");
    expect(r.texto).toMatch(/^Lida no ClassLink em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/);
  });
});
