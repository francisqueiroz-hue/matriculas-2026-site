-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('APP', 'WHATSAPP', 'EMAIL');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'APP',
ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId");

-- CreateIndex
CREATE INDEX "Message_externalId_idx" ON "Message"("externalId");

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "chatwootContactId" INTEGER,
ADD COLUMN     "chatwootConversationIdWpp" INTEGER,
ADD COLUMN     "chatwootConversationIdMail" INTEGER;

-- CreateIndex
CREATE INDEX "Conversation_chatwootConversationIdWpp_idx" ON "Conversation"("chatwootConversationIdWpp");

-- CreateIndex
CREATE INDEX "Conversation_chatwootConversationIdMail_idx" ON "Conversation"("chatwootConversationIdMail");
