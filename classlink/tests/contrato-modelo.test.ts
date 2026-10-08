import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  calcularValores,
  configInicial,
  cpfValido,
  dataNascimentoValida,
  etapaPelaTurma,
  formatarDinheiro,
  LINHAS_ANEXO_IMAGEM,
  MODELO_CONTRATO_2027,
  pendenciasConfig,
  type ConfigContrato,
  type DadosFamilia,
  type Pessoa,
} from "@/lib/contrato-modelo/tipos";
import { configContratoSchema, dadosFamiliaSchema, envioLoteSchema } from "@/lib/contrato-modelo/validacao";
import { gerarContrato2027 } from "@/lib/contrato-modelo/gerar";
import { CLAUSULAS_2027 } from "@/lib/contrato-modelo/texto-2027";

function configCompleta(): ConfigContrato {
  const c = configInicial();
  c.escola = {
    ...c.escola,
    representanteLegal: "Diretora Exemplo",
    canalPrivacidade: "privacidade@exemplo.com.br",
    avisoPrivacidade: "https://exemplo.com.br/privacidade",
    portalAluno: "app.exemplo.com.br",
    siteEscola: "exemplo.com.br",
    redesSociais: "@exemplo",
  };
  c.periodos = c.periodos.map((p, i) => ({ ...p, parcelaBruta: 3000 - i * 500, parcelaLiquida: 2800 - i * 500 }));
  c.parcelas = { quantidade: 12, vencimentoDia: 10, primeiroUltimo: "10/01/2027 a 10/12/2027", periodoAnuidade: "janeiro a dezembro de 2027" };
  c.horaExcedente = { valor: 50, unidade: "hora", fracionamento: "frações de 30 minutos", tolerancia: "15 minutos" };
  return c;
}

const pessoa = (over: Partial<Pessoa> = {}): Pessoa => ({
  nome: "Maria da Silva",
  cpf: "529.982.247-25",
  nascimento: "01/02/1985",
  rg: "12.345.678-9",
  orgao: "DETRAN",
  uf: "rj",
  endereco: "Rua das Flores",
  numero: "10",
  complemento: "",
  cep: "24358-000",
  bairro: "Camboinhas",
  cidade: "Niterói",
  email: "maria@exemplo.com",
  telefone: "(21) 99999-0000",
  ...over,
});

function familia(over: Partial<DadosFamilia> = {}): DadosFamilia {
  return {
    financeiro: pessoa(),
    pedagogicoMesmo: true,
    pedagogico: null,
    aluno: { nascimento: "05/06/2021", rg: "", orgao: "", uf: "", enderecoMesmo: true, endereco: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "" },
    responsavelLegal: { quem: "FINANCEIRO", nome: "", cpf: "", vinculo: "mãe", contato: "" },
    imagem: ["AUTORIZO", "NAO_AUTORIZO", "AUTORIZO", "NAO_AUTORIZO", "AUTORIZO", "NAO_AUTORIZO"],
    ...over,
  };
}

describe("regras do contrato do app", () => {
  it("CPF: aceita válido com ou sem máscara e recusa dígito errado ou repetido", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });

  it("data de nascimento: dd/mm/aaaa existente e no passado", () => {
    const hoje = new Date(2026, 9, 8);
    expect(dataNascimentoValida("29/02/2020", hoje)).toBe(true);
    expect(dataNascimentoValida("29/02/2021", hoje)).toBe(false);
    expect(dataNascimentoValida("31/04/2020", hoje)).toBe(false);
    expect(dataNascimentoValida("01/01/2030", hoje)).toBe(false);
    expect(dataNascimentoValida("2020-01-01", hoje)).toBe(false);
  });

  it("calcula anuidade, desconto e primeira parcela", () => {
    expect(calcularValores({ parcelaBruta: 4007, parcelaLiquida: 3606.3, quantidade: 12 })).toEqual({
      anuidade: 48084,
      descontoValor: 400.7,
      descontoPct: 10,
      primeiraParcela: 4007,
    });
    expect(formatarDinheiro(48084)).toBe("48.084,00");
  });

  it("etapa deduzida do nome da turma", () => {
    expect(etapaPelaTurma("3º Ano A")).toBe("EF1");
    expect(etapaPelaTurma("1 ano")).toBe("EF1");
    expect(etapaPelaTurma("Maternal II")).toBe("EI");
    expect(etapaPelaTurma("Pré I")).toBe("EI");
  });

  it("configuração inicial bloqueia o envio até preencher valores e dados da escola", () => {
    const p = pendenciasConfig(configInicial());
    expect(p).toContain("Parcela cheia — Integral");
    expect(p).toContain("Representante legal da escola");
    expect(p).toContain("Valor da hora excedente");
    expect(pendenciasConfig(configCompleta())).toEqual([]);
  });

  it("acusa parcela até o vencimento maior que a cheia", () => {
    const c = configCompleta();
    c.periodos[0] = { ...c.periodos[0], parcelaLiquida: c.periodos[0].parcelaBruta + 1 };
    expect(pendenciasConfig(c)).toContain("Integral: parcela até o vencimento maior que a cheia");
  });
});

