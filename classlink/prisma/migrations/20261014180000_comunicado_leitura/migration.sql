-- Abertura de comunicados pelo responsável. Migração apenas aditiva: cria uma tabela nova e não
-- altera nem apaga nenhum dado existente.

-- CreateTable
CREATE TABLE "ComunicadoLeitura" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComunicadoLeitura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComunicadoLeitura_comunicadoId_idx" ON "ComunicadoLeitura"("comunicadoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComunicadoLeitura_comunicadoId_userId_key" ON "ComunicadoLeitura"("comunicadoId", "userId");

-- AddForeignKey
ALTER TABLE "ComunicadoLeitura" ADD CONSTRAINT "ComunicadoLeitura_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComunicadoLeitura" ADD CONSTRAINT "ComunicadoLeitura_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
