-- Permite responsável sem e-mail (login por telefone). Índice único é preservado;
-- Postgres não considera múltiplos NULLs como duplicados, então isso não quebra
-- nenhum dado existente.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
