-- Escola de demonstração (família fictícia para conferir as telas como família). Aditiva:
-- coluna com padrão false, então a escola real continua exatamente como está.
ALTER TABLE "School" ADD COLUMN "demonstracao" BOOLEAN NOT NULL DEFAULT false;
