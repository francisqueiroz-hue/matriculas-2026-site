-- Visibilidade por perfil (tela Configurações da direção) e registro das mudanças.
-- Migração apenas aditiva: duas tabelas novas. Sem linhas, o app se comporta como antes.
CREATE TABLE "VisibilidadeArea" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "liberado" BOOLEAN NOT NULL,
    "atualizadoPorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisibilidadeArea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisibilidadeArea_schoolId_area_papel_key" ON "VisibilidadeArea"("schoolId", "area", "papel");

CREATE TABLE "VisibilidadeHistorico" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "liberado" BOOLEAN NOT NULL,
    "autorId" TEXT,
    "autorNome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisibilidadeHistorico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisibilidadeHistorico_schoolId_createdAt_idx" ON "VisibilidadeHistorico"("schoolId", "createdAt");
