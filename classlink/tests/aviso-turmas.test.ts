import { describe, expect, it } from "vitest";
import {
  avaliarAvisoTurmas,
  LIMITE_TEXTO_AVISO_TURMAS,
  LIMITE_TITULO_AVISO_TURMAS,
  listaAlunos,
  mensagemAvisoTurmas,
  modeloAvisoTurmas,
  preencherModelo,
  TEXTO_PADRAO_AVISO_TURMAS,
  TITULO_PADRAO_AVISO_TURMAS,
} from "@/lib/aviso-turmas";
import type { PendenciaAvaliada } from "@/lib/lembretes";
import { configAvisoTurmasSchema, envioAvisoTurmasSchema } from "@/lib/validators";

const QUINTA = new Date("2026-11-26T15:00:00Z");
const dias = (n: number) => new Date(QUINTA.getTime() - n * 86_400_000);

function pend(p: Partial<PendenciaAvaliada>): PendenciaAvaliada {
  return {
    tipo: "CONTRATO",
    referenciaId: "c1",
    responsavelId: "mae",
    desde: dias(20),
    aluno: "Ana Souza",
    descricao: "assinar o contrato",
    url: "/dashboard/contratos",
    pendenteDesde: dias(20),
    diasPendente: 20,
    envios: 4,
    ultimoEnvioEm: dias(5),
    situacao: "LIMITE_ATINGIDO",
    proximoEm: null,
    ...p,
  };
}
const config = { intervaloDias: 3 };
const vazio = new Set<string>();

describe("avaliarAvisoTurmas", () => {
  it("contrato no limite e família sem lembrete recente: sai o aviso", () => {
    const [f] = avaliarAvisoTurmas([pend({})], new Map([["mae", dias(5)]]), vazio, vazio, config, QUINTA);
    expect(f).toMatchObject({ responsavelId: "mae", alunos: ["Ana Souza"], situacao: "PRONTO", url: "/dashboard/contratos" });
  });

  it("contrato não assinado ainda nos lembretes: aparece na lista, mas o automático espera o limite", () => {
    const [f] = avaliarAvisoTurmas([pend({ situacao: "AGUARDANDO_INTERVALO", envios: 2 })], new Map(), vazio, vazio, config, QUINTA);
    expect(f).toMatchObject({ situacao: "EM_LEMBRETES", envios: 2, alunos: ["Ana Souza"] });
  });

  it("mensalidade e autorização no limite ficam de fora (não são matrícula)", () => {
    const lista = [pend({ tipo: "BOLETO" }), pend({ tipo: "COMUNICADO", responsavelId: "pai" })];
    expect(avaliarAvisoTurmas(lista, new Map(), vazio, vazio, config, QUINTA)).toEqual([]);
  });

  it("base são os contratos não assinados: rematrícula sem contrato fica de fora", () => {
    expect(avaliarAvisoTurmas([pend({ tipo: "REMATRICULA", referenciaId: "2027:a1" })], new Map(), vazio, vazio, config, QUINTA)).toEqual([]);
  });

  it("família com um contrato no limite e outro ainda nos lembretes: o aviso cita só o do limite", () => {
    const lista = [pend({}), pend({ referenciaId: "c2", aluno: "Pedro Souza", situacao: "AGUARDANDO_INTERVALO", envios: 1 })];
    const [f] = avaliarAvisoTurmas(lista, new Map(), vazio, vazio, config, QUINTA);
    expect(f).toMatchObject({ situacao: "PRONTO", alunos: ["Ana Souza"], envios: 4 });
  });

  it("família que já recebeu não recebe de novo", () => {
    const [f] = avaliarAvisoTurmas([pend({})], new Map(), new Set(["mae"]), vazio, config, QUINTA);
    expect(f.situacao).toBe("ENVIADO");
  });

  it("4º lembrete saiu ontem: espera o intervalo da família", () => {
    const [f] = avaliarAvisoTurmas([pend({ ultimoEnvioEm: dias(1) })], new Map([["mae", dias(1)]]), vazio, vazio, config, QUINTA);
    expect(f.situacao).toBe("AGUARDANDO_INTERVALO");
    expect(f.proximoEm?.toISOString().slice(0, 10)).toBe("2026-11-28");
  });

  it("família que recebe outro lembrete hoje não recebe o aviso no mesmo dia", () => {
    const [f] = avaliarAvisoTurmas([pend({})], new Map([["mae", dias(5)]]), vazio, new Set(["mae"]), config, QUINTA);
    expect(f.situacao).toBe("AGUARDANDO_INTERVALO");
  });

  it("dois alunos da mesma família: um aviso só, com os dois nomes", () => {
    const lista = [pend({}), pend({ referenciaId: "c2", aluno: "Pedro Souza" })];
    const familias = avaliarAvisoTurmas(lista, new Map(), vazio, vazio, config, QUINTA);
    expect(familias).toHaveLength(1);
    expect(familias[0].alunos).toEqual(["Ana Souza", "Pedro Souza"]);
  });
});

