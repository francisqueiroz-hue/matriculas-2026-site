export interface Env {
  DB: D1Database;
  AI: Ai;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_API_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  MCP_TOKEN: string;
  PROVEDOR: "workers-ai" | "claude";
  MODELO: string;
  ANTHROPIC_API_KEY?: string;
  LIMITE_MENSAGENS_MES?: string;
  LIMITE_TOKENS_DIA?: string;
  DONO_EMAIL?: string;
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  WHATSAPP_API_URL?: string;
  TEMPLATE_AVISO_EQUIPE?: string;
  WHATSAPP_INTERNO_PHONE_NUMBER_ID?: string;
  WHATSAPP_INTERNO_API_TOKEN?: string;
  TELEFONE_ESCOLA?: string;
  TELEFONES_IGNORADOS?: string;
  TELEFONE_CLASSLINK?: string;
}

export interface MensagemEntrada {
  wamid: string;
  de: string;
  tipo: string;
  texto: string;
  ts: number;
}
