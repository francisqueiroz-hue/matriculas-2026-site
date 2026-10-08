import { prisma } from "@/lib/prisma";
import { configContratoSchema } from "./validacao";
import { configInicial, type ConfigContrato, type DadosFamilia, type Pessoa } from "./tipos";

/** Configuração salva do ano (ou o ponto de partida com horários/contatos do contrato original). */
export async function carregarConfig(schoolId: string, anoLetivo: number): Promise<{ config: ConfigContrato; salva: boolean; atualizadaEm: Date | null }> {
  const registro = await prisma.contratoConfig.findUnique({ where: { schoolId_anoLetivo: { schoolId, anoLetivo } } });
  if (!registro) return { config: configInicial(), salva: false, atualizadaEm: null };
  const lido = configContratoSchema.safeParse(registro.dados);
  return { config: lido.success ? lido.data : configInicial(), salva: true, atualizadaEm: registro.updatedAt };
}

/** Resolve quem é o responsável legal (pela guarda) a partir da escolha feita no formulário. */
export function resolverResponsavelLegal(d: DadosFamilia): DadosFamilia["responsavelLegal"] {
  const pedagogico = d.pedagogicoMesmo || !d.pedagogico ? d.financeiro : d.pedagogico;
  const base = d.responsavelLegal.quem === "FINANCEIRO" ? d.financeiro : d.responsavelLegal.quem === "PEDAGOGICO" ? pedagogico : null;
  return {
    ...d.responsavelLegal,
    nome: base ? base.nome : d.responsavelLegal.nome,
    cpf: base ? base.cpf : d.responsavelLegal.cpf,
    contato: d.responsavelLegal.contato || (base ? base.telefone : ""),
  };
}

const pessoaVazia = (): Pessoa => ({
  nome: "",
  cpf: "",
  nascimento: "",
  rg: "",
  orgao: "",
  uf: "RJ",
  endereco: "",
  numero: "",
  complemento: "",
  cep: "",
  bairro: "",
  cidade: "Niterói",
  email: "",
  telefone: "",
});

function dataBr(d: Date | null | undefined): string {
  if (!d) return "";
  // birthDate é guardada como data (meia-noite UTC): usa os campos UTC para não voltar um dia.
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/**
 * Sugestão de preenchimento para a família: dados já enviados antes (se for correção) ou o
 * que o ClassLink já sabe do responsável logado e do aluno — nada é inventado.
 */
export async function sugestaoDadosFamilia(guardianId: string, studentId: string, salvos: unknown): Promise<DadosFamilia> {
  if (salvos && typeof salvos === "object") return salvos as DadosFamilia;
  const [user, aluno] = await Promise.all([
    prisma.user.findUnique({ where: { id: guardianId }, select: { name: true, email: true, phone: true, cpf: true, enderecoCobranca: true } }),
    prisma.student.findUnique({ where: { id: studentId }, select: { birthDate: true } }),
  ]);
  const financeiro = pessoaVazia();
  financeiro.nome = user?.name ?? "";
  financeiro.email = user?.email ?? "";
  financeiro.telefone = user?.phone ?? "";
  financeiro.cpf = user?.cpf ?? "";
  const end = user?.enderecoCobranca as { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string } | null;
  if (end) {
    financeiro.endereco = end.logradouro ?? "";
    financeiro.numero = end.numero ?? "";
    financeiro.complemento = end.complemento ?? "";
    financeiro.bairro = end.bairro ?? "";
    financeiro.cidade = end.cidade ?? financeiro.cidade;
    financeiro.uf = end.uf ?? financeiro.uf;
    financeiro.cep = end.cep ?? "";
  }
  return {
    financeiro,
    pedagogicoMesmo: true,
    pedagogico: null,
    aluno: {
      nascimento: dataBr(aluno?.birthDate),
      rg: "",
      orgao: "",
      uf: "",
      enderecoMesmo: true,
      endereco: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      cep: "",
    },
    responsavelLegal: { quem: "FINANCEIRO", nome: "", cpf: "", vinculo: "", contato: "" },
    imagem: [],
  };
}
