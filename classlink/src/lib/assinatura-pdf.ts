import { X509Certificate, createHash, verify as verificarAssinatura } from "node:crypto";

/**
 * Pré-conferência das assinaturas digitais de um PDF (gov.br, ICP-Brasil ou outra), feita
 * dentro do app para a secretaria não precisar abrir o arquivo em outro programa.
 *
 * O que ela confere, para cada assinatura encontrada no PDF:
 *  - quem assinou e quem emitiu o certificado (como estão escritos no certificado);
 *  - se o trecho assinado continua igual ao que foi assinado (resumo SHA e assinatura
 *    criptográfica conferidos com a chave do próprio certificado);
 *  - se a assinatura cobre o arquivo inteiro ou se houve alteração depois dela;
 *  - se o certificado estava dentro do prazo na data da assinatura.
 *
 * O que ela NÃO confere: a cadeia até a autoridade raiz (gov.br / ICP-Brasil) e a revogação
 * do certificado. Isso só o validador oficial do ITI (validar.iti.gov.br) faz. Por isso a tela
 * chama o resultado de "pré-conferência" e sempre oferece o validador oficial.
 */

export type Integridade = "INTEGRA" | "ALTERADA" | "NAO_CONFERIDA";

export interface AssinaturaPdf {
  /** Nome no certificado (CN), sem o CPF. */
  signatario: string | null;
  /** CPF mascarado (***.456.789-**) quando o certificado traz o CPF junto do nome. */
  cpfMascarado: string | null;
  /** Autoridade que emitiu o certificado, como declarada no próprio certificado. */
  emissor: string | null;
  /** O emissor declarado é uma AC do governo federal (gov.br)? Só o nome; a cadeia não é conferida aqui. */
  emissorGovBr: boolean;
  /** Data/hora da assinatura (atributo assinado ou campo /M do PDF), ISO. */
  dataAssinatura: string | null;
  integridade: Integridade;
  /** Por que não foi possível conferir, ou o que não bateu. */
  detalhe: string | null;
  /** A assinatura cobre o arquivo até o fim (nada foi acrescentado depois dela)? */
  cobreArquivoInteiro: boolean;
  /** Certificado dentro do prazo de validade na data da assinatura (null = sem data para comparar). */
  certificadoNoPrazo: boolean | null;
}

export interface ResultadoAssinaturasPdf {
  assinaturas: AssinaturaPdf[];
  /** Carimbos de tempo do documento (não são assinaturas de pessoas). */
  carimbosDeTempo: number;
  /** Há conteúdo depois da última assinatura (alteração ou só dados de validação acrescentados)? */
  conteudoDepoisDaUltima: boolean;
}

// ---------------------------------------------------------------------------------------------
// Leitura DER mínima (só o necessário para o CMS/PKCS#7 de assinaturas de PDF)

interface No {
  tag: number;
  /** Início do nó (byte da tag). */
  inicio: number;
  /** Início do conteúdo. */
  conteudo: number;
  /** Fim (exclusivo). */
  fim: number;
}

class DerErro extends Error {}

function lerNo(b: Uint8Array, pos: number, limite = b.length): No {
  if (pos + 2 > limite) throw new DerErro("DER truncado");
  const tag = b[pos];
  if ((tag & 0x1f) === 0x1f) throw new DerErro("Tag DER longa não suportada");
  let p = pos + 1;
  let tamanho = b[p++];
  if (tamanho & 0x80) {
    const n = tamanho & 0x7f;
    if (n === 0 || n > 4) throw new DerErro("Tamanho DER inválido");
    tamanho = 0;
    for (let i = 0; i < n; i++) tamanho = tamanho * 256 + b[p++];
  }
  const fim = p + tamanho;
  if (fim > limite) throw new DerErro("DER truncado");
  return { tag, inicio: pos, conteudo: p, fim };
}

function filhos(b: Uint8Array, no: No): No[] {
  const lista: No[] = [];
  let p = no.conteudo;
  while (p < no.fim) {
    const f = lerNo(b, p, no.fim);
    lista.push(f);
    p = f.fim;
  }
  return lista;
}

