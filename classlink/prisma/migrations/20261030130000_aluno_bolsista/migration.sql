-- Aluno isento de mensalidade (bolsista). Migração apenas aditiva: coluna nova com padrão
-- false; nenhum aluno é marcado automaticamente.

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "bolsista" BOOLEAN NOT NULL DEFAULT false;
