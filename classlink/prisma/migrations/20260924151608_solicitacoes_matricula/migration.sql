-- CreateEnum
CREATE TYPE "SolicitacaoMatriculaTipo" AS ENUM ('PRE_MATRICULA', 'REMATRICULA');

-- CreateEnum
CREATE TYPE "SolicitacaoMatriculaStatus" AS ENUM ('NOVA', 'EM_ATENDIMENTO', 'VISITA_AGENDADA', 'MATRICULADO', 'DESISTIU');

-- CreateEnum
CREATE TYPE "SolicitacaoMatriculaOrigem" AS ENUM ('SITE', 'CLASSLINK');

-- CreateTable
CREATE TABLE "SolicitacaoMatricula" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "tipo" "SolicitacaoMatriculaTipo" NOT NULL,
    "status" "SolicitacaoMatriculaStatus" NOT NULL DEFAULT 'NOVA',
    "origem" "SolicitacaoMatriculaOrigem" NOT NULL,
    "anoLetivo" INTEGER NOT NULL,
    "responsavelNome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "alunoNome" TEXT NOT NULL,
    "serie" TEXT,
    "periodoVisita" TEXT,
    "escolaAtual" TEXT,
    "observacoes" TEXT,
    "responsavelId" TEXT,
    "observacoesInternas" TEXT,
    "consentimentoEm" TIMESTAMP(3) NOT NULL,
    "ipOrigem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitacaoMatricula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolicitacaoMatricula_schoolId_anoLetivo_tipo_status_idx" ON "SolicitacaoMatricula"("schoolId", "anoLetivo", "tipo", "status");

-- CreateIndex
CREATE INDEX "SolicitacaoMatricula_ipOrigem_createdAt_idx" ON "SolicitacaoMatricula"("ipOrigem", "createdAt");

-- AddForeignKey
ALTER TABLE "SolicitacaoMatricula" ADD CONSTRAINT "SolicitacaoMatricula_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoMatricula" ADD CONSTRAINT "SolicitacaoMatricula_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
