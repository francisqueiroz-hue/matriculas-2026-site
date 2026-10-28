-- Anexo (foto, documento, áudio, vídeo) de mensagens recebidas pelo WhatsApp. Migração
-- apenas aditiva: colunas novas e opcionais; nenhum dado existente é alterado ou apagado.

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "anexoTipo" TEXT,
ADD COLUMN "anexoMime" TEXT,
ADD COLUMN "anexoNome" TEXT,
ADD COLUMN "anexoCaminho" TEXT,
ADD COLUMN "anexoMediaId" TEXT;
