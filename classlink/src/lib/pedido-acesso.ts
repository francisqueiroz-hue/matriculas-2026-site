import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp";
import { mensagemAcesso } from "@/lib/acesso";

/**
 * Responde, no próprio WhatsApp, a uma família que pediu o acesso ("ACESSO"/"SENHA").
 * Como a mensagem acabou de chegar, a janela de 24h está aberta e o texto livre é
 * entregue. A senha só é trocada depois que o envio da resposta deu certo — senão a
 * pessoa ficaria com uma senha nova que nunca recebeu.
 */
export async function responderPedidoDeAcesso(
  responsavel: { id: string; name: string; phone: string | null },
  telefone: string,
  urlGuia: string,
): Promise<void> {
  const usuario = await prisma.user.findUnique({
    where: { id: responsavel.id },
    select: { active: true, deletedAt: true },
  });
  if (!usuario?.active || usuario.deletedAt) {
    await sendWhatsAppTextMessage(
      telefone,
      "Olá! Não encontramos um acesso ativo ao ClassLink para este número. Por favor, fale com a secretaria da escola.",
    );
    return;
  }

  const senha = randomBytes(6).toString("hex");
  await sendWhatsAppTextMessage(
    telefone,
    // Login pelo telefone cadastrado (o do webhook pode vir sem o nono dígito).
    mensagemAcesso({ nome: responsavel.name, url: urlGuia, login: responsavel.phone ?? telefone, senha }),
  );

  await prisma.$transaction([
    prisma.user.update({ where: { id: responsavel.id }, data: { passwordHash: await hashPassword(senha) } }),
    prisma.refreshToken.updateMany({ where: { userId: responsavel.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

/** Número que pediu acesso não está cadastrado como responsável. */
export async function responderNumeroNaoCadastrado(telefone: string): Promise<void> {
  await sendWhatsAppTextMessage(
    telefone,
    "Olá! Não encontramos um cadastro no ClassLink com este número de WhatsApp. Por favor, fale com a secretaria da escola para conferir o telefone cadastrado.",
  );
}
