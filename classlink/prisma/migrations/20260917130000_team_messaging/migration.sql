-- CreateTable
CREATE TABLE "TeamConversation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamConversation_schoolId_idx" ON "TeamConversation"("schoolId");

-- CreateIndex
CREATE INDEX "TeamConversation_userAId_idx" ON "TeamConversation"("userAId");

-- CreateIndex
CREATE INDEX "TeamConversation_userBId_idx" ON "TeamConversation"("userBId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamConversation_userAId_userBId_key" ON "TeamConversation"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "TeamMessage_conversationId_idx" ON "TeamMessage"("conversationId");

-- AddForeignKey
ALTER TABLE "TeamConversation" ADD CONSTRAINT "TeamConversation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamConversation" ADD CONSTRAINT "TeamConversation_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamConversation" ADD CONSTRAINT "TeamConversation_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "TeamConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
