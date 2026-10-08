import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";
import { carregarConfig } from "@/lib/contrato-modelo/servidor";
import { gerarContrato2027 } from "@/lib/contrato-modelo/gerar";
import { MODELO_CONTRATO_2027, type ConfigContrato, type DadosFamilia, type PeriodoChave } from "@/lib/contrato-modelo/tipos";

const EXEMPLO = "(exemplo)";

/** Campos da escola ainda em branco aparecem como linha para a direção ver o que falta. */
function comLacunas(cfg: ConfigContrato): ConfigContrato {
  const escola = Object.fromEntries(Object.entries(cfg.escola).map(([k, v]) => [k, v.trim() || "__________"])) as ConfigContrato["escola"];
  return {
    ...cfg,
    escola,
    parcelas: {
      ...cfg.parcelas,
      primeiroUltimo: cfg.parcelas.primeiroUltimo || "__________",
      periodoAnuidade: cfg.parcelas.periodoAnuidade || "__________",
    },
    horaExcedente: {
      ...cfg.horaExcedente,
      unidade: cfg.horaExcedente.unidade || "______",
      fracionamento: cfg.horaExcedente.fracionamento || "______",
      tolerancia: cfg.horaExcedente.tolerancia || "______",
    },
  };
}

/**
 * Prévia do contrato com a configuração atual e dados fictícios da família — para a direção
 * conferir valores e layout antes de enviar. Não grava nada.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const params = request.nextUrl.searchParams;
    const anoLetivo = Number(params.get("ano")) || CAMPANHA_REMATRICULA.ano;
    const periodo = (params.get("periodo") as PeriodoChave) || "INTEGRAL";
    const { config } = await carregarConfig(session.schoolId, anoLetivo);
    const cfg = comLacunas(config);
    const p = cfg.periodos.find((x) => x.chave === periodo) ?? cfg.periodos[0];

    const pessoa = {
      nome: `Nome do Responsável ${EXEMPLO}`,
      cpf: "52998224725",
      nascimento: "01/01/1985",
      rg: "00.000.000-0",
      orgao: "DETRAN",
      uf: "RJ",
      endereco: `Rua de Exemplo ${EXEMPLO}`,
      numero: "100",
      complemento: "",
      cep: "24.358-000",
      bairro: "Camboinhas",
      cidade: "Niterói",
      email: "responsavel@exemplo.com",
      telefone: "(21) 90000-0000",
    };
    const familia: DadosFamilia = {
      financeiro: pessoa,
      pedagogicoMesmo: true,
      pedagogico: null,
      aluno: { nascimento: "01/01/2021", rg: "", orgao: "", uf: "", enderecoMesmo: true, endereco: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "" },
      responsavelLegal: { quem: "FINANCEIRO", nome: pessoa.nome, cpf: pessoa.cpf, vinculo: "mãe", contato: pessoa.telefone },
      imagem: ["NAO_AUTORIZO", "NAO_AUTORIZO", "NAO_AUTORIZO", "NAO_AUTORIZO", "NAO_AUTORIZO", "NAO_AUTORIZO"],
    };

    const pdf = await gerarContrato2027({
      condicoes: {
        modelo: MODELO_CONTRATO_2027,
        anoLetivo,
        etapa: "EI",
        turma: `Turma ${EXEMPLO}`,
        periodo: p.chave,
        parcelaBruta: p.parcelaBruta,
        parcelaLiquida: p.parcelaLiquida,
        config: cfg,
      },
      familia,
      aluno: { nome: `Nome do Aluno ${EXEMPLO}` },
      data: new Date(),
    });
    return new NextResponse(new Blob([Uint8Array.from(pdf)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="previa-contrato-${anoLetivo}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
