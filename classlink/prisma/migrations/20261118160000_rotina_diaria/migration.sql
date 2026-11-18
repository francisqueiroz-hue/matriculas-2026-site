-- Rotina diária da criança (alimentação, sono, evacuação, banho, medicação e observações).
-- Migração apenas aditiva: uma tabela nova; nenhum dado existente muda.
CREATE TABLE "RotinaDiaria" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "colacao" TEXT,
    "almoco" TEXT,
    "lanche" TEXT,
    "janta" TEXT,
    "sono" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evacuacao" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "banho" BOOLEAN,
    "medicacoes" JSONB NOT NULL DEFAULT '[]',
    "observacoes" TEXT,
    "preenchidoPorNome" TEXT NOT NULL,
    "familiaAvisadaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RotinaDiaria_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RotinaDiaria_studentId_data_key" ON "RotinaDiaria"("studentId", "data");
CREATE INDEX "RotinaDiaria_schoolId_data_idx" ON "RotinaDiaria"("schoolId", "data");

ALTER TABLE "RotinaDiaria" ADD CONSTRAINT "RotinaDiaria_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RotinaDiaria" ADD CONSTRAINT "RotinaDiaria_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
