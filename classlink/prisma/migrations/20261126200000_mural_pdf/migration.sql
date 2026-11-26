-- Mural: PDF convertido em imagens (uma por página). Migração aditiva, sem tocar nos avisos existentes.
ALTER TABLE "Post" ADD COLUMN "mediaPaginas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Post" ADD COLUMN "mediaNome" TEXT;
