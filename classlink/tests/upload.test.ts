import { describe, expect, it } from "vitest";
import { assertUploadSize } from "@/lib/firebase-storage";

describe("validação de tamanho de upload", () => {
  it("aceita imagem dentro do limite (8MB)", () => {
    expect(() => assertUploadSize(4 * 1024 * 1024, "image")).not.toThrow();
  });

  it("rejeita imagem acima do limite", () => {
    expect(() => assertUploadSize(9 * 1024 * 1024, "image")).toThrow(/Limite/);
  });

  it("aceita vídeo dentro do limite (50MB)", () => {
    expect(() => assertUploadSize(40 * 1024 * 1024, "video")).not.toThrow();
  });

  it("rejeita vídeo acima do limite", () => {
    expect(() => assertUploadSize(60 * 1024 * 1024, "video")).toThrow(/Limite/);
  });
});
