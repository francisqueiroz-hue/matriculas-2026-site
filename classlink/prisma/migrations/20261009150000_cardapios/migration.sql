-- CreateEnum
CREATE TYPE "StatusCardapio" AS ENUM ('AGENDADO', 'PUBLICADO');

-- CreateTable
CREATE TABLE "Cardapio" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT,
    "semanaInicio" DATE NOT NULL,
    "conteudo" JSONB NOT NULL,
    "observacoes" TEXT,
    "imagemPath" TEXT,
    "status" "StatusCardapio" NOT NULL DEFAULT 'AGENDADO',
    "publicadoEm" TIMESTAMP(3),
    "postId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cardapio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cardapio_postId_key" ON "Cardapio"("postId");

-- CreateIndex
CREATE INDEX "Cardapio_schoolId_semanaInicio_idx" ON "Cardapio"("schoolId", "semanaInicio");

-- CreateIndex
CREATE INDEX "Cardapio_status_semanaInicio_idx" ON "Cardapio"("status", "semanaInicio");

-- AddForeignKey
ALTER TABLE "Cardapio" ADD CONSTRAINT "Cardapio_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cardapio" ADD CONSTRAINT "Cardapio_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cardapio" ADD CONSTRAINT "Cardapio_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cardapio" ADD CONSTRAINT "Cardapio_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

