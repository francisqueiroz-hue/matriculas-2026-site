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
