import { describe, expect, it } from "vitest";
import { ehPedidoDeAcesso } from "@/lib/acesso";
import { NUMERO_WHATSAPP_ESCOLA_FORMATADO, linkPedirAcesso } from "@/lib/whatsapp-escola";
import { phoneVariantsBR, samePhoneBR } from "@/lib/whatsapp";

describe("pedido de acesso pelo WhatsApp", () => {
  it("reconhece mensagens curtas com 'acesso' ou 'senha', com ou sem acento/maiúsculas", () => {
    for (const texto of ["ACESSO", "acesso", " Acesso ", "quero meu acesso", "Esqueci a senha", "SENHA!", "acessó"]) {
      expect(ehPedidoDeAcesso(texto)).toBe(true);
    }
  });

  it("ignora conversas comuns e textos longos", () => {
    expect(ehPedidoDeAcesso("Bom dia, o Davi vai faltar hoje")).toBe(false);
    expect(ehPedidoDeAcesso("não consigo acessar")).toBe(false);
    expect(ehPedidoDeAcesso("")).toBe(false);
    expect(
      ehPedidoDeAcesso("Oi, a senha do portão mudou? Meu marido não conseguiu entrar ontem com o carro na garagem da escola"),
    ).toBe(false);
  });

  it("link para os grupos aponta para o número dedicado da escola com a palavra ACESSO", () => {
    expect(linkPedirAcesso()).toBe("https://wa.me/5521992865778?text=ACESSO");
    expect(NUMERO_WHATSAPP_ESCOLA_FORMATADO).toBe("(21) 99286-5778");
  });
});

describe("celular brasileiro com e sem o nono dígito", () => {
  it("gera as duas formas", () => {
    expect(phoneVariantsBR("(21) 98765-4321")).toEqual(["5521987654321", "552187654321"]);
    expect(phoneVariantsBR("552187654321")).toEqual(["552187654321", "5521987654321"]);
  });

  it("não inventa variação para telefone fixo", () => {
    expect(phoneVariantsBR("(21) 3456-7890")).toEqual(["552134567890"]);
  });

  it("reconhece o número do webhook (sem o 9) como o mesmo do cadastro", () => {
    expect(samePhoneBR("(21) 98765-4321", "552187654321")).toBe(true);
    expect(samePhoneBR("5521987654321", "5521987654321")).toBe(true);
    expect(samePhoneBR("(21) 98765-4321", "552187654322")).toBe(false);
    expect(samePhoneBR("(21) 3456-7890", "5521934567890")).toBe(false);
  });
});
