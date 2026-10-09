-- CreateEnum
CREATE TYPE "PapelVinculoWhatsApp" AS ENUM ('AVISO', 'RESPOSTA');

-- CreateEnum
CREATE TYPE "TipoConversaWhatsApp" AS ENUM ('FAMILIA', 'EQUIPE');

-- CreateTable
CREATE TABLE "WhatsAppVinculoConversa" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "papel" "PapelVinculoWhatsApp" NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoConversaWhatsApp" NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppVinculoConversa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppVinculoConversa_externalId_key" ON "WhatsAppVinculoConversa"("externalId");

-- CreateIndex
CREATE INDEX "WhatsAppVinculoConversa_userId_papel_createdAt_idx" ON "WhatsAppVinculoConversa"("userId", "papel", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsAppVinculoConversa" ADD CONSTRAINT "WhatsAppVinculoConversa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

