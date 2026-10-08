import { z } from "zod";
import { cpfValido, dataNascimentoValida, LINHAS_ANEXO_IMAGEM } from "./tipos";

const texto = (max = 200) => z.string().trim().max(max);
const valor = z.coerce.number().min(0).max(1_000_000);

// Configuração pode ser salva incompleta (rascunho); o envio é que exige tudo preenchido
// (ver pendenciasConfig).
export const configContratoSchema = z.object({
  escola: z.object({
    endereco: texto(200),
    cep: texto(20),
    telefones: texto(100),
    email: texto(120),
    representanteLegal: texto(150),
    canalPrivacidade: texto(200),
    avisoPrivacidade: texto(200),
    portalAluno: texto(150),
    siteEscola: texto(150),
    redesSociais: texto(200),
  }),
  periodos: z
    .array(
      z.object({
        chave: z.enum(["INTEGRAL", "SEMI_INTEGRAL", "PARCIAL", "ESCOLAR"]),
        nome: texto(60).min(1),
        horario: texto(150),
        parcelaBruta: valor,
        parcelaLiquida: valor,
      }),
    )
    .length(4),
  parcelas: z.object({
    quantidade: z.coerce.number().int().min(1).max(24),
    vencimentoDia: z.coerce.number().int().min(1).max(31),
    primeiroUltimo: texto(80),
    periodoAnuidade: texto(80),
  }),
  horaExcedente: z.object({ valor, unidade: texto(40), fracionamento: texto(60), tolerancia: texto(60) }),
});

const obrigatorio = (rotulo: string, max = 150) => z.string().trim().min(1, `Informe ${rotulo}`).max(max);
const opcional = (max = 60) => z.string().trim().max(max).default("");
const cpf = z
  .string()
  .trim()
  .refine(cpfValido, "CPF inválido — confira os números");
const nascimento = z.string().trim().refine((v) => dataNascimentoValida(v), "Data inválida — use dd/mm/aaaa");
const uf = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "UF com 2 letras")
  .transform((v) => v.toUpperCase());
const cep = z
  .string()
  .trim()
  .refine((v) => v.replace(/\D/g, "").length === 8, "CEP com 8 números");

export const pessoaSchema = z.object({
  nome: obrigatorio("o nome completo"),
  cpf,
  nascimento,
  rg: obrigatorio("o RG", 30),
  orgao: obrigatorio("o órgão emissor", 30),
  uf,
  endereco: obrigatorio("o endereço", 200),
  numero: obrigatorio("o número", 20),
  complemento: opcional(80),
  cep,
  bairro: obrigatorio("o bairro", 80),
  cidade: obrigatorio("a cidade", 80),
  email: z.string().trim().email("E-mail inválido").max(120),
  telefone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone com DDD"),
});

export const dadosFamiliaSchema = z
  .object({
    financeiro: pessoaSchema,
    pedagogicoMesmo: z.boolean(),
    pedagogico: pessoaSchema.nullable(),
    aluno: z.object({
      nascimento,
      rg: opcional(30),
      orgao: opcional(30),
      uf: z
        .string()
        .trim()
        .max(2)
        .transform((v) => v.toUpperCase())
        .default(""),
      enderecoMesmo: z.boolean(),
      endereco: opcional(200),
      numero: opcional(20),
      complemento: opcional(80),
      bairro: opcional(80),
      cidade: opcional(80),
      cep: opcional(20),
    }),
    responsavelLegal: z.object({
      quem: z.enum(["FINANCEIRO", "PEDAGOGICO", "OUTRO"]),
      nome: z.string().trim().max(150).default(""),
      cpf: z.string().trim().max(20).default(""),
      vinculo: obrigatorio("o vínculo com o aluno (ex.: mãe, pai, tutor)", 60),
      contato: z.string().trim().max(60).default(""),
    }),
    imagem: z
      .array(z.enum(["AUTORIZO", "NAO_AUTORIZO"], { error: "Escolha AUTORIZO ou NÃO AUTORIZO" }))
      .length(LINHAS_ANEXO_IMAGEM.length, "Responda todas as linhas da autorização de imagem"),
  })
  .superRefine((d, ctx) => {
    if (!d.pedagogicoMesmo && !d.pedagogico) {
      ctx.addIssue({ code: "custom", path: ["pedagogico"], message: "Preencha os dados do responsável pedagógico" });
    }
    if (!d.aluno.enderecoMesmo) {
      for (const k of ["endereco", "numero", "bairro", "cidade"] as const) {
        if (!d.aluno[k]) ctx.addIssue({ code: "custom", path: ["aluno", k], message: "Preencha o endereço do aluno" });
      }
      if (d.aluno.cep.replace(/\D/g, "").length !== 8) ctx.addIssue({ code: "custom", path: ["aluno", "cep"], message: "CEP com 8 números" });
    }
    if (d.responsavelLegal.quem === "OUTRO") {
      if (!d.responsavelLegal.nome) ctx.addIssue({ code: "custom", path: ["responsavelLegal", "nome"], message: "Informe o nome do responsável legal" });
      if (!cpfValido(d.responsavelLegal.cpf)) ctx.addIssue({ code: "custom", path: ["responsavelLegal", "cpf"], message: "CPF do responsável legal inválido" });
    }
  });

export type DadosFamiliaEntrada = z.input<typeof dadosFamiliaSchema>;

export const envioLoteSchema = z.object({
  anoLetivo: z.coerce.number().int().min(2020).max(2100),
  titulo: z.string().trim().min(3).max(150),
  itens: z
    .array(
      z.object({
        studentId: z.string().min(1),
        periodo: z.enum(["INTEGRAL", "SEMI_INTEGRAL", "PARCIAL", "ESCOLAR"]),
        etapa: z.enum(["EI", "EF1"]),
        // Ajuste individual (bolsa/desconto); ausente = valor da tabela do período.
        parcelaBruta: valor.optional(),
        parcelaLiquida: valor.optional(),
      }),
    )
    .min(1, "Escolha pelo menos um aluno")
    .max(300),
});
