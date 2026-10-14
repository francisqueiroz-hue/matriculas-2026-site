-- Limite de tentativas de login. Migração apenas aditiva: cria uma tabela nova e não altera
-- nem apaga nenhum dado existente. A chave é um HMAC do identificador (sem e-mail/telefone em texto).

-- CreateTable
CREATE TABLE "LoginTentativa" (
    "chave" TEXT NOT NULL,
    "falhas" INTEGER NOT NULL,
    "primeiraFalhaEm" TIMESTAMP(3) NOT NULL,
    "bloqueadoAte" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginTentativa_pkey" PRIMARY KEY ("chave")
);
