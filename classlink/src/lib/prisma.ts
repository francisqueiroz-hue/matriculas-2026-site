import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * O driver `pg` hoje trata sslmode=require/prefer/verify-ca como verify-full (verifica o
 * certificado) e avisa que isso vai mudar na próxima versão, quando "require" deixará de
 * verificar. Fixar verify-full mantém a segurança atual e tira o aviso de cada requisição.
 */
export function urlComSslVerificado(url: string): string {
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/i, "$1verify-full");
}

function createClient() {
  const adapter = new PrismaPg(urlComSslVerificado(process.env.DATABASE_URL ?? ""));
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.prismaGlobal ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}