function oid(b: Uint8Array, no: No): string {
  if (no.tag !== 0x06) throw new DerErro("OID esperado");
  const bytes = b.subarray(no.conteudo, no.fim);
  const partes: number[] = [];
  let valor = 0;
  for (let i = 0; i < bytes.length; i++) {
    valor = valor * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      if (partes.length === 0) {
        const primeiro = valor < 80 ? Math.floor(valor / 40) : 2;
        partes.push(primeiro, valor - primeiro * 40);
      } else partes.push(valor);
      valor = 0;
    }
  }
  return partes.join(".");
}

function bytesDe(b: Uint8Array, no: No): Uint8Array {
  return b.subarray(no.conteudo, no.fim);
}

function hex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

function lerData(b: Uint8Array, no: No): Date | null {
  const s = Buffer.from(bytesDe(b, no)).toString("latin1");
  // UTCTime (0x17) AAMMDDhhmmssZ · GeneralizedTime (0x18) AAAAMMDDhhmmssZ
  const m = no.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(s);
  if (!m) return null;
  let ano = Number(m[1]);
  if (no.tag === 0x17) ano += ano < 50 ? 2000 : 1900;
  const d = new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)));
  return Number.isNaN(d.getTime()) ? null : d;
}

const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";
const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";
const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";

const DIGEST: Record<string, string> = {
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
};

/** Algoritmos de assinatura que o Node confere direto (RSA PKCS#1 v1.5 e ECDSA). */
const ALGORITMO_ASSINATURA_OK = new Set([
  "1.2.840.113549.1.1.1", // rsaEncryption
  "1.2.840.113549.1.1.5", // sha1WithRSA
  "1.2.840.113549.1.1.11", // sha256WithRSA
  "1.2.840.113549.1.1.12", // sha384WithRSA
  "1.2.840.113549.1.1.13", // sha512WithRSA
  "1.2.840.10045.2.1", // ecPublicKey
  "1.2.840.10045.4.3.2", // ecdsa-with-SHA256
  "1.2.840.10045.4.3.3", // ecdsa-with-SHA384
  "1.2.840.10045.4.3.4", // ecdsa-with-SHA512
]);

interface CmsLido {
  digest: string | null;
  algoritmoAssinatura: string;
  /** Atributos assinados já recodificados como SET (o que de fato foi assinado), ou null. */
  atributosAssinados: Uint8Array | null;
  messageDigest: Uint8Array | null;
  signingTime: Date | null;
  assinatura: Uint8Array;
  serialSignatario: string | null;
  certificados: X509Certificate[];
}

