import { adicionar, buscar } from "./conhecimento";
import type { Db } from "./db";
import { decidirSugestao, listarChamados, listarSugestoes, resolverChamado, abrirChamado } from "./fila";
import { lerFatos, salvarFato } from "./memoria";
import type { FerramentaDef } from "./provedor";
import { horariosLivres, reservar } from "./visitas";

export interface Ferramenta {
  def: FerramentaDef;
  executar(args: Record<string, unknown>): Promise<unknown>;
}
const str = (v: unknown) => (typeof v === "string" ? v : "");
const objeto = (propriedades: Record<string, unknown>, obrigatorios: string[] = []) => ({ type: "object", properties: propriedades, required: obrigatorios });
const texto = { type: "string" };

/**
 * Ferramentas que o modelo pode chamar durante uma conversa. O telefone é fixado aqui, pelo
 * servidor: nenhuma ferramenta aceita telefone como argumento, então o modelo nunca escolhe de
 * quem lê ou grava dados.
 */
export function criarFerramentas(db: Db, telefone: string) {
  const f = {
    buscar_conhecimento: {
      def: { nome: "buscar_conhecimento", descricao: "Busca respostas aprovadas da escola (matrícula, visitas, documentos, rotina).", parametros: objeto({ consulta: texto }, ["consulta"]) },
      executar: async (a) => buscar(db, str(a.consulta)),
    },
    ler_memoria_familia: {
      def: { nome: "ler_memoria_familia", descricao: "Lê os fatos já conhecidos sobre esta família.", parametros: objeto({}) },
      executar: async () => lerFatos(db, telefone),
    },
    salvar_fato_familia: {
      def: { nome: "salvar_fato_familia", descricao: "Guarda um fato curto e útil sobre a família (série do filho, período preferido). Nunca CPF, e-mail ou saúde.", parametros: objeto({ fato: texto }, ["fato"]) },
      executar: async (a) => {
        try {
          await salvarFato(db, telefone, str(a.fato));
          return { ok: true };
        } catch (e) {
          return { erro: (e as Error).message };
        }
      },
    },
    consultar_horarios_visita: {
      def: { nome: "consultar_horarios_visita", descricao: "Lista os horários de visita com vaga.", parametros: objeto({}) },
      executar: async () => (await horariosLivres(db, new Date().toISOString().slice(0, 10))).slice(0, 10),
    },
    reservar_visita: {
      def: { nome: "reservar_visita", descricao: "Reserva uma visita. Confirme série e período com a família antes.", parametros: objeto({ horario_id: { type: "integer" }, serie: texto }, ["horario_id", "serie"]) },
      executar: async (a) => reservar(db, telefone, Number(a.horario_id), str(a.serie)),
    },
    encaminhar_humano: {
      def: { nome: "encaminhar_humano", descricao: "Abre um chamado para a equipe quando faltar informação ou o assunto exigir uma pessoa.", parametros: objeto({ motivo: texto, resumo: texto, prioridade: { type: "string", enum: ["normal", "alta", "urgente"] } }, ["motivo", "resumo"]) },
      executar: async (a) => {
        const id = await abrirChamado(db, { telefone, categoria: str(a.motivo) || "outros", prioridade: str(a.prioridade) || "normal", resumo: str(a.resumo).slice(0, 500) });
        return { chamado: id };
      },
    },
  } satisfies Record<string, Ferramenta>;
  return f as Record<keyof typeof f, Ferramenta>;
}

/** Ferramentas administrativas, expostas só pelo servidor MCP (autenticado) ao dono. */
export function criarFerramentasAdmin(db: Db): Record<string, Ferramenta> {
  return {
    buscar_conhecimento: {
      def: { nome: "buscar_conhecimento", descricao: "Busca na base aprovada.", parametros: objeto({ consulta: texto }, ["consulta"]) },
      executar: async (a) => buscar(db, str(a.consulta), 8),
    },
    adicionar_conhecimento: {
      def: { nome: "adicionar_conhecimento", descricao: "Publica um item aprovado na base (sem dados pessoais).", parametros: objeto({ pergunta: texto, resposta: texto }, ["pergunta", "resposta"]) },
      executar: async (a) => ({ id: await adicionar(db, str(a.pergunta), str(a.resposta), true) }),
    },
    listar_chamados: {
      def: { nome: "listar_chamados", descricao: "Lista chamados (status: aberto ou resolvido).", parametros: objeto({ status: texto }) },
      executar: async (a) => listarChamados(db, str(a.status) || undefined),
    },
    resolver_chamado: {
      def: { nome: "resolver_chamado", descricao: "Marca um chamado como resolvido.", parametros: objeto({ id: { type: "integer" } }, ["id"]) },
      executar: async (a) => (await resolverChamado(db, Number(a.id)), { ok: true }),
    },
    listar_sugestoes: {
      def: { nome: "listar_sugestoes", descricao: "Lista sugestões de base geradas das perguntas repetidas.", parametros: objeto({}) },
      executar: async () => listarSugestoes(db),
    },
    decidir_sugestao: {
      def: { nome: "decidir_sugestao", descricao: "Aprova (com resposta editada opcional) ou rejeita uma sugestão.", parametros: objeto({ id: { type: "integer" }, aprovar: { type: "boolean" }, resposta: texto }, ["id", "aprovar"]) },
      executar: async (a) => (await decidirSugestao(db, Number(a.id), a.aprovar === true, str(a.resposta) || undefined), { ok: true }),
    },
  };
}
