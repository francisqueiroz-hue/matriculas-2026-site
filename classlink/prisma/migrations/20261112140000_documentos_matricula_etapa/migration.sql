-- Lista de documentos da matrícula/renovação: identidade do responsável e atestado médico.
-- Migração apenas aditiva: valores novos no enum; nenhum registro existente muda.
ALTER TYPE "MatriculaDocumentoTipo" ADD VALUE IF NOT EXISTS 'IDENTIDADE_RESPONSAVEL';
ALTER TYPE "MatriculaDocumentoTipo" ADD VALUE IF NOT EXISTS 'ATESTADO_MEDICO';
