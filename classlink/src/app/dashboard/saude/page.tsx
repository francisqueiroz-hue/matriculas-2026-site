"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { FichaSaudeEditor } from "@/components/FichaSaudeEditor";
import { BuscaAluno } from "@/components/BuscaAluno";
import { apiJson } from "@/lib/api-client";

interface ListaFamilia {
  papel: "FAMILIA";
  alunos: { id: string; name: string; turma: string | null }[];
}

export default function SaudePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Carregando...</p>}>
      <SaudeConteudo />
    </Suspense>
  );
}

/**
 * Saúde e pessoas autorizadas a buscar. Família: os próprios filhos. Direção e coordenação:
 * a ficha do aluno escolhido na busca (ou pelo aviso de alteração da família).
 */
function SaudeConteudo() {
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const alunoId = params.get("aluno");
  const [filhos, setFilhos] = useState<ListaFamilia["alunos"] | null>(null);
  const familia = user.role === "GUARDIAN";
  const escola = user.role === "ADMIN" || (user.role === "STAFF" && user.isCoordenacao);

  useEffect(() => {
    if (!familia) return;
    apiJson<ListaFamilia>("/api/saude")
      .then((d) => setFilhos(d.alunos))
      .catch(() => setFilhos([]));
  }, [familia]);

  const abrir = (id: string) => router.replace(`${pathname}?aluno=${id}`, { scroll: false });

  if (!familia && !escola) {
    return <p className="text-sm text-slate-500">Área restrita à direção, à coordenação e às famílias.</p>;
  }

  const selecionado = familia ? (alunoId ?? (filhos?.length === 1 ? filhos[0].id : null)) : alunoId;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Saúde e autorizados</h1>
        <p className="mt-1 text-sm text-slate-500">
          {familia
            ? "Alergias, medicamentos e cuidados de saúde, e quem pode buscar a criança na escola. Mantenha sempre atualizado."
            : "Ficha de saúde e pessoas autorizadas a buscar. Visível só para a direção, a coordenação e a família do aluno."}
        </p>
      </div>

      {escola && <BuscaAluno />}

      {familia && filhos && filhos.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Escolha o filho">
          {filhos.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === selecionado}
              onClick={() => abrir(f.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${f.id === selecionado ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"}`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
      {familia && filhos?.length === 0 && <p className="text-sm text-slate-500">Nenhum aluno vinculado a esta conta.</p>}

      {selecionado ? (
        <FichaSaudeEditor key={selecionado} alunoId={selecionado} />
      ) : (
        escola && <p className="text-sm text-slate-500">Busque o aluno acima e toque em &ldquo;Saúde e autorizados&rdquo;.</p>
      )}
    </div>
  );
}
