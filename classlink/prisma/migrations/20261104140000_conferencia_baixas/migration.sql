-- Conferência de boletos pagos. Migração apenas aditiva: colunas novas e nulas; nenhum
-- valor existente é alterado. Baixas antigas ficam com valorPago nulo (vale o valor do boleto).

-- AlterTable
ALTER TABLE "Boleto" ADD COLUMN "valorPago" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "BoletoBaixaLog" ADD COLUMN "valorPago" DECIMAL(10,2),
ADD COLUMN "valorAnterior" DECIMAL(10,2),
ADD COLUMN "valorPagoAnterior" DECIMAL(10,2),
ADD COLUMN "dataPagamentoAnterior" TIMESTAMP(3),
ADD COLUMN "motivo" TEXT;
