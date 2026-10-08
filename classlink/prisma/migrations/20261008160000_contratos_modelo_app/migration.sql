-- Contrato gerado pelo app a partir do modelo 2027: configuração por ano letivo, condições
-- fixadas no envio e dados que a família opcionalmente preenche. Migração somente aditiva.
-- (ALTER TYPE ... ADD VALUE é permitido dentro da transação no PostgreSQL 12+, desde que o
-- valor novo não seja usado na mesma transação — esta migração não o usa.)

-- AlterEnum
ALTER TYPE "ContratoEventoTipo" ADD VALUE 'DADOS_PREENCHIDOS' BEFORE 'ASSINADO_ENVIADO';

-- AlterTable
ALTER TABLE "Contrato" ADD COLUMN     "condicoes" JSONB,
ADD COLUMN     "dadosFamilia" JSONB,
ADD COLUMN     "modelo" TEXT;

-- CreateTable
CREATE TABLE "ContratoConfig" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "anoLetivo" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,
    "editadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContratoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContratoConfig_schoolId_anoLetivo_key" ON "ContratoConfig"("schoolId", "anoLetivo");

-- AddForeignKey
ALTER TABLE "ContratoConfig" ADD CONSTRAINT "ContratoConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoConfig" ADD CONSTRAINT "ContratoConfig_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
