-- Aviso único "estamos definindo as turmas" (aditivo: colunas e tabela novas, sem alterar dados).
-- Fica desligado (avisoTurmasAtivo = false) até a direção ligar em Gestão › Lembretes.
ALTER TABLE "School" ADD COLUMN "avisoTurmasAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "School" ADD COLUMN "avisoTurmasTitulo" TEXT;
ALTER TABLE "School" ADD COLUMN "avisoTurmasTexto" TEXT;

CREATE TABLE "AvisoTurmasEnvio" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "automatico" BOOLEAN NOT NULL,
    "chaveAutomatico" TEXT,
    "enviadoPorId" TEXT,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "canal" TEXT,
    "mensagemId" TEXT,
    "status" TEXT,
    "statusEm" TIMESTAMP(3),
    "falha" TEXT,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvisoTurmasEnvio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvisoTurmasEnvio_chaveAutomatico_key" ON "AvisoTurmasEnvio"("chaveAutomatico");
CREATE INDEX "AvisoTurmasEnvio_schoolId_responsavelId_idx" ON "AvisoTurmasEnvio"("schoolId", "responsavelId");
CREATE INDEX "AvisoTurmasEnvio_mensagemId_idx" ON "AvisoTurmasEnvio"("mensagemId");

ALTER TABLE "AvisoTurmasEnvio" ADD CONSTRAINT "AvisoTurmasEnvio_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvisoTurmasEnvio" ADD CONSTRAINT "AvisoTurmasEnvio_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvisoTurmasEnvio" ADD CONSTRAINT "AvisoTurmasEnvio_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
