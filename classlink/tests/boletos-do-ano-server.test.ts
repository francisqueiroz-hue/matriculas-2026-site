import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  school: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  guardianStudent: { findMany: vi.fn() },
  contrato: { findMany: vi.fn() },
  boleto: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
}));
const inter = vi.hoisted(() => ({ configurado: true, liberados: new Set<string>(["a1"]) }));
const emitir = vi.hoisted(() => vi.fn());
const destinos = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/escola-demonstracao", () => ({ escolaEhDemonstracao: async () => false }));
vi.mock("@/lib/banco-inter", () => ({
  isBancoInterConfigured: () => inter.configurado,
  alunoLiberadoNoInter: (id: string) => inter.liberados.has(id),
}));
vi.mock("@/lib/contratos-server", () => ({ destinosDosAlunos: destinos }));
vi.mock("@/lib/boleto-emissao", async () => ({
  camposFaltandoNoEndereco: (await vi.importActual<typeof import("@/lib/boleto-emissao")>("@/lib/boleto-emissao")).camposFaltandoNoEndereco,
  emitirBoletoNoInter: emitir,
}));

import { emitirBoletosDoAno, estadoBoletosDoAno } from "@/lib/boletos-do-ano-server";

const hoje = new Date(2026, 10, 27, 18, 0);
const endereco = { cep: "24000000", logradouro: "Rua A", numero: "1", bairro: "Centro", cidade: "Niterói", uf: "RJ" };
const condicoes = {
  parcelaBruta: 1500,
  parcelaLiquida: 1500,
  config: { parcelas: { quantidade: 12, vencimentoDia: 5, primeiroUltimo: "05/01/2027 a 05/12/2027", periodoAnuidade: "" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  inter.configurado = true;
  inter.liberados = new Set(["a1"]);
  prismaMock.school.findUnique.mockResolvedValue({ familiaEmiteBoletosAno: true });
  prismaMock.user.findUnique.mockResolvedValue({ cpf: "12345678909", enderecoCobranca: endereco, active: true });
  prismaMock.user.findUniqueOrThrow.mockResolvedValue({ name: "Resp", cpf: "12345678909", enderecoCobranca: endereco });
  prismaMock.guardianStudent.findMany.mockResolvedValue([{ student: { id: "a1", name: "Ana", bolsista: false } }]);
  prismaMock.contrato.findMany.mockResolvedValue([{ studentId: "a1", anoLetivo: 2027, condicoes }]);
  prismaMock.boleto.findMany.mockResolvedValue([]);
  prismaMock.boleto.findUnique.mockResolvedValue(null);
  prismaMock.boleto.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `b-${data.mesReferencia}`, codigoSolicitacao: null, ...data }));
  destinos.mockResolvedValue(new Map([["a1", { situacao: "UNICO", ids: ["g1"] }]]));
  emitir.mockResolvedValue({ ok: true });
});

describe("estadoBoletosDoAno", () => {
  it("opção desligada pela direção ou Inter sem configurar: nada aparece", async () => {
    prismaMock.school.findUnique.mockResolvedValue({ familiaEmiteBoletosAno: false });
    expect(await estadoBoletosDoAno("g1", "s1", hoje)).toEqual({ disponivel: false, alunos: [] });
    prismaMock.school.findUnique.mockResolvedValue({ familiaEmiteBoletosAno: true });
    inter.configurado = false;
    expect((await estadoBoletosDoAno("g1", "s1", hoje)).disponivel).toBe(false);
  });

  it("tudo certo: 12 meses de 2027 a emitir", async () => {
    const e = await estadoBoletosDoAno("g1", "s1", hoje);
    expect(e.alunos[0]).toMatchObject({ anoLetivo: 2027, parcela: 1500, bloqueio: null });
    expect(e.alunos[0].meses).toHaveLength(12);
  });

  it("fora da lista de piloto, não é o financeiro, sem CPF/endereço ou sem contrato assinado: bloqueado", async () => {
    inter.liberados = new Set();
    expect((await estadoBoletosDoAno("g1", "s1", hoje)).alunos[0].bloqueio).toMatch(/liberada/);
    inter.liberados = new Set(["a1"]);

    destinos.mockResolvedValue(new Map([["a1", { situacao: "FINANCEIRO", ids: ["outro"] }]]));
    expect((await estadoBoletosDoAno("g1", "s1", hoje)).alunos[0].bloqueio).toMatch(/responsável financeiro/);
    destinos.mockResolvedValue(new Map([["a1", { situacao: "UNICO", ids: ["g1"] }]]));

    prismaMock.user.findUnique.mockResolvedValue({ cpf: "12345678909", enderecoCobranca: { ...endereco, cidade: "null" }, active: true });
    expect((await estadoBoletosDoAno("g1", "s1", hoje)).alunos[0].bloqueio).toMatch(/CPF e endereço/);
    prismaMock.user.findUnique.mockResolvedValue({ cpf: "12345678909", enderecoCobranca: endereco, active: true });

    prismaMock.contrato.findMany.mockResolvedValue([]);
    expect((await estadoBoletosDoAno("g1", "s1", hoje)).alunos[0].bloqueio).toMatch(/não está assinado/);
  });
});

describe("emitirBoletosDoAno", () => {
  it("cria os 12 lançamentos para o responsável e emite cada um no Inter", async () => {
    const r = await emitirBoletosDoAno("g1", "s1", "a1", hoje);
    expect(r).toEqual({ emitidos: 12, erros: 0 });
    expect(prismaMock.boleto.create).toHaveBeenCalledTimes(12);
    const primeiro = prismaMock.boleto.create.mock.calls.map((c) => c[0].data).find((d) => d.mesReferencia === "2027-01");
    expect(primeiro).toMatchObject({ studentId: "a1", schoolId: "s1", valor: 1500, status: "PENDENTE", porResponsavelFinanceiro: true, destinatarioId: "g1" });
    expect((primeiro.vencimento as Date).getDate()).toBe(5);
    expect(emitir).toHaveBeenCalledTimes(12);
  });

  it("bloqueado: recusa sem criar nem emitir nada", async () => {
    inter.liberados = new Set();
    await expect(emitirBoletosDoAno("g1", "s1", "a1", hoje)).rejects.toThrow(/liberada/);
    prismaMock.school.findUnique.mockResolvedValue({ familiaEmiteBoletosAno: false });
    await expect(emitirBoletosDoAno("g1", "s1", "a1", hoje)).rejects.toThrow(/não está ligada/);
    await expect(emitirBoletosDoAno("g1", "s1", "outro-aluno", hoje)).rejects.toThrow();
    expect(prismaMock.boleto.create).not.toHaveBeenCalled();
    expect(emitir).not.toHaveBeenCalled();
  });

  it("mês criado ao mesmo tempo por outra requisição: reaproveita e não emite se já emitido", async () => {
    prismaMock.boleto.create.mockRejectedValue(new Error("P2002"));
    prismaMock.boleto.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "x", valor: "1500.00", codigoSolicitacao: "ja", mesReferencia: "2027-01", vencimento: new Date() });
    const r = await emitirBoletosDoAno("g1", "s1", "a1", hoje);
    expect(r.emitidos).toBe(0);
    expect(emitir).not.toHaveBeenCalled();
  });

  it("erro do Inter em um mês: conta e devolve o motivo", async () => {
    emitir.mockResolvedValueOnce({ ok: false, erro: "CPF inválido" });
    const r = await emitirBoletosDoAno("g1", "s1", "a1", hoje);
    expect(r).toEqual({ emitidos: 11, erros: 1, erro: "CPF inválido" });
  });
});
