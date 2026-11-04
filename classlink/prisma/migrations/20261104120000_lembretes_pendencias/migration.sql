-- Lembretes automáticos de pendências às famílias. Migração apenas aditiva: tipo e tabela
-- novos e colunas de configuração na escola, com o envio DESLIGADO por padrão
-- (lembretesAtivos = false). Nada é enviado até a direção ativar no painel.

-- CreateEnum
CREATE TYPE "LembreteTipo" AS ENUM ('CONTRATO', 'COMUNICADO', 'BOLETO', 'REMATRICULA');

-- AlterTable
ALTER TABLE "School" ADD COLUMN "lembretesAtivos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lembretesTipos" "LembreteTipo"[] DEFAULT ARRAY['CONTRATO', 'COMUNICADO', 'BOLETO', 'REMATRICULA']::"LembreteTipo"[],
ADD COLUMN "lembretesDiasInicio" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "lembretesIntervaloDias" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "lembretesMaxEnvios" INTEGER NOT NULL DEFAULT 4;

-- CreateTable
CREATE TABLE "LembretePendencia" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "tipo" "LembreteTipo" NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "pendenteDesde" TIMESTAMP(3) NOT NULL,
    "envios" INTEGER NOT NULL DEFAULT 0,
    "ultimoEnvioEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LembretePendencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LembretePendencia_tipo_referenciaId_responsavelId_key" ON "LembretePendencia"("tipo", "referenciaId", "responsavelId");

-- CreateIndex
CREATE INDEX "LembretePendencia_schoolId_resolvidoEm_idx" ON "LembretePendencia"("schoolId", "resolvidoEm");

-- CreateIndex
CREATE INDEX "LembretePendencia_responsavelId_idx" ON "LembretePendencia"("responsavelId");

-- AddForeignKey
ALTER TABLE "LembretePendencia" ADD CONSTRAINT "LembretePendencia_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LembretePendencia" ADD CONSTRAINT "LembretePendencia_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
