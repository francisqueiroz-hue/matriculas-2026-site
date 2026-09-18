import { normalizePhoneBR } from "@/lib/whatsapp";

export type LoginIdentifier = { type: "email"; value: string } | { type: "phone"; value: string };

/**
 * Decide se o identificador de login digitado é um e-mail ou um telefone, e o
 * normaliza. Existe porque nem todo responsável tem e-mail (nesse caso, o
 * cadastro é feito só com telefone) — permitir login por telefone evita depender
 * de e-mail para dar acesso a essas famílias. Retorna null se não for nem um
 * e-mail nem um telefone brasileiro válido.
 */
export function resolveLoginIdentifier(raw: string): LoginIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes("@")) {
    return { type: "email", value: trimmed.toLowerCase() };
  }

  const phone = normalizePhoneBR(trimmed);
  if (!phone) return null;
  return { type: "phone", value: phone };
}
