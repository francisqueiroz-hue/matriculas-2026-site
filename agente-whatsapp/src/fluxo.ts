import { responder } from "./agente";
import { anonimizar } from "./anonimizar";
import { historico, liaLigada, liaPausada, liberar, reivindicar, registrarEco, registrarMensagem, type Mensagem } from "./conversa";
import type { Db } from "./db";
import { abrirChamado } from "./fila";
import { contandoTokens, contarContato, podeEnviar, podeUsarIA, registrarEnvio } from "./limites";
import { escolherProvedor, type Provedor } from "./provedor";
import { notificarDono } from "./push";
import { chaveTelefone, mesmoTelefone } from "./telefone";
import type { Env, MensagemEntrada } from "./tipos";
import { acolhimento, normalizar, triar, triarPorRegras, type Categoria } from "./triagem";
import { marcarProcessada, type Eco } from "./webhook";
import { enviarTexto } from "./whatsapp";

export interface Deps {
  provedor?: Provedor;
  fetch?: typeof fetch;
  /** Espera (ms) para juntar mensagens seguidas; os testes usam valores pequenos. */
  espera?: number;
  agora?: () => Date;
}

const PEDIR_TEXTO = "Recebi seu arquivo, mas por aqui eu só consigo ler mensagens de texto. Pode escrever sua dúvida? 😊";
const MIDIA_INSISTENTE = "Obrigada! Vou passar para a nossa equipe, que retorna em breve.";
const AVISO_EQUIPE = "Recebi sua mensagem! Vou passar para a nossa equipe, que retorna em breve.";
const JANELA_PENDENTES = 10 * 60_000;
const MAX_RESPOSTAS_HORA = 20;
const MAX_LOTES_POR_ATENDIMENTO = 3;
/** Reações e figurinhas não são perguntas: não geram resposta, chamado nem custo. */
const IGNORAR_TIPOS = new Set(["reaction", "sticker"]);

const RASCUNHOS: Record<Categoria, string> = {
  cobranca: "Olá! Aqui é da secretaria do Espaço Kids e Instituto Fokus. Recebi sua mensagem e quero ajudar a resolver. Podemos conversar sobre isso? Qual o melhor horário para você?",
  reclamacao: "Olá! Aqui é da coordenação. Sinto muito pelo ocorrido e agradeço por nos contar. Gostaria de entender melhor o que aconteceu para resolvermos juntos. Podemos conversar hoje?",
  bullying: "Olá! Aqui é da coordenação. Obrigada por nos avisar, levamos isso muito a sério. Já estamos acompanhando. Podemos conversar ainda hoje para entender melhor?",
  saude: "Olá! Aqui é da equipe da escola. Recebi sua mensagem e já estamos cuidando disso. Poderia me confirmar mais detalhes?",
  laudo: "Olá! Aqui é da coordenação pedagógica. Obrigada por compartilhar. Gostaria de conversar com calma para entender como podemos acolher melhor seu filho. Quando podemos falar?",
  cancelamento: "Olá! Aqui é da secretaria. Recebi sua mensagem e lamento saber disso. Podemos conversar para entender o que aconteceu e ver como ajudar?",
  desconto: "Olá! Aqui é da direção. Recebi seu pedido e gostaria de conversar sobre as condições. Qual o melhor horário para você?",
  juridico: "Olá! Aqui é da direção. Recebi sua mensagem e gostaria de conversar pessoalmente. Qual o melhor horário para você?",
  risco_crianca: "Olá! Aqui é da equipe da escola. Recebi sua mensagem e estamos entrando em contato agora. Você está em segurança neste momento?",
  outros_delicados: "Olá! Aqui é da equipe da escola. Recebi sua mensagem e vou ajudar. Pode me contar um pouco mais?",
};

function pedidoDeAcesso(texto: string): boolean {
  const t = normalizar(texto).trim();
  return t.length <= 40 && /\b(acesso|senha|login)\b/.test(t);
}

const esperar = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

export async function processarEcos(db: Db, ecos: Eco[]): Promise<void> {
  for (const e of ecos) await registrarEco(db, e);
}

/** Um turno completo para as mensagens recebidas: ver ordem no plano (Task 13) e os ajustes da revisão final. */
export async function processarTurno(env: Env, db: Db, msgs: MensagemEntrada[], deps: Deps = {}): Promise<void> {
  const porTelefone = new Map<string, MensagemEntrada[]>();
  for (const m of msgs) porTelefone.set(m.de, [...(porTelefone.get(m.de) ?? []), m]);
  for (const [de, grupo] of porTelefone) await atenderTelefone(env, db, de, grupo, deps).catch((e) => console.error("turno falhou", (e as Error).message));
}

