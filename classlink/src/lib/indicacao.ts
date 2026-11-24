import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";

const ANO_LETIVO_MATRICULAS = CAMPANHA_REMATRICULA.ano;

/**
 * "Indique uma família": o responsável compartilha, pelo WhatsApp dele, o link da página de
 * matrículas com o próprio nome em `?indicacao=`. A página preenche "Como conheceu → Indicação"
 * e "Quem indicou", e a secretaria vê a indicação na lista de Matrículas. Nenhum dado de quem
 * recebe o link é coletado aqui: o contato só existe se a família convidada enviar o formulário.
 */

/**
 * Benefício de quem indica, decidido pela direção em 24/11/2026: um benefício na parte pedagógica
 * escolar, sem dizer qual nem quanto. Os detalhes ficam com a secretaria.
 */
export const BENEFICIO_INDICACAO =
  "Quando a família indicada faz a matrícula, quem indicou recebe um benefício na parte pedagógica escolar. Os detalhes são combinados com a secretaria.";

/** Nome que vai no link: só o primeiro e o último nome, para não expor o nome completo. */
export function nomeParaIndicacao(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes[0]} ${partes[partes.length - 1]}`.slice(0, 80);
}

/** Link da página de matrículas com a indicação e a campanha "indicacao" (mede o canal). */
export function linkIndicacao(origem: string, nomeCompleto: string): string {
  const url = new URL("/matriculas", origem);
  const nome = nomeParaIndicacao(nomeCompleto);
  if (nome) url.searchParams.set("indicacao", nome);
  url.searchParams.set("utm_source", "indicacao");
  url.hash = "pre-matricula";
  return url.toString();
}

/** Texto pronto para o WhatsApp de quem indica (a pessoa escolhe o contato e pode editar). */
export function mensagemIndicacao(link: string, ano = ANO_LETIVO_MATRICULAS): string {
  return (
    `Oi! Meu filho estuda no Instituto Fokus / Espaço Kids e a gente gosta muito da escola. 💛\n\n` +
    `As matrículas ${ano} estão abertas. Se quiser conhecer, dá para agendar uma visita por aqui:\n${link}`
  );
}

/** wa.me sem número: o WhatsApp abre a lista de contatos para a pessoa escolher com quem compartilhar. */
export function linkWhatsAppIndicacao(origem: string, nomeCompleto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagemIndicacao(linkIndicacao(origem, nomeCompleto)))}`;
}
