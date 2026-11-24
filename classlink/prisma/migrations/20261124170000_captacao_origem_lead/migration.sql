-- Captação: origem do lead, indicação, campanha e momento do 1º retorno (aditivo: só colunas opcionais).
-- Sem preenchimento retroativo: o tempo até o 1º retorno passa a ser medido a partir de agora.
ALTER TABLE "SolicitacaoMatricula" ADD COLUMN "comoConheceu" TEXT;
ALTER TABLE "SolicitacaoMatricula" ADD COLUMN "indicadoPor" TEXT;
ALTER TABLE "SolicitacaoMatricula" ADD COLUMN "campanha" TEXT;
ALTER TABLE "SolicitacaoMatricula" ADD COLUMN "primeiroContatoEm" TIMESTAMP(3);
