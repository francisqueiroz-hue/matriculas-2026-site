-- CreateEnum
CREATE TYPE "Trimestre" AS ENUM ('PRIMEIRO', 'SEGUNDO', 'TERCEIRO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isCoordenacao" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Disciplina" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "Disciplina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "trimestre" "Trimestre" NOT NULL,
    "trabalho" DECIMAL(4,2),
    "teste" DECIMAL(4,2),
    "prova" DECIMAL(4,2),
    "lancadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Disciplina_schoolId_idx" ON "Disciplina"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Disciplina_schoolId_nome_key" ON "Disciplina"("schoolId", "nome");

-- CreateIndex
CREATE INDEX "Nota_studentId_idx" ON "Nota"("studentId");

-- CreateIndex
CREATE INDEX "Nota_disciplinaId_idx" ON "Nota"("disciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "Nota_studentId_disciplinaId_trimestre_key" ON "Nota"("studentId", "disciplinaId", "trimestre");

-- AddForeignKey
ALTER TABLE "Disciplina" ADD CONSTRAINT "Disciplina_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "Disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_lancadoPorId_fkey" FOREIGN KEY ("lancadoPorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
