-- Vencimento das mensalidades sempre no dia 05 (decisão da direção em 30/10/2026). Ajuste de
-- dados: alunos com dia próprio de vencimento e o padrão da escola passam a 5. Boletos já
-- criados não são alterados (em 30/10/2026 nenhum dos alunos afetados tinha boleto em aberto).
-- Valores anteriores, para registro: 2 alunos no dia 10, 1 no dia 6 e 1 no dia 23.

UPDATE "Student" SET "diaVencimento" = 5 WHERE "diaVencimento" IS NOT NULL AND "diaVencimento" <> 5;
UPDATE "School" SET "diaVencimentoPadrao" = 5 WHERE "diaVencimentoPadrao" IS DISTINCT FROM 5;