interface Chamado {
  categoria: string;
  resumo: string;
  prioridade?: string;
  rascunho?: string;
  /** Já aberto por uma ferramenta: só avisa o dono. */
  id?: number;
}

/** O chamado nasce ANTES de qualquer envio: se o WhatsApp falhar, a equipe ainda fica sabendo. */
async function abrir(env: Env, db: Db, tel: string, c: Chamado, deps: Deps): Promise<void> {
  const prioridade = c.prioridade ?? "normal";
  if (!c.id) await abrirChamado(db, { telefone: tel, categoria: c.categoria, prioridade, resumo: c.resumo, rascunho: c.rascunho });
  await notificarDono(env, db, { titulo: `Lia: ${c.categoria}`, corpo: c.resumo.slice(0, 120), url: `/painel/#/c/${tel}`, prioridade }, { fetch: deps.fetch }).catch(() => undefined);
}

async function lerPendentes(db: Db, tel: string, deps: Deps, depoisDe = 0) {
  const corte = (deps.agora?.() ?? new Date()).getTime() - JANELA_PENDENTES;
  const recentes = (await historico(db, tel, 30)).filter((m) => m.ts >= corte);
  // Com `depoisDe`, vale tudo o que chegou depois do último lote tratado: a resposta da Lia pode ter
  // sido gravada depois dessas mensagens (a IA demora) e não as respondeu.
  if (depoisDe) return { recentes, pendentes: recentes.filter((m) => m.direcao === "entrada" && m.id > depoisDe) };
  let inicio = 0;
  recentes.forEach((m, i) => { if (m.direcao !== "entrada") inicio = i + 1; });
  return { recentes, pendentes: recentes.slice(inicio) };
}

async function atenderTelefone(env: Env, db: Db, de: string, grupo: MensagemEntrada[], deps: Deps): Promise<void> {
  const novas: MensagemEntrada[] = [];
  for (const m of grupo) if (await marcarProcessada(db, m.wamid)) novas.push(m);
  const uteis = novas.filter((m) => !IGNORAR_TIPOS.has(m.tipo));
  if (!uteis.length) return;

  const ignorados = [env.TELEFONE_ESCOLA, ...(env.TELEFONES_IGNORADOS ?? "").split(",")].map((x) => x?.trim()).filter(Boolean) as string[];
  if (ignorados.some((i) => mesmoTelefone(i, de))) return;

  const tel = chaveTelefone(de);
  let ultimoId = 0;
  // O id vem da própria inserção: outro webhook da mesma pessoa pode gravar entre duas consultas.
  for (const m of uteis) ultimoId = await registrarMensagem(db, { telefone: tel, direcao: "entrada", texto: m.texto || `[${m.tipo}]`, wamid: m.wamid });

  if (!(await liaLigada(db)) || (await liaPausada(db, tel, deps.agora?.()))) {
    // Lia desligada ou equipe atendendo: não responde, mas risco à criança nunca passa em silêncio.
    const dura = triarPorRegras(uteis.map((m) => m.texto).join(" "));
    if (dura?.acao === "acolher" && dura.prioridade === "urgente") {
      await abrir(env, db, tel, { categoria: dura.categoria, prioridade: "urgente", resumo: anonimizar(uteis.map((m) => m.texto).join(" ")) }, deps);
    }
    return;
  }

  // Junta mensagens em rajada: só a chamada que registrou a última responde, com todas.
  await esperar(deps.espera ?? 6000);
  let { recentes, pendentes } = await lerPendentes(db, tel, deps);
  if (!pendentes.length || pendentes[pendentes.length - 1].id !== ultimoId) return;
  if (await liaPausada(db, tel, deps.agora?.())) return;
  // Uma conversa por vez: mensagens que chegam enquanto a IA pensa entram no próximo lote, sem resposta paralela.
  if (!(await reivindicar(db, tel, deps.agora?.()))) return;

  try {
    for (let lote = 0; lote < MAX_LOTES_POR_ATENDIMENTO; lote++) {
      const tratadoAte = pendentes[pendentes.length - 1].id;
      await atenderLote(env, db, de, tel, pendentes, recentes, deps);
      await esperar(deps.espera ?? 6000);
      const prox = await lerPendentes(db, tel, deps, tratadoAte);
      if (!prox.pendentes.length || (await liaPausada(db, tel, deps.agora?.()))) break;
      ({ recentes, pendentes } = prox);
    }
  } finally {
    await liberar(db, tel);
  }
}

