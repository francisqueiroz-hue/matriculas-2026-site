-- Última entrega confirmada pela Meta: tira o aviso "WhatsApp bloqueado por cobrança" assim que
-- o WhatsApp volta a entregar. Migração apenas aditiva: uma coluna opcional, nenhum dado muda.
ALTER TABLE "School" ADD COLUMN "whatsappEntregueEm" TIMESTAMP(3);
