/**
 * Cria (ou atualiza) a família de DEMONSTRAÇÃO, para a direção entrar no app como família e
 * conferir as telas (Faturas, Mural, Comunicados, Rotina, Boletim...). Tudo fica numa escola
 * separada, marcada com `demonstracao = true`: a conta demo não enxerga nada da escola real e a
 * escola real não enxerga a demo (listas, contagens, exportações, funil). Ver
 * src/lib/escola-demonstracao.ts para os bloqueios de cron, Banco Inter e formulário público.
 *
 * Uso (só com autorização da direção, depois do merge que cria a coluna `demonstracao`):
 *   DATABASE_URL=... DEMO_FAMILIA_EMAIL=... npx tsx scripts/criar-familia-demo.ts
 *
 * Senha: o script grava uma senha aleatória e NÃO a mostra em lugar nenhum (nem no terminal).
 * Para entrar, use "Esqueci a senha" na tela de login com o e-mail da conta demo: a nova senha
 * chega só nesse e-mail. Para trocar (rotacionar), repita o "Esqueci a senha" ou use Conta >
 * Trocar senha. Rodar o script de novo recria só o conteúdo fictício (datas de hoje) e mantém
 * a senha e o login da família.
 *
 * Nenhum dado real: nomes, turmas, valores e códigos de pagamento são fictícios. Os códigos
 * Pix/linha digitável são inválidos de propósito (nenhum banco aceita) e o PDF do boleto é
 * bloqueado na escola de demonstração.
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

// Datas como no app: "AAAA-MM-DD" no fuso da escola, gravadas à meia-noite UTC.
const hojeNaEscola = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dataParaMeiaNoiteUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
function somarDias(iso: string, dias: number): string {
  const d = dataParaMeiaNoiteUtc(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function segundaDaSemana(iso: string): string {
  const diaSemana = dataParaMeiaNoiteUtc(iso).getUTCDay();
  return somarDias(iso, diaSemana === 0 ? -6 : 1 - diaSemana);
}
const REFEICOES_PADRAO = ["Lanche da manhã", "Almoço", "Lanche da tarde"];

const ESCOLA_ID = "escola-demonstracao";
const DIRECAO_ID = "demo-direcao";
const FAMILIA_ID = "demo-familia";
const TURMA_EI_ID = "demo-turma-ei";
const TURMA_EF_ID = "demo-turma-ef";
const ALUNO_EI_ID = "demo-aluno-ei";
const ALUNO_EF_ID = "demo-aluno-ef";

export const PIX_DEMONSTRACAO = "DEMONSTRACAO-SEM-VALOR-NAO-PAGUE";
export const LINHA_DEMONSTRACAO = "00000.00000 00000.000000 00000.000000 0 00000000000000";

function senhaAleatoria(): string {
  return randomBytes(24).toString("base64url");
}

async function main() {
  const email = process.env.DEMO_FAMILIA_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Defina DEMO_FAMILIA_EMAIL com o e-mail que vai receber a senha da conta demo.");
  }

  // Trava: o id fixo só pode ser de uma escola de demonstração, e o e-mail não pode ser de
  // alguém da escola real.
  const existente = await prisma.school.findUnique({ where: { id: ESCOLA_ID }, select: { demonstracao: true } });
  if (existente && !existente.demonstracao) throw new Error(`A escola ${ESCOLA_ID} existe e não é de demonstração. Nada foi alterado.`);
  const dono = await prisma.user.findUnique({ where: { email }, select: { id: true, schoolId: true } });
  if (dono && (dono.id !== FAMILIA_ID || dono.schoolId !== ESCOLA_ID)) {
    throw new Error("Esse e-mail já é de outra conta. Use um e-mail só para a demonstração (ex.: com +demo).");
  }

  const hoje = hojeNaEscola(); // "AAAA-MM-DD" no fuso da escola
  const dia = (iso: string) => dataParaMeiaNoiteUtc(iso);
  const [ano, mes] = hoje.split("-").map(Number);
  const mesRef = (deslocamento: number) => {
    const d = new Date(Date.UTC(ano, mes - 1 + deslocamento, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  // Vencimento dia 05, às 12h UTC (09h em Brasília) para não virar o dia anterior.
  const venc = (ref: string) => new Date(`${ref}-05T12:00:00Z`);

  await prisma.school.upsert({
    where: { id: ESCOLA_ID },
    update: { demonstracao: true, lembretesAtivos: false, avisoTurmasAtivo: false },
    create: {
      id: ESCOLA_ID,
      name: "Escola Demonstração (fictícia)",
      demonstracao: true,
      lembretesAtivos: false,
      avisoTurmasAtivo: false,
    },
  });

  // Direção fictícia: autora do conteúdo. Sem e-mail e sem telefone, com senha que ninguém
  // conhece: não dá para entrar com ela nem recuperar a senha, e nada é enviado para ela.
  await prisma.user.upsert({
    where: { id: DIRECAO_ID },
    update: { email: null, phone: null, avisosWhatsApp: false },
    create: {
      id: DIRECAO_ID,
      name: "Direção (demonstração)",
      nomeParaFamilias: "Direção",
      role: "ADMIN",
      funcao: "DIRECAO",
      passwordHash: await hashPassword(senhaAleatoria()),
      schoolId: ESCOLA_ID,
    },
  });

  // Família fictícia. Senha só na criação; nas próximas execuções fica a que a pessoa tiver.
  await prisma.user.upsert({
    where: { id: FAMILIA_ID },
    update: { email, phone: null, active: true, deletedAt: null },
    create: {
      id: FAMILIA_ID,
      name: "Família Demonstração",
      email,
      role: "GUARDIAN",
      passwordHash: await hashPassword(senhaAleatoria()),
      senhaProvisoria: true,
      schoolId: ESCOLA_ID,
    },
  });

  // Recria só o conteúdo, sempre dentro da escola de demonstração (turmas levam alunos,
  // notas, frequência, rotina e boletos junto, por cascata).
  await prisma.$transaction([
    prisma.class.deleteMany({ where: { schoolId: ESCOLA_ID } }),
    prisma.post.deleteMany({ where: { schoolId: ESCOLA_ID } }),
    prisma.comunicado.deleteMany({ where: { schoolId: ESCOLA_ID } }),
    prisma.enquete.deleteMany({ where: { schoolId: ESCOLA_ID } }),
    prisma.event.deleteMany({ where: { schoolId: ESCOLA_ID } }),
    prisma.cardapio.deleteMany({ where: { schoolId: ESCOLA_ID } }),
    prisma.disciplina.deleteMany({ where: { schoolId: ESCOLA_ID } }),
    prisma.conversation.deleteMany({ where: { guardianId: FAMILIA_ID } }),
  ]);

  await prisma.class.createMany({
    data: [
      { id: TURMA_EI_ID, name: "Infantil 4 A (demonstração)", year: ano, schoolId: ESCOLA_ID },
      { id: TURMA_EF_ID, name: "2º Ano A (demonstração)", year: ano, schoolId: ESCOLA_ID },
    ],
  });
  await prisma.student.createMany({
    data: [
      { id: ALUNO_EI_ID, name: "Lia Demonstração", classId: TURMA_EI_ID, schoolId: ESCOLA_ID, birthDate: new Date(Date.UTC(ano - 4, 2, 10)), mensalidadeValor: 1000, diaVencimento: 5 },
      { id: ALUNO_EF_ID, name: "Theo Demonstração", classId: TURMA_EF_ID, schoolId: ESCOLA_ID, birthDate: new Date(Date.UTC(ano - 7, 7, 22)), mensalidadeValor: 1200, diaVencimento: 5 },
    ],
  });
  await prisma.guardianStudent.createMany({
    data: [
      { guardianId: FAMILIA_ID, studentId: ALUNO_EI_ID, relation: "Responsável", responsavelFinanceiro: true },
      { guardianId: FAMILIA_ID, studentId: ALUNO_EF_ID, relation: "Responsável", responsavelFinanceiro: true },
    ],
  });

  // Faturas: pagas, atrasada e em aberto. As "pagáveis" têm códigos inválidos de propósito.
  const boletos = [
    { ref: mesRef(-2), status: "PAGO" as const, pago: true },
    { ref: mesRef(-1), status: "PAGO" as const, pago: true },
    { ref: mesRef(0), status: "PENDENTE" as const, pago: false },
    { ref: mesRef(1), status: "PENDENTE" as const, pago: false },
  ];
  for (const [alunoId, valor] of [[ALUNO_EI_ID, 1000], [ALUNO_EF_ID, 1200]] as const) {
    for (const b of boletos) {
      await prisma.boleto.create({
        data: {
          studentId: alunoId,
          schoolId: ESCOLA_ID,
          mesReferencia: b.ref,
          valor,
          vencimento: venc(b.ref),
          status: b.status,
          pagoEm: b.pago ? new Date(`${b.ref}-04T15:00:00Z`) : null,
          valorPago: b.pago ? valor : null,
          codigoSolicitacao: `DEMO-${alunoId}-${b.ref}`,
          linhaDigitavel: b.pago ? null : LINHA_DEMONSTRACAO,
          pixCopiaCola: b.pago ? null : PIX_DEMONSTRACAO,
        },
      });
    }
  }

  await prisma.post.createMany({
    data: [
      { title: "Bem-vindos à conta de demonstração", body: "Esta é uma publicação fictícia do Mural, só para conferir como as famílias veem o app.", audience: "SCHOOL", schoolId: ESCOLA_ID, authorId: DIRECAO_ID },
      { title: "Atividade de pintura (exemplo)", body: "Hoje a turma explorou cores e texturas. Texto de exemplo, sem dados reais.", audience: "CLASS", classId: TURMA_EI_ID, schoolId: ESCOLA_ID, authorId: DIRECAO_ID },
    ],
  });

  await prisma.comunicado.create({
    data: { tipo: "CIRCULAR", titulo: "Circular de exemplo", descricao: "Comunicado fictício para conferir a tela de Comunicados.", audience: "SCHOOL", schoolId: ESCOLA_ID, criadoPorId: DIRECAO_ID },
  });
  await prisma.comunicado.create({
    data: {
      tipo: "AUTORIZACAO_PASSEIO",
      titulo: "Passeio ao parque (exemplo)",
      descricao: "Autorização fictícia: responda para ver como funciona. Nada é enviado a ninguém.",
      audience: "CLASS",
      classId: TURMA_EF_ID,
      prazoResposta: new Date(`${somarDias(hoje, 7)}T23:00:00Z`),
      schoolId: ESCOLA_ID,
      criadoPorId: DIRECAO_ID,
    },
  });

  await prisma.event.createMany({
    data: [
      { title: "Reunião de pais (exemplo)", description: "Evento fictício da Agenda.", startsAt: new Date(`${somarDias(hoje, 5)}T22:00:00Z`), schoolId: ESCOLA_ID, authorId: DIRECAO_ID },
      { title: "Festa da primavera (exemplo)", startsAt: new Date(`${somarDias(hoje, 12)}T13:00:00Z`), classId: TURMA_EI_ID, schoolId: ESCOLA_ID, authorId: DIRECAO_ID },
    ],
  });

  const itens = ["Fruta e iogurte", "Arroz, feijão, frango e salada", "Pão integral e suco"];
  await prisma.cardapio.create({
    data: {
      schoolId: ESCOLA_ID,
      semanaInicio: dia(segundaDaSemana(hoje)),
      conteudo: { refeicoes: REFEICOES_PADRAO, itens: { seg: itens, ter: itens, qua: itens, qui: itens, sex: itens } },
      observacoes: "Cardápio fictício.",
      status: "PUBLICADO",
      publicadoEm: new Date(),
      criadoPorId: DIRECAO_ID,
    },
  });

  // Frequência dos últimos 5 dias úteis (fundamental) e rotina de hoje e ontem (infantil).
  const diasUteis: string[] = [];
  for (let i = 0; diasUteis.length < 5 && i < 14; i++) {
    const d = somarDias(hoje, -i);
    const semana = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (semana !== 0 && semana !== 6) diasUteis.push(d);
  }
  await prisma.attendance.createMany({
    data: diasUteis.map((d, i) => ({ studentId: ALUNO_EF_ID, date: dia(d), status: i === 2 ? ("ABSENT" as const) : ("PRESENT" as const), markedById: DIRECAO_ID })),
  });
  await prisma.rotinaDiaria.createMany({
    data: [hoje, somarDias(hoje, -1)].map((d, i) => ({
      schoolId: ESCOLA_ID,
      studentId: ALUNO_EI_ID,
      data: dia(d),
      colacao: "TUDO",
      almoco: i === 0 ? "BEM" : "POUCO",
      lanche: "TUDO",
      sono: ["TARDE"],
      evacuacao: ["NORMAL"],
      banho: false,
      observacoes: "Rotina fictícia para demonstração.",
      preenchidoPorNome: "Direção",
    })),
  });

  // Boletim (fundamental): três disciplinas, 1º e 2º trimestres.
  for (const nome of ["Língua Portuguesa", "Matemática", "Ciências"]) {
    const disc = await prisma.disciplina.create({ data: { nome, schoolId: ESCOLA_ID } });
    await prisma.nota.createMany({
      data: (["PRIMEIRO", "SEGUNDO"] as const).map((trimestre, i) => ({
        studentId: ALUNO_EF_ID,
        disciplinaId: disc.id,
        trimestre,
        trabalho: 2.5 - i * 0.5,
        teste: 2.5,
        prova: 4 + i * 0.5,
        lancadoPorId: DIRECAO_ID,
      })),
    });
  }

  await prisma.enquete.create({
    data: {
      titulo: "Pesquisa de satisfação (exemplo)",
      descricao: "Enquete fictícia. As respostas ficam só na escola de demonstração.",
      audience: "SCHOOL",
      prazo: new Date(`${somarDias(hoje, 10)}T23:00:00Z`),
      schoolId: ESCOLA_ID,
      criadoPorId: DIRECAO_ID,
      perguntas: {
        create: [
          { ordem: 1, tipo: "NOTA", texto: "Que nota você dá para a comunicação da escola?", opcoes: { max: 5 } },
          { ordem: 2, tipo: "SIM_NAO", texto: "Você indicaria a escola a outra família?" },
        ],
      },
    },
  });

  await prisma.conversation.create({
    data: {
      staffId: DIRECAO_ID,
      guardianId: FAMILIA_ID,
      messages: { create: [{ senderId: DIRECAO_ID, body: "Olá! Esta é uma conversa de exemplo da conta de demonstração. Ninguém recebe o que for escrito aqui." }] },
    },
  });

  console.log("Família de demonstração pronta na escola", ESCOLA_ID);
  console.log('Para entrar: tela de login > "Esqueci a senha" com o e-mail da conta demo. A senha não é mostrada aqui.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
