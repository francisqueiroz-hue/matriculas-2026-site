-- Histórico de alterações de cadastro (quem alterou, quando, valor anterior e novo). Migração
-- apenas aditiva: cria uma tabela nova e não altera nem apaga nenhum dado existente.

-- CreateTable
CREATE TABLE "AlteracaoCadastro" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNovo" TEXT,
    "porUserId" TEXT NOT NULL,
    "porNome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlteracaoCadastro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlteracaoCadastro_schoolId_entidade_entidadeId_criadoEm_idx" ON "AlteracaoCadastro"("schoolId", "entidade", "entidadeId", "criadoEm");
