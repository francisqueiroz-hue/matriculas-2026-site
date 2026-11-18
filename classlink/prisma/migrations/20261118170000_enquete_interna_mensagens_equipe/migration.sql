-- Enquetes internas (para a equipe) e mensagens da gestão para toda a equipe.
-- Migração apenas aditiva: uma coluna nova com padrão (as enquetes existentes continuam sendo
-- das famílias) e três tabelas novas; nenhum dado existente muda.
ALTER TABLE "Enquete" ADD COLUMN "interna" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Enquete_schoolId_interna_idx" ON "Enquete"("schoolId", "interna");

CREATE TABLE "MensagemEquipe" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaAtividadeEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemEquipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MensagemEquipeResposta" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemEquipeResposta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MensagemEquipeLeitura" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lidaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MensagemEquipeLeitura_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MensagemEquipe_schoolId_ultimaAtividadeEm_idx" ON "MensagemEquipe"("schoolId", "ultimaAtividadeEm");
CREATE INDEX "MensagemEquipeResposta_mensagemId_createdAt_idx" ON "MensagemEquipeResposta"("mensagemId", "createdAt");
CREATE UNIQUE INDEX "MensagemEquipeLeitura_mensagemId_userId_key" ON "MensagemEquipeLeitura"("mensagemId", "userId");
CREATE INDEX "MensagemEquipeLeitura_userId_idx" ON "MensagemEquipeLeitura"("userId");

ALTER TABLE "MensagemEquipe" ADD CONSTRAINT "MensagemEquipe_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MensagemEquipe" ADD CONSTRAINT "MensagemEquipe_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MensagemEquipeResposta" ADD CONSTRAINT "MensagemEquipeResposta_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "MensagemEquipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MensagemEquipeResposta" ADD CONSTRAINT "MensagemEquipeResposta_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MensagemEquipeLeitura" ADD CONSTRAINT "MensagemEquipeLeitura_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "MensagemEquipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MensagemEquipeLeitura" ADD CONSTRAINT "MensagemEquipeLeitura_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
