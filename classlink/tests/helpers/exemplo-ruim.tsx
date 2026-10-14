// Exemplo propositalmente ruim, só para provar que o auditor funciona. Não é importado pelo app.
export function Ruim() {
  return (
    <form>
      <input type="text" />
      <select />
      <button>Enviar</button>
      <label htmlFor="ok">Ok</label>
      <input id="ok" />
      <label>
        Dentro <input />
      </label>
    </form>
  );
}
