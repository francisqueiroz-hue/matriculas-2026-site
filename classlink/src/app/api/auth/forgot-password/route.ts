import { NextRequest, NextResponse, after } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { resolveLoginIdentifier, type LoginIdentifier } from "@/lib/login-identifier";
import { hashPassword } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validators";
import { enviarAcessoPeloApp } from "@/lib/envio-acesso";
import { isEmailConfigured, sendPlainEmail } from "@/lib/email";
import { chaveIp, chaveTentativa, mensagemBloqueio, POLITICA_ESQUECI_CONTA, POLITICA_ESQUECI_IP } from "@/lib/limite-login";
import { contarTentativaSemFalhar } from "@/lib/limite-tentativas";
import { ipDaRequisicao } from "@/lib/ip-requisicao";
import { origemPublica } from "@/lib/push";

const MENSAGEM_PADRAO =
  "Se encontrarmos uma conta com esse e-mail ou telefone, enviamos uma nova senha por WhatsApp ou e-mail.";

/**
 * Recuperação de senha sem intervenção do admin: gera uma nova senha temporária e
 * entrega por um canal que a pessoa já controla (WhatsApp ou e-mail cadastrado).
 * Resposta é sempre a mesma genérica, para não revelar se a conta existe (evita
 * enumeração de usuários). Só troca a senha salva se a entrega realmente funcionar —
 * senão a pessoa ficaria travada com uma senha nova que nunca recebeu.
 *
 * Proteções contra abuso: cada pedido troca a senha de alguém, derruba as sessões dela e
 * dispara mensagem paga, então há limite por IP e por conta (contados exista a conta ou não,
 * para o limite também não revelar nada). O trabalho de verdade roda depois da resposta,
 * para o tempo de resposta não distinguir conta existente de inexistente.
 */
export async function POST(request: NextRequest) {
  try {
    const body = forgotPasswordSchema.parse(await request.json());
    const identifier = resolveLoginIdentifier(body.identifier);
    if (!identifier) return NextResponse.json({ ok: true, message: MENSAGEM_PADRAO });

    const segredo = process.env.JWT_ACCESS_SECRET ?? "";
    const bloqueio = (segundos: number) =>
      NextResponse.json(
        { error: mensagemBloqueio(segundos) },
        { status: 429, headers: { "Retry-After": String(segundos) } },
      );

    const ip = ipDaRequisicao(request.headers);
    if (ip) {
      const porIp = await contarTentativaSemFalhar(chaveIp("esqueci", ip, segredo), POLITICA_ESQUECI_IP);
      if (porIp.bloqueado) return bloqueio(porIp.segundos);
    }
    const porConta = await contarTentativaSemFalhar(chaveTentativa("esqueci", identifier, segredo), POLITICA_ESQUECI_CONTA);
    if (porConta.bloqueado) return bloqueio(porConta.segundos);

    // Endereço público configurado; o Host da requisição só entra se não houver um configurado.
    const origem = origemPublica() ?? request.nextUrl.origin;
    after(async () => {
      try {
        await redefinirEEnviar(identifier, origem);
      } catch (err) {
        console.error("forgot-password: falha ao redefinir e enviar", err);
      }
    });

    return NextResponse.json({ ok: true, message: MENSAGEM_PADRAO });
  } catch (error) {
    return handleApiError(error);
  }
}

async function redefinirEEnviar(identifier: LoginIdentifier, origem: string) {
  const user =
    identifier.type === "email"
      ? await prisma.user.findUnique({ where: { email: identifier.value } })
      : await prisma.user.findFirst({ where: { phone: identifier.value } });
  if (!user || !user.active || user.deletedAt) return;

  const temporaryPassword = randomBytes(6).toString("hex");
  const mensagem = `Sua nova senha temporária do ClassLink é: ${temporaryPassword}\n\nUse-a para entrar e, se quiser, troque por uma de sua preferência em Conta > Trocar senha.`;

  // WhatsApp da escola, pelo próprio ClassLink: senha direto se a conversa estiver
  // aberta (ou com modelo de acesso); senão, convite com o botão ACESSO. Nesse caminho a
  // senha só é trocada quando a entrega é aceita — nunca fica uma senha que não chegou.
  if (user.phone) {
    const envio = await enviarAcessoPeloApp(user.id, origem);
    if (envio.enviado) return;
  }

  let entregue = false;
  if (user.email && isEmailConfigured()) {
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
