import { describe, expect, it } from "vitest";
import { isIosDevice, shouldShowIosInstallBanner } from "@/lib/device";

describe("isIosDevice", () => {
  it("detecta iPhone (Safari)", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15")).toBe(true);
  });

  it("detecta iPad", () => {
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15")).toBe(true);
  });

  it("detecta Chrome-para-iOS (mesmo motor WebKit)", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) CriOS/125.0")).toBe(true);
  });

  it("não marca Android", () => {
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36")).toBe(false);
  });

  it("não marca desktop", () => {
    expect(isIosDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")).toBe(false);
  });
});

describe("shouldShowIosInstallBanner", () => {
  it("mostra o aviso no iPhone pelo navegador (ainda não instalado)", () => {
    expect(shouldShowIosInstallBanner("iPhone", false)).toBe(true);
  });

  it("esconde o aviso depois de instalado (modo standalone)", () => {
    expect(shouldShowIosInstallBanner("iPhone", true)).toBe(false);
  });

  it("esconde o aviso no Android", () => {
    expect(shouldShowIosInstallBanner("Android", false)).toBe(false);
  });

  it("esconde o aviso no desktop", () => {
    expect(shouldShowIosInstallBanner("Windows", false)).toBe(false);
  });
});
