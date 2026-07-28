-- AlterEnum
ALTER TYPE "PostAudience" ADD VALUE 'STUDENT';

-- AlterTable
ALTER TABLE "Comunicado" ADD COLUMN     "alunoId" TEXT;

-- CreateIndex
CREATE INDEX "Comunicado_alunoId_idx" ON "Comunicado"("alunoId");

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
