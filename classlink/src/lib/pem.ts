import { X509Certificate, createPrivateKey } from "node:crypto";

export type TipoPem = "certificado" | "chave";

const BLOCO_PEM = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/;

function emLinhasDe64(base64: string): string {
  return base64.match(/.{1,64}/g)?.join("\n") ?? "";
}

function montarPem(rotulo: string, corpo: string): string {
  return `-----BEGIN ${rotulo}-----\n${emLinhasDe64(corpo.replace(/\s+/g, ""))}\n-----END ${rotulo}-----\n`;
}

/** Desfaz o que painéis e editores costumam fazer com o texto colado: BOM, "\n" escrito, \r, aspas. */
function limpar(texto: string): string {
  let t = texto.replace(/^﻿/, "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1).trim();
  return t.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");
}

function pareceBase64(t: string): boolean {
  const s = t.replace(/\s+/g, "");
  return s.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

function valido(pem: string, tipo: TipoPem): boolean {
  try {
    if (tipo === "certificado") new X509Certificate(pem);
    else createPrivateKey(pem);
    return true;
  } catch {
    return false;
  }
}

/** Rótulo do primeiro bloco PEM do texto (CERTIFICATE, PRIVATE KEY...), ou null. */
export function rotuloPem(texto: string): string | null {
  const m = limpar(texto).match(BLOCO_PEM);
  return m ? m[1] : null;
}

/**
 * Devolve o PEM em formato canônico, aceitando o conteúdo do .crt/.key colado na Vercel com
 * as variações mais comuns: quebras de linha trocadas por espaço (tudo numa linha), "\n"
 * escrito, BOM, aspas em volta, o arquivo inteiro em base64, ou só o miolo sem BEGIN/END.
 * Lança erro com mensagem clara (sem mostrar o conteúdo) quando não reconhece.
 */
export function normalizarPem(texto: string, tipo: TipoPem): string {
  let t = limpar(texto);

  if (!BLOCO_PEM.test(t) && pareceBase64(t)) {
    const decodificado = Buffer.from(t.replace(/\s+/g, ""), "base64").toString("utf8");
    if (BLOCO_PEM.test(decodificado)) t = limpar(decodificado);
  }

  const candidatos: string[] = [];
  const bloco = t.match(BLOCO_PEM);
  if (bloco) {
    const [, rotulo, corpo] = bloco;
    candidatos.push(t.includes("\n") ? `${bloco[0]}\n` : montarPem(rotulo, corpo), montarPem(rotulo, corpo));
  } else if (pareceBase64(t)) {
    if (tipo === "certificado") candidatos.push(montarPem("CERTIFICATE", t));
    else candidatos.push(montarPem("PRIVATE KEY", t), montarPem("RSA PRIVATE KEY", t));
  }

  for (const pem of candidatos) if (valido(pem, tipo)) return pem;

  const nome = tipo === "certificado" ? "BANCO_INTER_CERT" : "BANCO_INTER_KEY";
  const arquivo = tipo === "certificado" ? ".crt" : ".key";
  throw new Error(
    `${nome} não é ${tipo === "certificado" ? "um certificado" : "uma chave"} válido. Abra o arquivo ${arquivo} do Inter no Bloco de Notas e cole o conteúdo inteiro, da linha -----BEGIN até a linha -----END.`,
  );
}

/**
 * Normaliza certificado e chave do Inter. Se vierem trocados (o .key em BANCO_INTER_CERT e o
 * .crt em BANCO_INTER_KEY), destroca.
 */
export function normalizarParMtls(cert: string, key: string): { cert: string; key: string } {
  const rCert = rotuloPem(cert) ?? "";
  const rKey = rotuloPem(key) ?? "";
  if (rCert.includes("PRIVATE KEY") && rKey === "CERTIFICATE") [cert, key] = [key, cert];
  return { cert: normalizarPem(cert, "certificado"), key: normalizarPem(key, "chave") };
}
