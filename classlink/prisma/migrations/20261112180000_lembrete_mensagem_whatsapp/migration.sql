-- Id da mensagem do WhatsApp do último lembrete: se a Meta avisar depois que a entrega falhou,
-- o envio gasto é devolvido. Migração apenas aditiva: coluna opcional e índice.
ALTER TABLE "LembretePendencia" ADD COLUMN "ultimoEnvioMensagemId" TEXT;
CREATE INDEX "LembretePendencia_ultimoEnvioMensagemId_idx" ON "LembretePendencia"("ultimoEnvioMensagemId");
