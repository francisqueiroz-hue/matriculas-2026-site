-- Família do refresh token (uma por aparelho/login): reuso suspeito e logout passam a encerrar só
-- a sessão daquele aparelho, sem derrubar os outros. Migração apenas aditiva: coluna opcional e
-- índice; nenhum dado muda (tokens antigos ficam com familia nula).
ALTER TABLE "RefreshToken" ADD COLUMN "familia" TEXT;
CREATE INDEX "RefreshToken_familia_idx" ON "RefreshToken"("familia");
