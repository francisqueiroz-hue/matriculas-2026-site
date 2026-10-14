import { TelaDeErro } from "@/components/TelaDeErro";

export default function NaoEncontrada() {
  return <TelaDeErro titulo="Página não encontrada" mensagem="O endereço não existe ou foi removido." />;
}
