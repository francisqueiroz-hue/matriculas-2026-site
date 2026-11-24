-- Responsável financeiro do aluno (aditivo: colunas novas, sem alterar dados existentes).
-- Enquanto a direção não indicar, aluno com um só responsável segue como hoje.
ALTER TABLE "GuardianStudent" ADD COLUMN "responsavelFinanceiro" BOOLEAN NOT NULL DEFAULT false;

-- Contratos e boletos criados a partir de agora guardam o destinatário (responsável financeiro).
-- Os já existentes ficam com porResponsavelFinanceiro = false e seguem a regra anterior.
ALTER TABLE "Contrato" ADD COLUMN "porResponsavelFinanceiro" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contrato" ADD COLUMN "destinatarioId" TEXT;
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Boleto" ADD COLUMN "porResponsavelFinanceiro" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Boleto" ADD COLUMN "destinatarioId" TEXT;
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
