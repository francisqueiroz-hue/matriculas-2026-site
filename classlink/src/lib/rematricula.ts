/** Campanha de rematrícula exibida no painel dos responsáveis. Desative com `ativa: false`. */
export const CAMPANHA_REMATRICULA = {
  ativa: true,
  ano: 2027,
  /** WhatsApp da secretaria (DDI + DDD + número, só dígitos). */
  whatsapp: "5521964699441",
};

export interface AlunoRematricula {
  name: string;
  class: { name: string } | null;
}

export function mensagemRematricula(responsavel: string, alunos: AlunoRematricula[], ano = CAMPANHA_REMATRICULA.ano) {
  const linhas = [`Olá! Quero confirmar a *rematrícula ${ano}*.`, "", `*Responsável:* ${responsavel}`];
  if (alunos.length > 0) {
    linhas.push(`*Aluno(s):* ${alunos.map((a) => (a.class ? `${a.name} (${a.class.name})` : a.name)).join(", ")}`);
  }
  return linhas.join("\n");
}

export function linkWhatsAppRematricula(responsavel: string, alunos: AlunoRematricula[]) {
  return `https://wa.me/${CAMPANHA_REMATRICULA.whatsapp}?text=${encodeURIComponent(mensagemRematricula(responsavel, alunos))}`;
}
