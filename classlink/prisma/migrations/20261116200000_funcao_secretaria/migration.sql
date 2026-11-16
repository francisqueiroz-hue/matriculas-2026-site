-- Nova função de equipe: Secretaria. Mesmo perfil de administração da escola (cadastro de
-- alunos, turmas, acessos, matrículas, comunicados), mas sem financeiro, mensalidades, baixas,
-- contratos e lembretes de cobrança, que ficam só com a Direção.
-- Migração apenas aditiva: um valor novo no enum; nenhum cadastro muda de função aqui.
ALTER TYPE "FuncaoEquipe" ADD VALUE IF NOT EXISTS 'SECRETARIA';
