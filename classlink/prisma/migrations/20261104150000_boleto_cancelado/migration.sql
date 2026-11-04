-- Boleto cancelado pela escola (ex.: cobrança em duplicidade). Migração apenas aditiva:
-- novo valor no enum; nenhum boleto existente muda de status.

-- AlterEnum
ALTER TYPE "BoletoStatus" ADD VALUE 'CANCELADO';
