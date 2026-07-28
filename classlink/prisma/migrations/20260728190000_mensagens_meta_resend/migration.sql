-- DropIndex
DROP INDEX IF EXISTS "Conversation_chatwootConversationIdWpp_idx";

-- DropIndex
DROP INDEX IF EXISTS "Conversation_chatwootConversationIdMail_idx";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "chatwootContactId",
DROP COLUMN IF EXISTS "chatwootConversationIdWpp",
DROP COLUMN IF EXISTS "chatwootConversationIdMail";
