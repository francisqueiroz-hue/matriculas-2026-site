import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg(process.env.DATABASE_URL ?? "");
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "classlink123";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const school = await prisma.school.upsert({
    where: { id: "seed-school" },
    update: {},
    create: { id: "seed-school", name: "Escola Modelo ClassLink" },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@classlink.demo" },
    update: {},
    create: {
      email: "admin@classlink.demo",
      name: "Ana Diretora",
      role: "ADMIN",
      passwordHash,
      schoolId: school.id,
    },
  });

  const turmaA = await prisma.class.upsert({
    where: { id: "seed-class-a" },
    update: {},
    create: { id: "seed-class-a", name: "3º Ano A", year: 2026, schoolId: school.id },
  });
  const turmaB = await prisma.class.upsert({
    where: { id: "seed-class-b" },
    update: {},
    create: { id: "seed-class-b", name: "4º Ano B", year: 2026, schoolId: school.id },
  });

  const professora = await prisma.user.upsert({
    where: { email: "professora@classlink.demo" },
    update: {},
    create: {
      email: "professora@classlink.demo",
      name: "Bruna Professora",
      role: "STAFF",
      passwordHash,
      schoolId: school.id,
      classesTeaching: { create: [{ classId: turmaA.id }] },
    },
  });

  const responsavel = await prisma.user.upsert({
    where: { email: "responsavel@classlink.demo" },
    update: {},
    create: {
      email: "responsavel@classlink.demo",
      name: "Carlos Responsável",
      role: "GUARDIAN",
      passwordHash,
      schoolId: school.id,
    },
  });

  const aluno = await prisma.student.upsert({
    where: { id: "seed-student-1" },
    update: {},
    create: {
      id: "seed-student-1",
      name: "Davi Silva",
      classId: turmaA.id,
      schoolId: school.id,
      birthDate: new Date("2018-05-10"),
    },
  });

  await prisma.guardianStudent.upsert({
    where: { guardianId_studentId: { guardianId: responsavel.id, studentId: aluno.id } },
    update: {},
    create: { guardianId: responsavel.id, studentId: aluno.id, relation: "pai" },
  });

  await prisma.post.upsert({
    where: { id: "seed-post-1" },
    update: {},
    create: {
      id: "seed-post-1",
      title: "Bem-vindos ao ClassLink!",
      body: "Este é o mural de avisos da escola. Fique de olho nos comunicados da turma do seu filho(a).",
      audience: "SCHOOL",
      schoolId: school.id,
      authorId: admin.id,
    },
  });

  await prisma.post.upsert({
    where: { id: "seed-post-2" },
    update: {},
    create: {
      id: "seed-post-2",
      title: "Reunião de pais na sexta-feira",
      body: "Não esqueçam a reunião de pais e mestres às 19h no auditório.",
      audience: "CLASS",
      classId: turmaA.id,
      schoolId: school.id,
      authorId: professora.id,
    },
  });

  await prisma.event.upsert({
    where: { id: "seed-event-1" },
    update: {},
    create: {
      id: "seed-event-1",
      title: "Reunião de pais — 3º Ano A",
      description: "Reunião trimestral com os responsáveis.",
      startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      classId: turmaA.id,
      schoolId: school.id,
      authorId: professora.id,
    },
  });

  await prisma.comunicado.upsert({
    where: { id: "seed-comunicado-1" },
    update: {},
    create: {
      id: "seed-comunicado-1",
      tipo: "AUTORIZACAO_PASSEIO",
      titulo: "Autorização — Passeio ao museu",
      descricao: "Solicitamos autorização para o passeio da turma ao museu de ciências no dia 15.",
      audience: "CLASS",
      classId: turmaA.id,
      prazoResposta: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      schoolId: school.id,
      criadoPorId: professora.id,
    },
  });

  const NOMES_DISCIPLINAS = [
    "L. Portuguesa",
    "Matemática",
    "Ciências",
    "Geografia",
    "História",
    "Inglês",
    "Ed. Física",
    "Ed. Ambiental",
    "Artes",
    "Orient. Educ",
  ];
  for (const nome of NOMES_DISCIPLINAS) {
    await prisma.disciplina.upsert({
      where: { schoolId_nome: { schoolId: school.id, nome } },
      update: {},
      create: { nome, schoolId: school.id },
    });
  }

  // Configuração de mensalidade (Módulo Financeiro) — o boleto em si só é emitido
  // quando as credenciais do Banco Inter estiverem configuradas em produção.
  await prisma.student.update({ where: { id: aluno.id }, data: { mensalidadeValor: 450 } });
  await prisma.school.update({
    where: { id: school.id },
    data: { diaVencimentoPadrao: 10, diaEmissaoBoletos: 1 },
  });

  console.log("Seed concluído.");
  console.log(`Turmas: ${turmaA.name}, ${turmaB.name}`);
  console.log("Login de demonstração (senha para todos: classlink123):");
  console.log("  admin@classlink.demo (Administrador)");
  console.log("  professora@classlink.demo (Professor/Funcionário)");
  console.log("  responsavel@classlink.demo (Responsável)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
