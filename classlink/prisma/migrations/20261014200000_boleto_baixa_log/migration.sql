-- Trilha de auditoria da baixa manual de boleto. Migração apenas aditiva: cria uma tabela nova e
-- não altera nem apaga nenhum dado existente.

-- CreateTable
CREATE TABLE "BoletoBaixaLog" (
    "id" TEXT NOT NULL,
    "boletoId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "statusAnterior" "BoletoStatus" NOT NULL,
    "statusNovo" "BoletoStatus" NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "valor" DECIMAL(10,2) NOT NULL,
    "porUserId" TEXT NOT NULL,
    "porNome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoletoBaixaLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoletoBaixaLog_boletoId_idx" ON "BoletoBaixaLog"("boletoId");

-- CreateIndex
CREATE INDEX "BoletoBaixaLog_schoolId_criadoEm_idx" ON "BoletoBaixaLog"("schoolId", "criadoEm");

-- AddForeignKey
ALTER TABLE "BoletoBaixaLog" ADD CONSTRAINT "BoletoBaixaLog_boletoId_fkey" FOREIGN KEY ("boletoId") REFERENCES "Boleto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