describe("texto do aviso", () => {
  it("sem texto salvo usa o padrão; texto salvo prevalece", () => {
    expect(modeloAvisoTurmas({ titulo: null, texto: "  " })).toEqual({ titulo: TITULO_PADRAO_AVISO_TURMAS, texto: TEXTO_PADRAO_AVISO_TURMAS });
    expect(modeloAvisoTurmas({ titulo: "Turmas", texto: "Olá {alunos}" })).toEqual({ titulo: "Turmas", texto: "Olá {alunos}" });
  });

  it("troca {alunos} e {ano} pelo primeiro nome e o ano", () => {
    expect(preencherModelo("Vaga de {alunos} em {ANO}", { alunos: ["Ana Souza", "Pedro Lima", "Ana Souza"], ano: 2027 })).toBe("Vaga de Ana e Pedro em 2027");
    expect(listaAlunos(["Ana", "Pedro", "Luiza"])).toBe("Ana, Pedro e Luiza");
    expect(listaAlunos([])).toBe("seu(sua) filho(a)");
  });

  it("texto padrão: acolhedor, sem data de turma e cabe no WhatsApp com nomes", () => {
    const m = mensagemAvisoTurmas(modeloAvisoTurmas({ titulo: null, texto: null }), { alunos: ["Ana Clara", "Pedro"], ano: 2027, url: "/dashboard" });
    expect(m.titulo).toBe("Organização das turmas de 2027");
    expect(m.texto).toContain("definindo as turmas");
    expect(m.texto).toContain("Ana e Pedro");
    expect(m.texto).not.toMatch(/\d{1,2}\/\d{1,2}/); // nenhuma data prometida
    expect(m.texto).not.toMatch(/R\$/);
    expect(TEXTO_PADRAO_AVISO_TURMAS.length).toBeLessThanOrEqual(LIMITE_TEXTO_AVISO_TURMAS);
    expect(m.texto.length).toBeLessThanOrEqual(300);
  });

  it("validação da tela segue os mesmos limites e vazio volta ao padrão", () => {
    expect(configAvisoTurmasSchema.parse({ ativo: true, titulo: " ", texto: null })).toEqual({ ativo: true, titulo: null, texto: null });
    expect(() => configAvisoTurmasSchema.parse({ ativo: true, titulo: "x".repeat(LIMITE_TITULO_AVISO_TURMAS + 1), texto: null })).toThrow();
    expect(() => configAvisoTurmasSchema.parse({ ativo: true, titulo: null, texto: "x".repeat(LIMITE_TEXTO_AVISO_TURMAS + 1) })).toThrow();
    expect(envioAvisoTurmasSchema.parse({ responsavelId: "mae" })).toEqual({ responsavelId: "mae" });
    // Reenvio da mensagem recebida: com os nomes, pode passar de 280 e precisa ser aceita.
    const recebida = preencherModelo(TEXTO_PADRAO_AVISO_TURMAS, { alunos: ["Alexandre", "Guilherme", "Valentina", "Beatriz"], ano: 2027 });
    expect(recebida.length).toBeGreaterThan(LIMITE_TEXTO_AVISO_TURMAS);
    expect(envioAvisoTurmasSchema.parse({ responsavelId: "mae", texto: recebida }).texto).toBe(recebida);
  });
});
