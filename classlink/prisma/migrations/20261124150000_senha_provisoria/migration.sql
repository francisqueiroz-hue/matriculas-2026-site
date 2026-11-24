-- Aviso para trocar a senha provisória (aditivo: coluna com valor padrão).
ALTER TABLE "User" ADD COLUMN "senhaProvisoria" BOOLEAN NOT NULL DEFAULT false;
