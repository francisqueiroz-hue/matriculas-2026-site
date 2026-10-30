-- Novo tipo de evento na trilha do contrato: a escola corrigiu as condições (ex.: vencimento
-- passou a ser sempre dia 05) antes da assinatura e o app gerou o PDF de novo. Migração apenas
-- aditiva: nenhum contrato é alterado aqui.

-- AlterEnum
ALTER TYPE "ContratoEventoTipo" ADD VALUE 'CONDICOES_ATUALIZADAS';
