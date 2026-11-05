import { describe, expect, it } from "vitest";
import { montarMensagemPush, origemPublica } from "@/lib/push";

describe("origemPublica", () => {
  it("usa APP_URL ou o domínio de produção da Vercel, sempre em https", () => {
    expect(origemPublica({ APP_URL: "https://app.escola.com.br/" })).toBe("https://app.escola.com.br");
    expect(origemPublica({ VERCEL_PROJECT_PRODUCTION_URL: "classlink.vercel.app" })).toBe("https://classlink.vercel.app");
    expect(origemPublica({ APP_URL: "http://inseguro.com" })).toBeNull();
    expect(origemPublica({})).toBeNull();
  });
});

describe("montarMensagemPush", () => {
  it("transforma o caminho em link absoluto https (o FCM recusa link relativo)", () => {
    const m = montarMensagemPush(["t1"], { title: "Oi", body: "Texto", url: "/dashboard/mensagens/abc" }, "https://classlink.vercel.app");
    expect(m.webpush?.fcmOptions?.link).toBe("https://classlink.vercel.app/dashboard/mensagens/abc");
    expect(m.webpush?.headers?.Urgency).toBe("high");
    expect(m.notification).toEqual({ title: "Oi", body: "Texto" });
  });

  it("sem endereço público conhecido, não manda link relativo", () => {
    const m = montarMensagemPush(["t1"], { title: "Oi", body: "Texto", url: "/dashboard" }, null);
    expect(m.webpush?.fcmOptions).toBeUndefined();
    expect(m.data).toEqual({ url: "/dashboard" });
  });
});

describe("descreverAparelho", () => {
  it("dá um nome curto ao aparelho para o diagnóstico de notificações", async () => {
    const { descreverAparelho } = await import("@/lib/device");
    expect(descreverAparelho("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1")).toBe("iPhone");
    expect(descreverAparelho("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")).toBe("Mac · Chrome");
    expect(descreverAparelho("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0")).toBe("Windows · Edge");
    expect(descreverAparelho("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15")).toBe("Mac · Safari");
    expect(descreverAparelho("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(descreverAparelho(null)).toBe("Aparelho");
  });
});
