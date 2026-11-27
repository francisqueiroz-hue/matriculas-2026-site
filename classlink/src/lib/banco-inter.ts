import https from "node:https";
import { ErroDeUsuario } from "@/lib/erros";
import { readFileSync } from "node:fs";

/**
 * Cliente da API Inter Empresas (Cobrança v3, boleto com Pix) — OAuth2 client_credentials
 * com mTLS. Referência: https://developers.inter.co/references/cobranca-bolepix
 * (conferida em 27/11/2026; a API Boleto v2 foi descontinuada em 2026).
 *
 * Pontos do contrato v3 que este arquivo respeita:
 * - escopos `boleto-cobranca.read` e `boleto-cobranca.write` (valem também para o webhook);
 * - `seuNumero` com no máximo 15 caracteres;
 * - emissão assíncrona: o POST devolve só `codigoSolicitacao`; linha digitável e Pix chegam
 *   pelo webhook ou pela consulta, que responde em blocos `cobranca`, `boleto` e `pix`;
 * - token vale 1 hora e o Inter limita a geração a 5 por minuto.
 * Toda a superfície de integração fica isolada neste arquivo de propósito.
 */

export interface EnderecoCobranca {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface EmitirCobrancaInput {
  seuNumero: string;
  valorNominal: number;
  dataVencimento: string; // YYYY-MM-DD
  numDiasAgenda?: number;
  pagador: {
    cpfCnpj: string;
    nome: string;
    endereco: EnderecoCobranca;
  };
  mensagem?: string;
}

export interface CobrancaEmitida {
  codigoSolicitacao: string;
}

export interface CobrancaDetalhada {
  codigoSolicitacao: string;
  situacao: string;
  nossoNumero?: string;
  linhaDigitavel?: string;
  pixCopiaECola?: string;
}

/** Resposta da consulta v3, em blocos (GET /cobranca/v3/cobrancas/{codigoSolicitacao}). */
export interface RespostaConsultaV3 {
  cobranca?: { codigoSolicitacao?: string; situacao?: string };
  boleto?: { nossoNumero?: string; linhaDigitavel?: string; codigoBarras?: string };
  pix?: { txid?: string; pixCopiaECola?: string };
}

/** Achata a resposta da consulta v3 nos campos que o ClassLink guarda. */
export function lerConsultaCobranca(resposta: RespostaConsultaV3, codigoSolicitacao: string): CobrancaDetalhada {
  return {
    codigoSolicitacao: resposta.cobranca?.codigoSolicitacao ?? codigoSolicitacao,
    situacao: resposta.cobranca?.situacao ?? "",
    nossoNumero: resposta.boleto?.nossoNumero || undefined,
    linhaDigitavel: resposta.boleto?.linhaDigitavel || undefined,
    pixCopiaECola: resposta.pix?.pixCopiaECola || undefined,
  };
}

/** Limite do campo `seuNumero` na API v3. */
export const SEU_NUMERO_MAX = 15;

/**
 * `seuNumero` do boleto: AAMM do mês de referência + os 11 últimos caracteres do id do boleto
 * (cuid), 15 no total. Só serve para a escola reconhecer o título no internet banking; a
 * conciliação usa o `codigoSolicitacao`.
 */
export function seuNumeroDoBoleto(boletoId: string, mesReferencia: string): string {
  const aamm = mesReferencia.replace(/\D/g, "").slice(2, 6);
  const sufixo = boletoId.replace(/[^A-Za-z0-9]/g, "").slice(-(SEU_NUMERO_MAX - aamm.length));
  return `${aamm}${sufixo}`.toUpperCase();
}

/**
 * Encargos por atraso enviados ao Inter, iguais aos do contrato (Cláusula 9ª: multa de 2% e
 * juros de 1% ao mês) e aos usados na conferência de baixas (lib/conferencia-baixas.ts).
 */
export const MULTA_PERCENTUAL = 2;
export const MORA_PERCENTUAL_MES = 1;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

/** true quando o certificado mTLS foi informado por conteúdo (variável de ambiente) OU por caminho de arquivo. */
function temCertificadoConfigurado() {
  return Boolean(
    (process.env.BANCO_INTER_CERT && process.env.BANCO_INTER_KEY) ||
      (process.env.BANCO_INTER_CERT_PATH && process.env.BANCO_INTER_KEY_PATH),
  );
}

export function isBancoInterConfigured() {
  return Boolean(
    process.env.BANCO_INTER_CLIENT_ID &&
      process.env.BANCO_INTER_CLIENT_SECRET &&
      temCertificadoConfigurado() &&
      process.env.BANCO_INTER_CONTA_CORRENTE,
  );
}

function baseUrl() {
  return process.env.BANCO_INTER_AMBIENTE === "producao"
    ? "https://cdpj.partners.bancointer.com.br"
    : "https://cdpj-sandbox.partners.uatinter.co";
}

/**
 * Lê o certificado/chave mTLS. Prioriza o CONTEÚDO em variável de ambiente
 * (BANCO_INTER_CERT/BANCO_INTER_KEY) — obrigatório em ambientes serverless como a
 * Vercel, que não têm sistema de arquivos persistente para gravar os `.crt`/`.key`
 * baixados do portal do Inter. Mantém o caminho de arquivo (BANCO_INTER_CERT_PATH/
 * BANCO_INTER_KEY_PATH) como alternativa para desenvolvimento local.
 *
 * Aceita o mesmo formato usado para FIREBASE_PRIVATE_KEY: se a variável de ambiente
 * guardar as quebras de linha escapadas como "\n" (comum em painéis que só aceitam
 * valor de uma linha), elas são desfeitas antes de montar o Buffer do PEM.
 */
function lerCertificadoEChave(): { cert: Buffer; key: Buffer } {
  const certConteudo = process.env.BANCO_INTER_CERT;
  const keyConteudo = process.env.BANCO_INTER_KEY;
  if (certConteudo && keyConteudo) {
    return {
      cert: Buffer.from(certConteudo.replace(/\\n/g, "\n")),
      key: Buffer.from(keyConteudo.replace(/\\n/g, "\n")),
    };
  }
  return {
    cert: readFileSync(env("BANCO_INTER_CERT_PATH")),
    key: readFileSync(env("BANCO_INTER_KEY_PATH")),
  };
}

let agentCache: https.Agent | null = null;
function mtlsAgent(): https.Agent {
  if (agentCache) return agentCache;
  const { cert, key } = lerCertificadoEChave();
  agentCache = new https.Agent({ cert, key });
  return agentCache;
}

/** Espera máxima por uma resposta do Banco Inter (sem isso, uma lentidão do banco segura a emissão do mês inteiro). */
export const TEMPO_LIMITE_INTER_MS = 20_000;

function request<T>(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, baseUrl());
    const req = https.request(
      url,
      { method: options.method, agent: mtlsAgent(), headers: options.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Banco Inter respondeu ${status}: ${raw.slice(0, 500)}`));
            return;
          }
          try {
            resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
          } catch {
            reject(new Error("Resposta inválida do Banco Inter"));
          }
        });
      },
    );
    req.setTimeout(TEMPO_LIMITE_INTER_MS, () => {
      req.destroy(new Error("O Banco Inter não respondeu a tempo"));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}
let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 10_000) return tokenCache.accessToken;

  const body = new URLSearchParams({
    client_id: env("BANCO_INTER_CLIENT_ID"),
    client_secret: env("BANCO_INTER_CLIENT_SECRET"),
    grant_type: "client_credentials",
    // Na v3 o webhook de cobrança usa os mesmos escopos da cobrança. Pedir um escopo que a
    // aplicação não tem faz o Inter recusar o token inteiro.
    scope: "boleto-cobranca.read boleto-cobranca.write",
  }).toString();

  const response = await request<{ access_token: string; expires_in: number }>({
    method: "POST",
    path: "/oauth/v2/token",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  tokenCache = { accessToken: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 };
  return tokenCache.accessToken;
}

async function authorizedRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken();
  return request<T>({
    method,
    path,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-conta-corrente": env("BANCO_INTER_CONTA_CORRENTE"),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Monta o payload de emissão a partir dos dados do aluno/responsável — mantido puro/testável. */
export function buildCobrancaPayload(input: EmitirCobrancaInput) {
  if (!input.pagador.cpfCnpj || input.pagador.cpfCnpj.replace(/\D/g, "").length < 11) {
    throw new ErroDeUsuario("CPF do responsável ausente ou inválido");
  }
  if (!input.pagador.endereco.cep || !input.pagador.endereco.logradouro) {
    throw new ErroDeUsuario("Endereço de cobrança incompleto");
  }
  if (input.valorNominal <= 0) {
    throw new ErroDeUsuario("Valor da mensalidade deve ser maior que zero");
  }
  if (!input.seuNumero || input.seuNumero.length > SEU_NUMERO_MAX) {
    throw new Error(`seuNumero precisa ter de 1 a ${SEU_NUMERO_MAX} caracteres`);
  }

  return {
    seuNumero: input.seuNumero,
    valorNominal: Number(input.valorNominal.toFixed(2)),
    dataVencimento: input.dataVencimento,
    numDiasAgenda: input.numDiasAgenda ?? 60,
    pagador: {
      cpfCnpj: input.pagador.cpfCnpj.replace(/\D/g, ""),
      tipoPessoa: "FISICA" as const,
      nome: input.pagador.nome,
      endereco: input.pagador.endereco.logradouro,
      numero: input.pagador.endereco.numero,
      complemento: input.pagador.endereco.complemento,
      bairro: input.pagador.endereco.bairro,
      cidade: input.pagador.endereco.cidade,
      uf: input.pagador.endereco.uf,
      cep: input.pagador.endereco.cep.replace(/\D/g, ""),
    },
    multa: { codigo: "PERCENTUAL" as const, taxa: MULTA_PERCENTUAL },
    mora: { codigo: "TAXAMENSAL" as const, taxa: MORA_PERCENTUAL_MES },
    formasRecebimento: ["BOLETO", "PIX"] as const,
    ...(input.mensagem ? { mensagem: { linha1: input.mensagem.slice(0, 78) } } : {}),
  };
}

export async function emitirCobranca(input: EmitirCobrancaInput): Promise<CobrancaEmitida> {
  const payload = buildCobrancaPayload(input);
  return authorizedRequest<CobrancaEmitida>("POST", "/cobranca/v3/cobrancas", payload);
}

export async function consultarCobranca(codigoSolicitacao: string): Promise<CobrancaDetalhada> {
  const resposta = await authorizedRequest<RespostaConsultaV3>(
    "GET",
    `/cobranca/v3/cobrancas/${encodeURIComponent(codigoSolicitacao)}`,
  );
  return lerConsultaCobranca(resposta, codigoSolicitacao);
}

export async function baixarPdfCobranca(codigoSolicitacao: string): Promise<Buffer> {
  const response = await authorizedRequest<{ pdf: string }>("GET", `/cobranca/v3/cobrancas/${codigoSolicitacao}/pdf`);
  return Buffer.from(response.pdf, "base64");
}

/** Registra a URL de webhook para receber confirmações de pagamento. Rodar uma vez na configuração inicial. */
export async function registrarWebhook(webhookUrl: string): Promise<void> {
  if (!webhookUrl.startsWith("https://")) throw new ErroDeUsuario("O endereço do webhook precisa começar com https://");
  await authorizedRequest("PUT", "/cobranca/v3/cobrancas/webhook", { webhookUrl });
}

/** URL do webhook hoje cadastrada no Inter, ou null se não houver. */
export async function consultarWebhook(): Promise<string | null> {
  try {
    const resposta = await authorizedRequest<{ webhookUrl?: string }>("GET", "/cobranca/v3/cobrancas/webhook");
    return resposta.webhookUrl ?? null;
  } catch (err) {
    // Sem webhook cadastrado o Inter responde 404.
    if (err instanceof Error && /respondeu 404/.test(err.message)) return null;
    throw err;
  }
}
