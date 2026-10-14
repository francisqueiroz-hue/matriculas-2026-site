-- Enquetes (pesquisas de satisfação). Migração apenas aditiva: cria tabelas novas e não altera
-- nem apaga nenhum dado existente.

-- CreateTable
CREATE TABLE "Enquete" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "audience" "PostAudience" NOT NULL,
    "anonima" BOOLEAN NOT NULL DEFAULT true,
    "prazo" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "schoolId" TEXT NOT NULL,
    "classId" TEXT,
    "alunoId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enquete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquetePergunta" (
    "id" TEXT NOT NULL,
    "enqueteId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "opcoes" JSONB,

    CONSTRAINT "EnquetePergunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnqueteParticipacao" (
    "id" TEXT NOT NULL,
    "enqueteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "respondidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnqueteParticipacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnqueteEnvio" (
    "id" TEXT NOT NULL,
    "enqueteId" TEXT NOT NULL,
    "userId" TEXT,
    "respondidoEm" TIMESTAMP(3),

    CONSTRAINT "EnqueteEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnqueteItem" (
    "id" TEXT NOT NULL,
    "envioId" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "numero" INTEGER,
    "texto" TEXT,

    CONSTRAINT "EnqueteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Enquete_schoolId_idx" ON "Enquete"("schoolId");

-- CreateIndex
CREATE INDEX "Enquete_classId_idx" ON "Enquete"("classId");

-- CreateIndex
CREATE INDEX "Enquete_alunoId_idx" ON "Enquete"("alunoId");

-- CreateIndex
CREATE INDEX "EnquetePergunta_enqueteId_idx" ON "EnquetePergunta"("enqueteId");

-- CreateIndex
CREATE INDEX "EnqueteParticipacao_enqueteId_idx" ON "EnqueteParticipacao"("enqueteId");

-- CreateIndex
CREATE UNIQUE INDEX "EnqueteParticipacao_enqueteId_userId_key" ON "EnqueteParticipacao"("enqueteId", "userId");

-- CreateIndex
CREATE INDEX "EnqueteEnvio_enqueteId_idx" ON "EnqueteEnvio"("enqueteId");

-- CreateIndex
CREATE INDEX "EnqueteItem_envioId_idx" ON "EnqueteItem"("envioId");

-- CreateIndex
CREATE INDEX "EnqueteItem_perguntaId_idx" ON "EnqueteItem"("perguntaId");

-- AddForeignKey
ALTER TABLE "Enquete" ADD CONSTRAINT "Enquete_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquete" ADD CONSTRAINT "Enquete_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquete" ADD CONSTRAINT "Enquete_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquete" ADD CONSTRAINT "Enquete_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquetePergunta" ADD CONSTRAINT "EnquetePergunta_enqueteId_fkey" FOREIGN KEY ("enqueteId") REFERENCES "Enquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnqueteParticipacao" ADD CONSTRAINT "EnqueteParticipacao_enqueteId_fkey" FOREIGN KEY ("enqueteId") REFERENCES "Enquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnqueteParticipacao" ADD CONSTRAINT "EnqueteParticipacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnqueteEnvio" ADD CONSTRAINT "EnqueteEnvio_enqueteId_fkey" FOREIGN KEY ("enqueteId") REFERENCES "Enquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnqueteEnvio" ADD CONSTRAINT "EnqueteEnvio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnqueteItem" ADD CONSTRAINT "EnqueteItem_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "EnqueteEnvio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnqueteItem" ADD CONSTRAINT "EnqueteItem_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "EnquetePergunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
