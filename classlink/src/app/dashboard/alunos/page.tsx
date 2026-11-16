"use client";

import { BuscaAluno } from "@/components/BuscaAluno";
import { CoordenacaoGuard } from "@/components/CoordenacaoGuard";

/**
 * Consulta rápida de aluno para a coordenação (a direção tem a mesma busca no alto da tela
 * Alunos). Só consulta: cadastro, edição e financeiro continuam na área da direção.
 */
export default function ConsultaAlunosPage() {
  return (
    <CoordenacaoGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Alunos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Digite parte do nome do aluno, do responsável, a turma ou o telefone. O resultado aparece na hora.
          </p>
        </div>
        <BuscaAluno autoFocus />
      </div>
    </CoordenacaoGuard>
  );
}
