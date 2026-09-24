-- CreateEnum
CREATE TYPE "FuncaoEquipe" AS ENUM ('DIRECAO', 'COORDENACAO', 'PROFESSOR', 'AUXILIAR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "funcao" "FuncaoEquipe";
