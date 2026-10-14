/** Executa as tarefas com no máximo `limite` em paralelo; nunca lança (erros viram `rejeitadas`). */
export async function executarComLimite(
  tarefas: ReadonlyArray<() => Promise<unknown>>,
  limite: number,
): Promise<{ concluidas: number; rejeitadas: number }> {
  let proxima = 0;
  let concluidas = 0;
  let rejeitadas = 0;
  const trabalhadores = Array.from({ length: Math.max(1, Math.min(limite, tarefas.length)) }, async () => {
    while (proxima < tarefas.length) {
      const tarefa = tarefas[proxima++];
      try {
        await tarefa();
        concluidas++;
      } catch {
        rejeitadas++;
      }
    }
  });
  await Promise.all(trabalhadores);
  return { concluidas, rejeitadas };
}
