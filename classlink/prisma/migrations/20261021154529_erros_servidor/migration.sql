-- CreateTable
CREATE TABLE "ErroServidor" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 1,
    "primeiraVez" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaVez" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErroServidor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErroServidor_chave_key" ON "ErroServidor"("chave");

-- CreateIndex
CREATE INDEX "ErroServidor_ultimaVez_idx" ON "ErroServidor"("ultimaVez");
