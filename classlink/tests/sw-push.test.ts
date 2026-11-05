import { describe, it, expect } from "vitest";
import { FONTE_PUSH_SW } from "@/lib/sw-push";
import { GET } from "@/app/sw.js/route";
import { montarMensagemPush, TAG_AVISO_MENSAGENS } from "@/lib/push";
import { pessoaOlhandoOPainel } from "@/lib/atencao-painel";

type Janela = { visibilityState: string; focused: boolean; url: string };
type Aviso = { titulo: string; opcoes: { body: string; tag?: string; renotify?: boolean; silent?: boolean; data: { url: string; origem: string } } } | null;

// Executa o mesmo código-fonte que vai dentro do sw.js.
const { notificacaoComJanelaVisivel } = new Function(`${FONTE_PUSH_SW}; return { notificacaoComJanelaVisivel };`)() as {
  notificacaoComJanelaVisivel: (payload: unknown, janelas: Janela[]) => Aviso;
};

const PAYLOAD = {
  notification: { title: "WhatsApp de Maria", body: "Bom dia, a Ana vai faltar", tag: TAG_AVISO_MENSAGENS },
  data: { url: "/dashboard/mensagens/abc" },
  fcmOptions: { link: "https://app.escola.com.br/dashboard/mensagens/abc" },
};
const janela = (visibilityState: string, focused: boolean, url = "https://app.escola.com.br/dashboard"): Janela => ({ visibilityState, focused, url });

describe("service worker: push com o ClassLink aberto", () => {
  it("ClassLink visível no computador, mas sem foco: o service worker mostra a notificação", () => {
    const aviso = notificacaoComJanelaVisivel(PAYLOAD, [janela("visible", false)]);
    expect(aviso?.titulo).toBe("WhatsApp de Maria");
    expect(aviso?.opcoes.body).toBe("Bom dia, a Ana vai faltar");
    expect(aviso?.opcoes.data).toEqual({ url: "/dashboard/mensagens/abc", origem: "classlink-aviso" });
    expect(aviso?.opcoes.tag).toBe(TAG_AVISO_MENSAGENS);
    expect(aviso?.opcoes.renotify).toBe(true);
  });

  it("pessoa olhando o ClassLink (janela com foco): mostra SILENCIOSA — push sem notificação faz o iPhone cancelar os avisos", () => {
    for (const janelas of [[janela("visible", true)], [janela("visible", false), janela("visible", true)]]) {
      const aviso = notificacaoComJanelaVisivel(PAYLOAD, janelas);
      expect(aviso?.titulo).toBe("WhatsApp de Maria");
      expect(aviso?.opcoes.silent).toBe(true);
      expect(aviso?.opcoes.renotify).toBeUndefined(); // silent + renotify é recusado pelo navegador
      expect(aviso?.opcoes.tag).toBe(TAG_AVISO_MENSAGENS);
    }
  });

  it("janela sem foco: notificação com som (não silenciosa)", () => {
    expect(notificacaoComJanelaVisivel(PAYLOAD, [janela("visible", false)])?.opcoes.silent).toBeUndefined();
  });

  it("todo push com notificação termina com notificação na tela (Firebase ou service worker)", () => {
    const casos: Janela[][] = [[], [janela("hidden", false)], [janela("visible", false)], [janela("visible", true)], [janela("hidden", false), janela("visible", true)]];
    for (const janelas of casos) {
      const firebaseMostra = !janelas.some((j) => j.visibilityState === "visible" && !j.url.startsWith("chrome-extension://"));
      const swMostra = notificacaoComJanelaVisivel(PAYLOAD, janelas) !== null;
      expect(firebaseMostra !== swMostra).toBe(true); // exatamente um mostra: nem silêncio, nem duplicado
    }
  });

  it("nenhuma janela visível: não mostra aqui (o Firebase já mostra — evita duplicar)", () => {
    expect(notificacaoComJanelaVisivel(PAYLOAD, [])).toBeNull();
    expect(notificacaoComJanelaVisivel(PAYLOAD, [janela("hidden", false)])).toBeNull();
    expect(notificacaoComJanelaVisivel(PAYLOAD, [janela("visible", false, "chrome-extension://abc/bg.html")])).toBeNull();
  });

  it("sem url nos dados, usa o link do FCM; push sem notificação é ignorado", () => {
    const aviso = notificacaoComJanelaVisivel({ ...PAYLOAD, data: {} }, [janela("visible", false)]);
    expect(aviso?.opcoes.data.url).toBe("https://app.escola.com.br/dashboard/mensagens/abc");
    expect(notificacaoComJanelaVisivel({ data: { url: "/x" } }, [janela("visible", false)])).toBeNull();
  });

  it("o sw.js servido inclui o tratamento antes do Firebase", async () => {
    const corpo = await (await GET()).text();
    expect(corpo).toContain("function notificacaoComJanelaVisivel");
    expect(corpo).toContain('self.addEventListener("push"');
    expect(corpo.indexOf('self.addEventListener("push"')).toBeLessThan(corpo.indexOf("firebase.initializeApp"));
    // O corpo precisa ser JavaScript válido.
    expect(() => new Function(corpo.replace(/importScripts\([^)]*\);/g, ""))).not.toThrow();
  });
});

describe("push de mensagem: etiqueta do aviso", () => {
  it("mensagens usam a mesma etiqueta do aviso do painel e tocam a cada mensagem nova", () => {
    const m = montarMensagemPush(["t"], { title: "Oi", body: "x", url: "/dashboard/mensagens/abc" }, "https://app.escola.com.br");
    expect(m.webpush?.notification?.tag).toBe(TAG_AVISO_MENSAGENS);
    expect(m.webpush?.notification?.renotify).toBe(true);
  });

  it("outros avisos (comunicados, teste) não recebem a etiqueta", () => {
    const m = montarMensagemPush(["t"], { title: "Oi", body: "x", url: "/dashboard" }, "https://app.escola.com.br");
    expect(m.webpush?.notification?.tag).toBeUndefined();
    expect(montarMensagemPush(["t"], { title: "Oi", body: "x" }, null).webpush?.notification).toBeUndefined();
  });
});

describe("pessoaOlhandoOPainel", () => {
  it("só conta como olhando com a aba visível e a janela com foco", () => {
    expect(pessoaOlhandoOPainel({ visibilityState: "visible", hasFocus: () => true })).toBe(true);
    expect(pessoaOlhandoOPainel({ visibilityState: "visible", hasFocus: () => false })).toBe(false);
    expect(pessoaOlhandoOPainel({ visibilityState: "hidden", hasFocus: () => true })).toBe(false);
  });
});
