-- Registro das entregas de WhatsApp recusadas pela Meta (webhook de status "failed").
-- Migração apenas aditiva: tabela nova.
CREATE TABLE "WhatsappFalha" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "schoolId" TEXT,
    "userId" TEXT,
    "telefone" TEXT NOT NULL,
    "codigo" INTEGER,
    "titulo" TEXT,
    "detalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappFalha_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappFalha_mensagemId_key" ON "WhatsappFalha"("mensagemId");
CREATE INDEX "WhatsappFalha_schoolId_createdAt_idx" ON "WhatsappFalha"("schoolId", "createdAt");
