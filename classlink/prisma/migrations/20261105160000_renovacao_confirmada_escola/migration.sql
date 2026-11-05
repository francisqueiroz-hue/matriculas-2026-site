-- Renovação confirmada pela direção quando o contrato foi assinado fora do app. Migração apenas
-- aditiva: novo valor no enum e coluna com padrão false; nenhum contrato existente muda.

-- AlterEnum
ALTER TYPE "ContratoEventoTipo" ADD VALUE 'RENOVACAO_CONFIRMADA';

-- AlterTable
ALTER TABLE "Contrato" ADD COLUMN "confirmadoPelaEscola" BOOLEAN NOT NULL DEFAULT false;
