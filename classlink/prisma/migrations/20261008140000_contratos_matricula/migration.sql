-- Contratos de matrícula (envio pela escola, assinatura gov.br ou à mão, conferência).
-- Migração somente aditiva: cria tipos e tabelas novos, não altera nem apaga nada existente.

-- CreateEnum
CREATE TYPE "ContratoStatus" AS ENUM ('AGUARDANDO_ASSINATURA', 'EM_CONFERENCIA', 'AGUARDANDO_ORIGINAL', 'COMPLETO', 'DEVOLVIDO');

-- CreateEnum
CREATE TYPE "ContratoMetodoAssinatura" AS ENUM ('GOVBR', 'MANUSCRITA');

-- CreateEnum
CREATE TYPE "ContratoArquivoTipo" AS ENUM ('MODELO', 'ASSINADO');

-- CreateEnum
CREATE TYPE "ContratoEventoTipo" AS ENUM ('CRIADO', 'ASSINADO_ENVIADO', 'DEVOLVIDO', 'CONFERIDO', 'ORIGINAL_RECEBIDO');

-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "anoLetivo" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" "ContratoStatus" NOT NULL DEFAULT 'AGUARDANDO_ASSINATURA',
    "metodoAssinatura" "ContratoMetodoAssinatura",
    "assinadoEnviadoEm" TIMESTAMP(3),
    "motivoDevolucao" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoArquivo" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tipo" "ContratoArquivoTipo" NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "enviadoPorId" TEXT,
    "ipOrigem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoEvento" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tipo" "ContratoEventoTipo" NOT NULL,
    "usuarioId" TEXT,
    "ipOrigem" TEXT,
    "arquivoSha256" TEXT,
    "detalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contrato_schoolId_anoLetivo_status_idx" ON "Contrato"("schoolId", "anoLetivo", "status");

-- CreateIndex
CREATE INDEX "Contrato_studentId_idx" ON "Contrato"("studentId");

-- CreateIndex
CREATE INDEX "ContratoArquivo_contratoId_tipo_idx" ON "ContratoArquivo"("contratoId", "tipo");

-- CreateIndex
CREATE INDEX "ContratoEvento_contratoId_idx" ON "ContratoEvento"("contratoId");

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoArquivo" ADD CONSTRAINT "ContratoArquivo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoArquivo" ADD CONSTRAINT "ContratoArquivo_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoEvento" ADD CONSTRAINT "ContratoEvento_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoEvento" ADD CONSTRAINT "ContratoEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
