import { randomUUID } from "node:crypto";
import { ErroDeUsuario } from "@/lib/erros";
import { apagarDoBlob, inicioDoBlob } from "@/lib/blob-storage";
import { guardarArquivo } from "@/lib/firebase-storage";
import {
  ANEXO_LIMITE_ENVIO_SERVIDOR,
  ANEXO_MAX_BYTES,
  MENSAGEM_ANEXO_GRANDE,
  MENSAGEM_TIPO_NAO_ACEITO,
  caminhoAnexoValido,
  detectarTipoAnexo,
  nomeAnexoSeguro,
} from "@/lib/anexo-envio";

/** Anexo pronto para gravar na mensagem (colunas anexo* de Message). */
export interface AnexoRecebido {
  tipo: "document" | "image";
  mime: string;
  nome: string;
  caminho: string;
}

/**
 * Arquivo até 4 MB que veio junto com a mensagem: confere o conteúdo real e guarda no
 * armazenamento privado, numa pasta da conversa. Nunca fica público (LGPD): a leitura é só
 * por link assinado entregue a quem participa da conversa.
 */
export async function guardarAnexoDoFormulario(arquivo: File, escolaId: string, conversaId: string): Promise<AnexoRecebido> {
  if (arquivo.size === 0) throw new ErroDeUsuario("O arquivo está vazio.");
  // Acima disso o navegador deveria ter usado o envio direto; recusa antes de ler para a memória.
  if (arquivo.size > ANEXO_LIMITE_ENVIO_SERVIDOR) throw new ErroDeUsuario(MENSAGEM_ANEXO_GRANDE, 413);
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const real = detectarTipoAnexo(bytes);
  if (!real) throw new ErroDeUsuario(MENSAGEM_TIPO_NAO_ACEITO, 415);
  const caminho = `classlink/${escolaId}/mensagens/${conversaId}/${randomUUID()}.${real.extensao}`;
  await guardarArquivo(caminho, bytes, real.mime);
  return { tipo: real.tipo, mime: real.mime, nome: nomeAnexoSeguro(arquivo.name, real.extensao), caminho };
}

/**
 * Arquivo grande que o navegador já enviou direto ao Blob privado (ver rota …/anexo): confere
 * o caminho (desta escola e desta conversa), o tamanho e o conteúdo real. Se recusar, apaga.
 */
export async function conferirAnexoEnviadoDireto(
  caminho: string,
  nome: string | null | undefined,
  escolaId: string,
  conversaId: string,
): Promise<AnexoRecebido> {
  if (!caminhoAnexoValido(caminho, escolaId, conversaId)) throw new ErroDeUsuario("Caminho de arquivo inválido.", 400);
  const lido = await inicioDoBlob(caminho);
  if (!lido) throw new ErroDeUsuario("O arquivo não chegou ao armazenamento. Envie de novo.", 404);
  const real = detectarTipoAnexo(lido.inicio);
  const problema = !real || !caminho.endsWith(`.${real.extensao}`) ? MENSAGEM_TIPO_NAO_ACEITO : lido.tamanho > ANEXO_MAX_BYTES ? MENSAGEM_ANEXO_GRANDE : null;
  if (problema || !real) {
    await apagarDoBlob(caminho).catch(() => undefined);
    throw new ErroDeUsuario(problema ?? MENSAGEM_TIPO_NAO_ACEITO, 415);
  }
  return { tipo: real.tipo, mime: real.mime, nome: nomeAnexoSeguro(nome, real.extensao), caminho };
}
