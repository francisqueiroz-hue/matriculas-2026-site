-- Diagnóstico de notificações por aparelho. Migração apenas aditiva: colunas novas, opcionais
-- ou com padrão; nenhum token existente muda nem é apagado.
ALTER TABLE "PushToken" ADD COLUMN "aparelho" TEXT;
ALTER TABLE "PushToken" ADD COLUMN "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PushToken" ADD COLUMN "ultimoEnvioEm" TIMESTAMP(3);
ALTER TABLE "PushToken" ADD COLUMN "ultimoErro" TEXT;
