import { describe, expect, it } from "vitest";
import { detectarTipoMidia } from "@/lib/tipo-midia";

const bytes = (...n: number[]) => Uint8Array.from([...n, ...new Array(Math.max(0, 16 - n.length)).fill(0)]);
const texto = (t: string, antes = 0) => Uint8Array.from([...new Array(antes).fill(0), ...Buffer.from(t, "latin1"), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("detectarTipoMidia", () => {
  it("reconhece JPEG, PNG e WebP", () => {
    expect(detectarTipoMidia(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(detectarTipoMidia(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    const webp = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 0, 0, 0, 0]);
    expect(detectarTipoMidia(webp)?.mime).toBe("image/webp");
  });
  it("reconhece MP4, MOV e WebM como vídeo", () => {
    const mp4 = Uint8Array.from([0, 0, 0, 0x18, ...Buffer.from("ftypisom"), 0, 0, 0, 0]);
    const mov = Uint8Array.from([0, 0, 0, 0x14, ...Buffer.from("ftypqt  "), 0, 0, 0, 0]);
    expect(detectarTipoMidia(mp4)).toMatchObject({ kind: "video", mime: "video/mp4" });
    expect(detectarTipoMidia(mov)).toMatchObject({ kind: "video", mime: "video/quicktime" });
    expect(detectarTipoMidia(bytes(0x1a, 0x45, 0xdf, 0xa3))).toMatchObject({ kind: "video", mime: "video/webm" });
  });
  it("recusa conteúdo que não é mídia, mesmo com nome/tipo de imagem", () => {
    expect(detectarTipoMidia(texto("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectarTipoMidia(texto("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectarTipoMidia(texto("MZ executable"))).toBeNull();
    expect(detectarTipoMidia(new Uint8Array(4))).toBeNull();
  });
  it("RIFF que não é WebP (ex.: WAV) é recusado", () => {
    const wav = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE"), 0, 0, 0, 0]);
    expect(detectarTipoMidia(wav)).toBeNull();
  });
});
