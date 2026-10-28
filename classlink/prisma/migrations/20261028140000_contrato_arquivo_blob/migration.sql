-- Contrato assinado acima de 4 MB: o PDF passa a poder ficar no Vercel Blob privado
-- (coluna nova "blobPath") em vez do banco. Migração apenas aditiva/relaxante: nenhum dado
-- existente é alterado ou apagado; os arquivos atuais continuam em "conteudo".

-- AlterTable
ALTER TABLE "ContratoArquivo" ALTER COLUMN "conteudo" DROP NOT NULL,
ADD COLUMN "blobPath" TEXT;