describe("validação dos dados da família", () => {
  it("aceita dados completos e normaliza a UF", () => {
    const r = dadosFamiliaSchema.parse(familia());
    expect(r.financeiro.uf).toBe("RJ");
  });

  it("exige todas as linhas do Anexo I (sem opção pré-marcada)", () => {
    expect(dadosFamiliaSchema.safeParse(familia({ imagem: [] })).success).toBe(false);
    expect(dadosFamiliaSchema.safeParse({ ...familia(), imagem: ["AUTORIZO", null, "AUTORIZO", "AUTORIZO", "AUTORIZO", "AUTORIZO"] }).success).toBe(false);
  });

  it("recusa CPF inválido do responsável financeiro", () => {
    const r = dadosFamiliaSchema.safeParse(familia({ financeiro: pessoa({ cpf: "123.456.789-00" }) }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["financeiro", "cpf"]);
  });

  it("pedagógico diferente exige os dados dele", () => {
    expect(dadosFamiliaSchema.safeParse(familia({ pedagogicoMesmo: false, pedagogico: null })).success).toBe(false);
    expect(dadosFamiliaSchema.safeParse(familia({ pedagogicoMesmo: false, pedagogico: pessoa({ nome: "João" }) })).success).toBe(true);
  });

  it("aluno em outro endereço exige o endereço completo", () => {
    const base = familia();
    const r = dadosFamiliaSchema.safeParse({ ...base, aluno: { ...base.aluno, enderecoMesmo: false } });
    expect(r.success).toBe(false);
  });

  it("responsável legal 'outra pessoa' exige nome e CPF válido", () => {
    const outro = (nome: string, cpf: string) => familia({ responsavelLegal: { quem: "OUTRO", nome, cpf, vinculo: "avó", contato: "" } });
    expect(dadosFamiliaSchema.safeParse(outro("", "529.982.247-25")).success).toBe(false);
    expect(dadosFamiliaSchema.safeParse(outro("Ana", "000")).success).toBe(false);
    expect(dadosFamiliaSchema.safeParse(outro("Ana", "529.982.247-25")).success).toBe(true);
  });
});

describe("validação do painel", () => {
  it("configuração precisa dos 4 períodos", () => {
    const c = configCompleta();
    expect(configContratoSchema.safeParse(c).success).toBe(true);
    expect(configContratoSchema.safeParse({ ...c, periodos: c.periodos.slice(0, 3) }).success).toBe(false);
  });

  it("envio em lote exige ao menos um aluno e período válido", () => {
    expect(envioLoteSchema.safeParse({ anoLetivo: 2027, titulo: "Contrato", itens: [] }).success).toBe(false);
    expect(envioLoteSchema.safeParse({ anoLetivo: 2027, titulo: "Contrato", itens: [{ studentId: "a", periodo: "NOTURNO", etapa: "EI" }] }).success).toBe(false);
    expect(envioLoteSchema.safeParse({ anoLetivo: 2027, titulo: "Contrato", itens: [{ studentId: "a", periodo: "INTEGRAL", etapa: "EI" }] }).success).toBe(true);
  });
});

describe("geração do PDF", () => {
  it("texto não carrega notas internas de revisão", () => {
    const tudo = CLAUSULAS_2027.join("\n");
    expect(tudo).not.toMatch(/VALIDAR|a validar|Conferência antes da assinatura|pendentes de validação/i);
    expect(LINHAS_ANEXO_IMAGEM).toHaveLength(6);
  });

  it("gera um PDF válido com contrato e Anexo I", async () => {
    const config = configCompleta();
    const bytes = await gerarContrato2027({
      condicoes: { modelo: MODELO_CONTRATO_2027, anoLetivo: 2027, etapa: "EI", turma: "Maternal II", periodo: "INTEGRAL", parcelaBruta: 3000, parcelaLiquida: 2800, config },
      familia: familia(),
      aluno: { nome: "Davi Silva" },
      data: new Date(2026, 9, 8, 12),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(5);
    expect(doc.getPageCount()).toBeLessThanOrEqual(8);
  });

});
