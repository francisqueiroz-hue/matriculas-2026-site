import { z } from "zod";

export const createClassSchema = z.object({
  name: z.string().min(1).max(100),
  year: z.number().int().min(2000).max(2100),
});

export const updateClassSchema = createClassSchema.partial();

export const createStudentSchema = z.object({
  name: z.string().min(1).max(150),
  classId: z.string().min(1),
  birthDate: z.string().datetime().optional(),
});

export const updateStudentSchema = createStudentSchema.partial();

export const linkGuardianSchema = z.object({
  guardianEmail: z.string().email(),
  guardianName: z.string().min(1).max(150),
  relation: z.string().max(50).optional(),
  password: z.string().min(8).optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "STAFF", "GUARDIAN"]),
  phone: z.string().max(30).optional(),
  classIds: z.array(z.string()).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  phone: z.string().max(30).optional(),
  active: z.boolean().optional(),
  classIds: z.array(z.string()).optional(),
});

export const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  audience: z.enum(["SCHOOL", "CLASS"]),
  classId: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(["image", "video"]).optional(),
});

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  classId: z.string().optional(), // ausente = evento para toda a escola
});

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const createComunicadoSchema = z.object({
  tipo: z.enum(["AUTORIZACAO_PASSEIO", "CONFIRMACAO_REUNIAO", "CIRCULAR"]),
  titulo: z.string().min(1).max(200),
  descricao: z.string().min(1).max(5000),
  audience: z.enum(["SCHOOL", "CLASS"]),
  classId: z.string().optional(),
  prazoResposta: z.string().datetime().optional(),
});

export const responderComunicadoSchema = z.object({
  alunoId: z.string().min(1),
  resposta: z.enum(["AUTORIZADO", "NAO_AUTORIZADO", "CONFIRMADO", "NAO_COMPARECERA", "LIDO"]),
});

export const setMensalidadeSchema = z.object({
  mensalidadeValor: z.number().min(0).max(1_000_000).nullable(),
  diaVencimento: z.number().int().min(1).max(28).nullable().optional(),
});

export const setBillingInfoSchema = z.object({
  cpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11, "CPF deve ter 11 dígitos"),
  endereco: z.object({
    cep: z.string().min(8).max(9),
    logradouro: z.string().min(1).max(200),
    numero: z.string().min(1).max(20),
    complemento: z.string().max(100).optional(),
    bairro: z.string().min(1).max(100),
    cidade: z.string().min(1).max(100),
    uf: z.string().length(2),
  }),
});

export const setBillingConfigSchema = z.object({
  diaVencimentoPadrao: z.number().int().min(1).max(28).optional(),
  diaEmissaoBoletos: z.number().int().min(1).max(28).optional(),
});