function lerCms(der: Uint8Array): CmsLido {
  const raiz = lerNo(der, 0);
  const [tipo, explicito] = filhos(der, raiz);
  if (!tipo || oid(der, tipo) !== OID_SIGNED_DATA || !explicito) throw new DerErro("Não é um SignedData");
  const signedData = filhos(der, explicito)[0];
  const partes = filhos(der, signedData);
  const certificados: X509Certificate[] = [];
  let signerInfos: No | null = null;
  for (const p of partes.slice(1)) {
    if (p.tag === 0xa0) {
      for (const c of filhos(der, p)) {
        if (c.tag !== 0x30) continue;
        try {
          certificados.push(new X509Certificate(Buffer.from(der.subarray(c.inicio, c.fim))));
        } catch {
          // certificado ilegível: ignora este
        }
      }
    } else if (p.tag === 0x31) {
      signerInfos = p; // o último SET é signerInfos (o primeiro é digestAlgorithms)
    }
  }
  if (!signerInfos) throw new DerErro("Sem signerInfos");
  const signerInfo = filhos(der, signerInfos)[0];
  if (!signerInfo) throw new DerErro("Sem signerInfo");
  const campos = filhos(der, signerInfo);
  // version, sid, digestAlgorithm, [0] signedAttrs?, signatureAlgorithm, signature, [1]?
  const sid = campos[1];
  let serialSignatario: string | null = null;
  if (sid?.tag === 0x30) {
    const serial = filhos(der, sid)[1];
    if (serial?.tag === 0x02) serialSignatario = hex(bytesDe(der, serial)).replace(/^0+/, "").toUpperCase();
  }
  const digest = DIGEST[oid(der, filhos(der, campos[2])[0])] ?? null;
  let i = 3;
  let atributosAssinados: Uint8Array | null = null;
  let messageDigest: Uint8Array | null = null;
  let signingTime: Date | null = null;
  if (campos[i]?.tag === 0xa0) {
    const attrs = campos[i];
    const copia = Uint8Array.from(der.subarray(attrs.inicio, attrs.fim));
    copia[0] = 0x31; // [0] IMPLICIT -> SET OF, como manda a RFC 5652 (5.4)
    atributosAssinados = copia;
    for (const attr of filhos(der, attrs)) {
      const [tipoAttr, valores] = filhos(der, attr);
      const valor = valores ? filhos(der, valores)[0] : undefined;
      if (!tipoAttr || !valor) continue;
      const t = oid(der, tipoAttr);
      if (t === OID_MESSAGE_DIGEST && valor.tag === 0x04) messageDigest = bytesDe(der, valor);
      if (t === OID_SIGNING_TIME) signingTime = lerData(der, valor);
    }
    i++;
  }
  const algoritmoAssinatura = oid(der, filhos(der, campos[i])[0]);
  const assinaturaNo = campos[i + 1];
  if (!assinaturaNo || assinaturaNo.tag !== 0x04) throw new DerErro("Assinatura ausente");
  return {
    digest,
    algoritmoAssinatura,
    atributosAssinados,
    messageDigest,
    signingTime,
    assinatura: bytesDe(der, assinaturaNo),
    serialSignatario,
    certificados,
  };
}

// ---------------------------------------------------------------------------------------------
// Nomes do certificado

function campoDn(dn: string, campo: string): string | null {
  // O Node devolve um campo por linha: "CN=Fulano:12345678900\nO=ICP-Brasil"
  for (const linha of dn.split("\n")) {
    const [k, ...resto] = linha.split("=");
    if (k?.trim() === campo) return resto.join("=").trim() || null;
  }
  return null;
}

/** Separa "NOME:CPF" (padrão ICP-Brasil/gov.br) e mascara o CPF (LGPD: só os dígitos do meio). */
export function separarNomeCpf(cn: string | null): { nome: string | null; cpfMascarado: string | null } {
  if (!cn) return { nome: null, cpfMascarado: null };
  const m = /^(.*?)[:\s]+(\d{11})$/.exec(cn.trim());
  if (!m) return { nome: cn.trim(), cpfMascarado: null };
  const cpf = m[2];
  return { nome: m[1].trim(), cpfMascarado: `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` };
}

