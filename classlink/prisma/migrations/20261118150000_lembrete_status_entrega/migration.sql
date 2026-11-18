-- Situação de entrega do último lembrete pelo WhatsApp (enviado, entregue, lido ou falhou), para a
-- direção ver família por família. Migração apenas aditiva: colunas opcionais, nenhum dado muda.
ALTER TABLE "LembretePendencia" ADD COLUMN "ultimoEnvioStatus" TEXT;
ALTER TABLE "LembretePendencia" ADD COLUMN "ultimoEnvioStatusEm" TIMESTAMP(3);
ALTER TABLE "LembretePendencia" ADD COLUMN "ultimoEnvioFalha" TEXT;
