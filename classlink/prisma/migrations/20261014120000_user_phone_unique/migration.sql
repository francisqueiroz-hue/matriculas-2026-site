-- Telefone único por usuário (Fase 2). O login por telefone procura um só usuário.
--
-- Trava de segurança: se já houver telefone repetido, a migração PARA com uma mensagem clara
-- (o build da Vercel falha e a versão anterior continua no ar) em vez de falhar no meio do
-- CREATE UNIQUE INDEX. Não apaga nem altera nenhum dado.
DO $$
DECLARE
  repetidos integer;
BEGIN
  SELECT count(*) INTO repetidos FROM (
    SELECT "phone" FROM "User" WHERE "phone" IS NOT NULL GROUP BY "phone" HAVING count(*) > 1
  ) d;
  IF repetidos > 0 THEN
    RAISE EXCEPTION 'Migração interrompida: % telefone(s) repetido(s) em "User". Resolva as duplicatas antes (ver docs/fase2-telefone-indice-unico.md).', repetidos;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