async function atenderLote(env: Env, db: Db, de: string, tel: string, pendentes: Mensagem[], recentes: Mensagem[], deps: Deps): Promise<void> {
  const enviar = async (texto: string) => {
    const { wamid } = await enviarTexto(env, de, texto, deps.fetch);
    await registrarMensagem(db, { telefone: tel, direcao: "lia", texto, wamid });
    await registrarEnvio(db);
  };

  // Limite por contato: quem manda mensagens demais não consome o limite de todas as famílias.
  const naHora = await contarContato(db, tel, deps.agora?.());
  if (naHora > MAX_RESPOSTAS_HORA) {
    if (naHora === MAX_RESPOSTAS_HORA + 1) await abrir(env, db, tel, { categoria: "volume_alto", resumo: "Este contato passou do limite de mensagens por hora; a Lia parou de responder." }, deps);
    return;
  }

  const limiteBruto = env.LIMITE_MENSAGENS_MES === undefined || env.LIMITE_MENSAGENS_MES === "" ? NaN : Number(env.LIMITE_MENSAGENS_MES);
  const limite = Number.isFinite(limiteBruto) ? limiteBruto : 900; // 0 é um limite válido (corta todo envio)
  if (!(await podeEnviar(db, limite))) {
    await abrir(env, db, tel, { categoria: "limite_mensagens", resumo: `Limite mensal de mensagens atingido; responder manualmente: ${anonimizar(pendentes.map((p) => p.texto).join(" / "))}`, prioridade: "alta" }, deps);
    return;
  }

  const textos = pendentes.filter((p) => !/^\[[a-z_]+\]$/.test(p.texto)).map((p) => p.texto);
  if (!textos.length) {
    const jaPediu = recentes.some((m) => m.direcao === "lia" && m.texto === PEDIR_TEXTO);
    if (jaPediu) {
      await abrir(env, db, tel, { categoria: "midia", resumo: "A família enviou áudio/imagem/arquivo e insistiu; precisa de um atendente." }, deps);
      await enviar(MIDIA_INSISTENTE);
    } else await enviar(PEDIR_TEXTO);
    return;
  }

  const texto = textos.join(" ");
  // Regras duras primeiro: "sem acesso ao boleto vencido" é cobrança, não pedido de senha.
  const dura = triarPorRegras(texto);
  if (!dura && pedidoDeAcesso(texto)) {
    const alvo = env.TELEFONE_CLASSLINK ? `ao WhatsApp do ClassLink, ${env.TELEFONE_CLASSLINK}` : "ao WhatsApp do ClassLink";
    await enviar(`Para receber seu acesso ao ClassLink, envie a palavra ACESSO ${alvo}. Por segurança, eu não envio senhas por aqui.`);
    return;
  }

  if (!dura && !(await podeUsarIA(db, Number(env.LIMITE_TOKENS_DIA) || 0))) {
    await abrir(env, db, tel, { categoria: "limite_ia", resumo: anonimizar(texto), prioridade: "alta" }, deps);
    await enviar(AVISO_EQUIPE);
    return;
  }

  const provedor = contandoTokens(db, deps.provedor ?? escolherProvedor(env));
  const decisao = dura ?? (await triar(texto, provedor));
  if (decisao.acao === "acolher") {
    await abrir(env, db, tel, { categoria: decisao.categoria, prioridade: decisao.prioridade, resumo: anonimizar(texto), rascunho: RASCUNHOS[decisao.categoria] }, deps);
    await enviar(acolhimento(decisao.categoria));
    return;
  }

  const primeiraVez = !(await historico(db, tel, 50)).some((m) => m.direcao !== "entrada");
  const saida = await responder({ db, provedor, telefone: tel, textos, primeiraVez });
  if (saida.chamado) await abrir(env, db, tel, saida.chamado, deps);
  await enviar(saida.texto);
  await db.run("INSERT INTO perguntas (texto_anon, resolvida, criado_em) VALUES (?, ?, ?)", [anonimizar(texto), saida.chamado ? 0 : 1, Date.now()]);
}
