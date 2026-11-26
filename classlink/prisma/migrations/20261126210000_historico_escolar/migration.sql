-- Histórico escolar: modelo por escola e dados por aluno (aditivo: só cria as tabelas).
CREATE TABLE "HistoricoModelo" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "editadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricoModelo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoricoEscolar" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "editadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricoEscolar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HistoricoModelo_schoolId_key" ON "HistoricoModelo"("schoolId");
CREATE UNIQUE INDEX "HistoricoEscolar_studentId_key" ON "HistoricoEscolar"("studentId");
CREATE INDEX "HistoricoEscolar_schoolId_idx" ON "HistoricoEscolar"("schoolId");

ALTER TABLE "HistoricoModelo" ADD CONSTRAINT "HistoricoModelo_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoricoEscolar" ADD CONSTRAINT "HistoricoEscolar_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoricoEscolar" ADD CONSTRAINT "HistoricoEscolar_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
