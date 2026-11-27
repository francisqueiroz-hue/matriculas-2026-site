-- Família emite sozinha os boletos do ano no Banco Inter. Aditiva: coluna com padrão false,
-- então nada muda até a direção ligar a opção.
ALTER TABLE "School" ADD COLUMN "familiaEmiteBoletosAno" BOOLEAN NOT NULL DEFAULT false;
