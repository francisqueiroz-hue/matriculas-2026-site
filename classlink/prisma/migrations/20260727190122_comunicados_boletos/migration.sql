-- CreateEnum
CREATE TYPE "ComunicadoTipo" AS ENUM ('AUTORIZACAO_PASSEIO', 'CONFIRMACAO_REUNIAO', 'CIRCULAR');

-- CreateEnum
CREATE TYPE "RespostaTipo" AS ENUM ('AUTORIZADO', 'NAO_AUTORIZADO', 'CONFIRMADO', 'NAO_COMPARECERA', 'LIDO', 'PENDENTE_EXPIRADO');

-- CreateEnum
CREATE TYPE "BoletoStatus" AS ENUM ('PENDENTE', 'PAGO', 'VENCIDO', 'ERRO');

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "diaEmissaoBoletos" INTEGER,
ADD COLUMN     "diaVencimentoPadrao" INTEGER;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "diaVencimento" INTEGER,
ADD COLUMN     "mensalidadeValor" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "enderecoCobranca" JSONB;

-- CreateTable
CREATE TABLE "Comunicado" (
    "id" TEXT NOT NULL,
    "tipo" "ComunicadoTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "audience" "PostAudience" NOT NULL,
    "prazoResposta" TIMESTAMP(3),
    "schoolId" TEXT NOT NULL,
    "classId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaComunicado" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "resposta" "RespostaTipo" NOT NULL,
    "dataHoraResposta" TIMESTAMP(3) NOT NULL,
    "ipOrigem" TEXT,

    CONSTRAINT "RespostaComunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaComunicadoLog" (
    "id" TEXT NOT NULL,
    "respostaComunicadoId" TEXT NOT NULL,
    "respostaAnterior" "RespostaTipo" NOT NULL,
    "dataHoraRespostaAnterior" TIMESTAMP(3) NOT NULL,
    "ipOrigemAnterior" TEXT,
    "substituidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespostaComunicadoLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boleto" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "mesReferencia" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "BoletoStatus" NOT NULL DEFAULT 'PENDENTE',
    "codigoSolicitacao" TEXT,
    "nossoNumero" TEXT,
    "linhaDigitavel" TEXT,
    "pixCopiaCola" TEXT,
    "erroDetalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pagoEm" TIMESTAMP(3),

    CONSTRAINT "Boleto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comunicado_schoolId_idx" ON "Comunicado"("schoolId");

-- CreateIndex
CREATE INDEX "Comunicado_classId_idx" ON "Comunicado"("classId");

-- CreateIndex
CREATE INDEX "RespostaComunicado_comunicadoId_idx" ON "RespostaComunicado"("comunicadoId");

-- CreateIndex
CREATE INDEX "RespostaComunicado_responsavelId_idx" ON "RespostaComunicado"("responsavelId");

-- CreateIndex
CREATE UNIQUE INDEX "RespostaComunicado_comunicadoId_responsavelId_alunoId_key" ON "RespostaComunicado"("comunicadoId", "responsavelId", "alunoId");

-- CreateIndex
CREATE INDEX "RespostaComunicadoLog_respostaComunicadoId_idx" ON "RespostaComunicadoLog"("respostaComunicadoId");

-- CreateIndex
CREATE UNIQUE INDEX "Boleto_codigoSolicitacao_key" ON "Boleto"("codigoSolicitacao");

-- CreateIndex
CREATE INDEX "Boleto_schoolId_idx" ON "Boleto"("schoolId");

-- CreateIndex
CREATE INDEX "Boleto_status_idx" ON "Boleto"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Boleto_studentId_mesReferencia_key" ON "Boleto"("studentId", "mesReferencia");

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaComunicado" ADD CONSTRAINT "RespostaComunicado_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaComunicado" ADD CONSTRAINT "RespostaComunicado_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaComunicado" ADD CONSTRAINT "RespostaComunicado_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaComunicadoLog" ADD CONSTRAINT "RespostaComunicadoLog_respostaComunicadoId_fkey" FOREIGN KEY ("respostaComunicadoId") REFERENCES "RespostaComunicado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
