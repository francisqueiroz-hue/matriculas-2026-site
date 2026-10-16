-- CreateEnum
CREATE TYPE "MatriculaDocumentoTipo" AS ENUM ('CERTIDAO_NASCIMENTO', 'CPF', 'VACINACAO', 'COMPROVANTE_RESIDENCIA', 'HISTORICO_ESCOLAR', 'LAUDO');

-- CreateEnum
CREATE TYPE "ConsentimentoFinalidade" AS ENUM ('DADOS_DA_CRIANCA', 'USO_DE_IMAGEM', 'DADO_DE_SAUDE');

-- CreateTable
CREATE TABLE "MatriculaDocumento" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "anoLetivo" INTEGER NOT NULL,
    "tipo" "MatriculaDocumentoTipo" NOT NULL,
    "recebido" BOOLEAN NOT NULL DEFAULT false,
    "recebidoEm" TIMESTAMP(3),
    "prazo" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatriculaDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentimentoLgpd" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "finalidade" "ConsentimentoFinalidade" NOT NULL,
    "versaoTexto" TEXT NOT NULL,
    "consentidoPorId" TEXT,
    "consentidoPorNome" TEXT NOT NULL,
    "consentidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentimentoLgpd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatriculaDocumento_schoolId_anoLetivo_recebido_idx" ON "MatriculaDocumento"("schoolId", "anoLetivo", "recebido");

-- CreateIndex
CREATE UNIQUE INDEX "MatriculaDocumento_studentId_anoLetivo_tipo_key" ON "MatriculaDocumento"("studentId", "anoLetivo", "tipo");

-- CreateIndex
CREATE INDEX "ConsentimentoLgpd_studentId_finalidade_idx" ON "ConsentimentoLgpd"("studentId", "finalidade");

-- CreateIndex
CREATE INDEX "ConsentimentoLgpd_schoolId_idx" ON "ConsentimentoLgpd"("schoolId");

-- AddForeignKey
ALTER TABLE "MatriculaDocumento" ADD CONSTRAINT "MatriculaDocumento_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatriculaDocumento" ADD CONSTRAINT "MatriculaDocumento_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentimentoLgpd" ADD CONSTRAINT "ConsentimentoLgpd_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentimentoLgpd" ADD CONSTRAINT "ConsentimentoLgpd_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentimentoLgpd" ADD CONSTRAINT "ConsentimentoLgpd_consentidoPorId_fkey" FOREIGN KEY ("consentidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
