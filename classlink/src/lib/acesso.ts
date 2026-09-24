import { normalizePhoneBR } from "@/lib/whatsapp";
import { PALAVRA_PEDIDO_ACESSO, linkPedirAcesso } from "@/lib/whatsapp-escola";

export { NUMERO_WHATSAPP_ESCOLA, PALAVRA_PEDIDO_ACESSO, linkPedirAcesso } from "@/lib/whatsapp-escola";

/** Dados da mensagem de acesso (novo cadastro ou nova senha temporária). */
export interface DadosAcesso {
  nome: string;
  /** Página de entrada da família, ex.: https://escola.app/guia */
  url: string;
  /** E-mail ou telefone usado para entrar. */
  login: string;
  senha: string;
}

/** Login para exibir: telefone vira "(21) 98765-4321"; e-mail fica como está. */
export function loginParaExibir(login: string): string {
  if (login.includes("@")) return login;
  const d = login.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return login;
}

export function mensagemAcesso({ nome, url, login, senha }: DadosAcesso): string {
  return `Olá, ${nome}! Seu acesso ao ClassLink (comunicação da escola) está pronto.\n\nAcesse: ${url}\nEntrar com: ${loginParaExibir(login)}\nSenha provisória: ${senha}\n\nAssim que entrar, troque a senha em Conta > Trocar senha.`;
}

/**
 * Parâmetros do modelo aprovado na Meta, na ordem das variáveis {{1}}..{{4}} do texto
 * sugerido no README ("Olá, {{1}}! Seu acesso ao ClassLink ... Acesse {{2}} ... {{3}} ... {{4}}").
 */
export function parametrosModeloAcesso({ nome, url, login, senha }: DadosAcesso): string[] {
  return [nome, url, loginParaExibir(login), senha];
}

/**
 * Link "clique para conversar" (wa.me) que abre o WhatsApp de quem clica — celular ou
 * WhatsApp Web — já com a mensagem escrita para o contato. Não depende da API da Meta
 * nem da janela de 24h, porque quem envia é a própria pessoa da escola.
 */
export function linkWhatsAppManual(telefone: string | null | undefined, texto: string): string | null {
  const numero = telefone ? normalizePhoneBR(telefone) : null;
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/**
 * Mensagem recebida é um pedido de acesso/senha? Só mensagens curtas com a palavra
 * "acesso" ou "senha" contam, para uma conversa comum ("a senha do portão...") não gerar
 * uma senha nova sem querer.
 */
export function ehPedidoDeAcesso(texto: string): boolean {
  const limpo = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!limpo || limpo.length > 60) return false;
  return /\b(acesso|senha)\b/.test(limpo);
}

/** Convite (sem senha) para a família pedir o acesso ao número da escola. */
export function mensagemConvite(nome: string): string {
  return `Olá, ${nome}! A escola criou o seu acesso ao ClassLink, o aplicativo de comunicação com as famílias.\n\nPara receber sua senha, toque no link abaixo e envie a mensagem ${PALAVRA_PEDIDO_ACESSO} — a resposta chega na hora:\n${linkPedirAcesso()}`;
}