function escolherCertificado(cms: CmsLido): X509Certificate | null {
  if (cms.serialSignatario) {
    const porSerial = cms.certificados.find((c) => c.serialNumber.replace(/^0+/, "").toUpperCase() === cms.serialSignatario);
    if (porSerial) return porSerial;
  }
  return cms.certificados.find((c) => !c.ca) ?? cms.certificados[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// PDF

function dataPdf(s: string): Date | null {
  // D:AAAAMMDDhhmmss+03'00'
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/.exec(s);
  if (!m) return null;
  let iso = `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
  const fuso = m[7];
  if (!fuso || fuso === "Z") iso += "Z";
  else iso += `${fuso.slice(0, 3)}:${fuso.replace(/'/g, "").slice(3, 5)}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const LIMITE_ASSINATURAS = 20;

/** Encontra e confere as assinaturas digitais do PDF. Nunca lança: o que não der para ler vira detalhe. */
export function conferirAssinaturasPdf(pdf: Uint8Array): ResultadoAssinaturasPdf {
  const texto = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength).toString("latin1");
  const regex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const vistos = new Set<string>();
  const assinaturas: AssinaturaPdf[] = [];
  let carimbosDeTempo = 0;
  let maiorFim = 0;

  for (let m = regex.exec(texto); m && assinaturas.length + carimbosDeTempo < LIMITE_ASSINATURAS; m = regex.exec(texto)) {
    const [a, b, c, d] = m.slice(1, 5).map(Number);
    const chave = `${a}-${b}-${c}-${d}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (a !== 0 || b <= 0 || c <= b || c + d > pdf.length) continue;
    maiorFim = Math.max(maiorFim, c + d);

    // Dicionário da assinatura: em volta do /ByteRange, sem o conteúdo hex (pode ser grande).
    const janela = texto.slice(Math.max(0, m.index - 4096), Math.min(b, m.index + 4096)) + texto.slice(c, Math.min(texto.length, c + 4096));
    if (/\/SubFilter\s*\/ETSI\.RFC3161/.test(janela) || /\/Type\s*\/DocTimeStamp/.test(janela)) {
      carimbosDeTempo++;
      continue;
    }
    const mData = /\/M\s*\((D:[^)]*)\)/.exec(janela);

    const conteudoHex = texto.slice(b, c).replace(/[<>\s]/g, "");
    const der = Buffer.from(conteudoHex.length % 2 ? conteudoHex.slice(0, -1) : conteudoHex, "hex");
    const cobreArquivoInteiro = c + d === pdf.length || /^\s*$/.test(texto.slice(c + d));

    const base: AssinaturaPdf = {
      signatario: null,
      cpfMascarado: null,
      emissor: null,
      emissorGovBr: false,
      dataAssinatura: mData ? (dataPdf(mData[1])?.toISOString() ?? null) : null,
      integridade: "NAO_CONFERIDA",
      detalhe: null,
      cobreArquivoInteiro,
      certificadoNoPrazo: null,
    };

    let cms: CmsLido;
    try {
      cms = lerCms(der);
    } catch {
      assinaturas.push({ ...base, detalhe: "Formato de assinatura que o app não sabe ler." });
      continue;
    }

    const cert = escolherCertificado(cms);
    const dataAssinatura = cms.signingTime ?? (base.dataAssinatura ? new Date(base.dataAssinatura) : null);
    const { nome, cpfMascarado } = separarNomeCpf(cert ? campoDn(cert.subject, "CN") : null);
    const emissor = cert ? campoDn(cert.issuer, "CN") : null;
    const item: AssinaturaPdf = {
      ...base,
      signatario: nome,
      cpfMascarado,
      emissor,
      emissorGovBr: !!emissor && /governo federal/i.test(emissor),
      dataAssinatura: dataAssinatura?.toISOString() ?? null,
      certificadoNoPrazo:
        cert && dataAssinatura ? dataAssinatura >= new Date(cert.validFrom) && dataAssinatura <= new Date(cert.validTo) : null,
    };

    if (!cert) {
      assinaturas.push({ ...item, detalhe: "A assinatura não traz o certificado de quem assinou." });
      continue;
    }
    if (!cms.digest || !ALGORITMO_ASSINATURA_OK.has(cms.algoritmoAssinatura)) {
      assinaturas.push({ ...item, detalhe: "Algoritmo de assinatura que o app não confere; use o validador do ITI." });
      continue;
    }

    const trecho = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
    const resumo = createHash(cms.digest).update(trecho).digest();
    let dadosAssinados: Uint8Array = trecho;
    if (cms.atributosAssinados) {
      if (!cms.messageDigest || !resumo.equals(Buffer.from(cms.messageDigest))) {
        assinaturas.push({ ...item, integridade: "ALTERADA", detalhe: "O conteúdo assinado foi alterado depois da assinatura." });
        continue;
      }
      dadosAssinados = cms.atributosAssinados;
    }
    let confere = false;
    try {
      confere = verificarAssinatura(cms.digest, dadosAssinados, cert.publicKey, cms.assinatura);
    } catch {
      confere = false;
    }
    assinaturas.push(
      confere
        ? { ...item, integridade: "INTEGRA" }
        : { ...item, integridade: "ALTERADA", detalhe: "A assinatura não confere com o certificado de quem assinou." },
    );
  }

  const fimUtil = texto.replace(/\s+$/, "").length;
  return { assinaturas, carimbosDeTempo, conteudoDepoisDaUltima: maiorFim > 0 && maiorFim < fimUtil };
}

/** Compara nomes sem acentos, caixa ou espaços extras (para achar o responsável que assinou). */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
