-- Modelo do boletim impresso por escola (aditivo: só cria a tabela).
CREATE TABLE "BoletimModelo" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "editadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoletimModelo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoletimModelo_schoolId_key" ON "BoletimModelo"("schoolId");

ALTER TABLE "BoletimModelo" ADD CONSTRAINT "BoletimModelo_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
