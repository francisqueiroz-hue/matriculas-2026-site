-- Auditoria SOMENTE LEITURA do telefone (Fase 2). Rode no editor SQL do Neon, ramo "Produção".
-- Só SELECT: não altera nada. Mostra contagens e IDs, nunca os números.

-- 1) Quantos telefones existem e quantos estão fora do padrão 55 + DDD + número?
SELECT
  count(*) FILTER (WHERE "phone" IS NOT NULL)                                        AS com_telefone,
  count(*) FILTER (WHERE "phone" IS NOT NULL AND "phone" !~ '^55[0-9]{10,11}$')      AS fora_do_padrao
FROM "User"
WHERE "deletedAt" IS NULL;

-- 2) Telefones repetidos EXATOS (é o que o índice único recusaria). Esperado: 0 linhas.
SELECT count(*) AS usuarios_no_grupo, array_agg("id") AS ids
FROM "User"
WHERE "phone" IS NOT NULL
GROUP BY "phone"
HAVING count(*) > 1;

-- 3) Mesmo celular com e sem o nono dígito (o app já trata como o mesmo número). Esperado: 0 linhas.
WITH n AS (
  SELECT "id",
         CASE WHEN "phone" ~ '^55[0-9]{2}9[6-9][0-9]{7}$'
              THEN substr("phone", 1, 4) || substr("phone", 6)
              ELSE "phone" END AS chave
  FROM "User"
  WHERE "phone" IS NOT NULL AND "deletedAt" IS NULL
)
SELECT count(*) AS usuarios_no_grupo, array_agg("id") AS ids
FROM n
GROUP BY chave
HAVING count(*) > 1;
