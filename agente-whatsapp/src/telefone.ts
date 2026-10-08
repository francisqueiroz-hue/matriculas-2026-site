/** Telefones brasileiros — mesma regra do ClassLink (lib/whatsapp.ts), sem depender dele. */

export function normalizarTelefone(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return null;
}

/** A Meta costuma informar o número sem o nono dígito; o cadastro costuma tê-lo. */
export function variantesTelefone(telefone: string): string[] {
  const n = normalizarTelefone(telefone);
  if (!n) return [];
  if (n.length === 13 && n[4] === "9" && /[6-9]/.test(n[5])) return [n, n.slice(0, 4) + n.slice(5)];
  if (n.length === 12 && /[6-9]/.test(n[4])) return [n, n.slice(0, 4) + "9" + n.slice(4)];
  return [n];
}

export function mesmoTelefone(a: string, b: string): boolean {
  const va = variantesTelefone(a);
  return variantesTelefone(b).some((v) => va.includes(v));
}

/** Forma canônica (com nono dígito) usada como chave de memória e conversa. */
export function chaveTelefone(telefone: string): string {
  const v = variantesTelefone(telefone);
  return v.find((x) => x.length === 13) ?? v[0] ?? telefone;
}
