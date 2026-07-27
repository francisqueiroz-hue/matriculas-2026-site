import https from "node:https";
import { readFileSync } from "node:fs";

/**
 * Cliente da API Inter Empresas (Cobrança/Boletos) — OAuth2 client_credentials
 * com mTLS, conforme developers.bancointer.com.br.
 *
 * ⚠️ Os nomes de campo do payload seguem a API Cobrança v3 documentada publicamente
 * no momento da implementação. Bancos alteram contratos de API com alguma frequência —
 * confira a documentação oficial antes de usar em produção e ajuste `buildCobrancaPayload`
 * se necessário. Toda a superfície de integração fica isolada neste arquivo de propósito.
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

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

export function isBancoInterConfigured() {
  return Boolean(
    process.env.BANCO_INTER_CLIENT_ID &&
      process.env.BANCO_INTER_CLIENT_SECRET &&
      process.env.BANCO_INTER_CERT_PATH &&
      process.env.BANCO_INTER_KEY_PATH &&
      process.env.BANCO_INTER_CONTA_CORRENTE,
  );
}

function baseUrl() {
  return process.env.BANCO_INTER_AMBIENTE === "producao"
    ? "https://cdpj.partners.bancointer.com.br"
    : "https://cdpj-sandbox.partners.uatinter.co";
}

let agentCache: https.Agent | null = null;
function mtlsAgent(): https.Agent {
  if (agentCache) return agentCache;
  agentCache = new https.Agent({
    cert: readFileSync(env("BANCO_INTER_CERT_PATH")),
    key: readFileSync(env("BANCO_INTER_KEY_PATH")),
  });
  return agentCache;
}

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
    scope: "boleto-cobranca.write boleto-cobranca.read webhook-boleto.write webhook-boleto.read",
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
    throw new Error("CPF do responsável ausente ou inválido");
  }
  if (!input.pagador.endereco.cep || !input.pagador.endereco.logradouro) {
    throw new Error("Endereço de cobrança incompleto");
  }
  if (input.valorNominal <= 0) {
    throw new Error("Valor da mensalidade deve ser maior que zero");
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
    ...(input.mensagem ? { mensagem: { linha1: input.mensagem } } : {}),
  };
}

export async function emitirCobranca(input: EmitirCobrancaInput): Promise<CobrancaEmitida> {
  const payload = buildCobrancaPayload(input);
  return authorizedRequest<CobrancaEmitida>("POST", "/cobranca/v3/cobrancas", payload);
}

export async function consultarCobranca(codigoSolicitacao: string): Promise<CobrancaDetalhada> {
  return authorizedRequest<CobrancaDetalhada>("GET", `/cobranca/v3/cobrancas/${codigoSolicitacao}`);
}

export async function baixarPdfCobranca(codigoSolicitacao: string): Promise<Buffer> {
  const response = await authorizedRequest<{ pdf: string }>("GET", `/cobranca/v3/cobrancas/${codigoSolicitacao}/pdf`);
  return Buffer.from(response.pdf, "base64");
}

/** Registra a URL de webhook para receber confirmações de pagamento. Rodar uma vez na configuração inicial. */
export async function registrarWebhook(webhookUrl: string): Promise<void> {
  await authorizedRequest("PUT", "/cobranca/v3/cobrancas/webhook", { webhookUrl });
}
