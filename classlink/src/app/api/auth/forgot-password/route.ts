import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { resolveLoginIdentifier } from "@/lib/login-identifier";
import { hashPassword } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validators";
import { enviarAcessoPeloApp } from "@/lib/envio-acesso";
import { isEmailConfigured, sendPlainEmail } from "@/lib/email";

const MENSAGEM_PADRAO =
  "Se encontrarmos uma conta com esse e-mail ou telefone, enviamos uma nova senha por WhatsApp ou e-mail.";

/**
 * Recuperação de senha sem intervenção do admin: gera uma nova senha temporária e
 * entrega por um canal que a pessoa já controla (WhatsApp ou e-mail cadastrado).
 * Resposta é sempre a mesma genérica, para não revelar se a conta existe (evita
 * enumeração de usuários). Só troca a senha salva se a entrega realmente funcionar —
 * senão a pessoa ficaria travada com uma senha nova que nunca recebeu.
 */
export async function POST(request: NextRequest) {
  try {
    const body = forgotPasswordSchema.parse(await request.json());
    const identifier = resolveLoginIdentifier(body.identifier);

    if (identifier) {
      const user =
        identifier.type === "email"
          ? await prisma.user.findUnique({ where: { email: identifier.value } })
          : await prisma.user.findFirst({ where: { phone: identifier.value } });

      if (user && user.active && !user.deletedAt) {
        const temporaryPassword = randomBytes(6).toString("hex");
        const mensagem = `Sua nova senha temporária do ClassLink é: ${temporaryPassword}\n\nUse-a para entrar e, se quiser, troque por uma de sua preferência em Conta > Trocar senha.`;

        let entregue = false;
        // WhatsApp da escola, pelo próprio ClassLink: senha direto se a conversa estiver
        // aberta (ou com modelo de acesso); senão, convite com o botão ACESSO. Nesse caminho a
        // senha só é trocada quando a entrega é aceita — nunca fica uma senha que não chegou.
        if (user.phone) {
          const envio = await enviarAcessoPeloApp(user.id, request.nextUrl.origin);
          if (envio.enviado) {
            return NextResponse.json({ ok: true, message: MENSAGEM_PADRAO });
          }
        }
        if (!entregue && user.email && isEmailConfigured()) {
          try {
            await sendPlainEmail({ to: user.email, subject: "Nova senha do ClassLink", text: mensagem });
            entregue = true;
          } catch (err) {
            console.error("Falha ao enviar nova senha por e-mail", err);
          }
        }

        if (entregue) {
          await prisma.$transaction([
            prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(temporaryPassword) } }),
            prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
          ]);
        }
      }
    }

    return NextResponse.json({ ok: true, message: MENSAGEM_PADRAO });
  } catch (error) {
    return handleApiError(error);
  }
}
