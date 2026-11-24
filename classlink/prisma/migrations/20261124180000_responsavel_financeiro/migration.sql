-- Responsável financeiro do aluno (aditivo: coluna nova com padrão false, sem preencher dados).
-- Enquanto a direção não indicar, aluno com um só responsável segue como hoje.
ALTER TABLE "GuardianStudent" ADD COLUMN "responsavelFinanceiro" BOOLEAN NOT NULL DEFAULT false;
