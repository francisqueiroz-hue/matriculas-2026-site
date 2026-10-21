-- Violações de CSP (Report-Only) agrupadas, para revisar o histórico sem depender dos logs da Vercel
-- (plano Hobby guarda 1 hora). Migração apenas aditiva: cria uma tabela nova, sem tocar em dados existentes.

-- CreateTable
CREATE TABLE "CspViolacao" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "diretiva" TEXT NOT NULL,
    "bloqueado" TEXT NOT NULL,
    "pagina" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 1,
    "primeiraVez" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaVez" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CspViolacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CspViolacao_chave_key" ON "CspViolacao"("chave");

-- CreateIndex
CREATE INDEX "CspViolacao_ultimaVez_idx" ON "CspViolacao"("ultimaVez");
