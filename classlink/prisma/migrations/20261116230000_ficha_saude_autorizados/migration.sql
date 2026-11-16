-- Ficha de saúde do aluno e pessoas autorizadas a buscar a criança.
-- Migração apenas aditiva: duas tabelas novas; nenhum dado existente muda.
CREATE TABLE "FichaSaude" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "alergias" TEXT,
    "medicamentos" TEXT,
    "condicoes" TEXT,
    "restricoesAlimentares" TEXT,
    "orientacoesEmergencia" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPorNome" TEXT,
    "pendenteConferenciaDesde" TIMESTAMP(3),
    "alteradoPelaFamiliaPor" TEXT,
    "conferidoEm" TIMESTAMP(3),
    "conferidoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FichaSaude_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PessoaAutorizada" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "parentesco" TEXT,
    "telefone" TEXT,
    "documento" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNome" TEXT NOT NULL,
    "removidoEm" TIMESTAMP(3),

    CONSTRAINT "PessoaAutorizada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FichaSaude_studentId_key" ON "FichaSaude"("studentId");
CREATE INDEX "FichaSaude_schoolId_pendenteConferenciaDesde_idx" ON "FichaSaude"("schoolId", "pendenteConferenciaDesde");
CREATE INDEX "PessoaAutorizada_studentId_removidoEm_idx" ON "PessoaAutorizada"("studentId", "removidoEm");
CREATE INDEX "PessoaAutorizada_schoolId_idx" ON "PessoaAutorizada"("schoolId");

ALTER TABLE "FichaSaude" ADD CONSTRAINT "FichaSaude_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FichaSaude" ADD CONSTRAINT "FichaSaude_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PessoaAutorizada" ADD CONSTRAINT "PessoaAutorizada_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PessoaAutorizada" ADD CONSTRAINT "PessoaAutorizada_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
