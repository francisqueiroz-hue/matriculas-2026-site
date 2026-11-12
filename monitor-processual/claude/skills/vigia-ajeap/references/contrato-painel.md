# Contrato dos documentos do painel (coleção `processos`)

**Id novo:** `cnj_<20 dígitos do número CNJ>` (gravar de novo sobrescreve; não duplica). Documentos antigos têm ids `p1`, `p_AAAAMMDDx` etc. — não os renomeie sem autorização.

**Campos base:** `numero, tribunal, autor, reu, tipo, origem ("Automático"|"E-mail"|"Manual"), ajuizamento, faseProvavel, ultimaMovData (AAAA-MM-DD), ultimaMovResumo, urgente, urgenteDescricao, dadosParciais, ajeap`
**Opcionais:** `nomeLocal, sincronizadoEm, datajud {ultimoAndamento, ultimaVerificacao, situacao, fonte}, eventos [{data "DD/MM/AAAA", texto}], linkConsulta, observacaoDataJud, prazo`
**Escritos por esta skill:** `ajeapAtualizadoEm, ajeapGatilho [..], ajeapHistorico [{em, gatilhos, resumo}], minutas [..]`
**Não escreva** `version` dentro do documento (colide com o metadado do banco).

## Bloco `ajeap`
```json
{
  "resumoCaso": "2-3 linhas",
  "perguntasNecessarias": ["só se faltar informação essencial"],
  "baseLegal": ["lei/artigo aplicável"],
  "pontosFortes": ["..."],
  "pontosFracos": ["..."],
  "cenarios": {"favoravel": "...", "provavel": "...", "desfavoravel": "..."},
  "cenariosNota": "faixa de probabilidade e por quê (Alta >70%, Média 40-70%, Baixa <40%)",
  "vetorTemporal": "postergar ou acelerar, e por quê",
  "estrategiaRecomendada": "...",
  "planoAcao": [{"passo": "...", "prazo": "..."}],
  "fontes": ["norma/julgado, com onde foi verificado"],
  "ressalvaProfissional": "análise consultiva; exige validação por advogado(a) com registro ativo na OAB"
}
```
Informação insuficiente: só `resumoCaso`, `perguntasNecessarias` e `ressalvaProfissional` (sem cenários).

## Bloco `prazo` (vem do monitor)
`dataDisponibilizacao, dataPublicacao, dataInicio, dataLimite, dias, tipoContagem, capital, recessoAplicado, avisos[], calendario, calculadoEm`. O prazo é **calculado**: confira os `avisos` (tribunal sem calendário cadastrado, dia com ressalva do ato, ano sem ato) e a regra de contagem antes de afirmar o vencimento.

## Item de `minutas`
```json
{"titulo": "RASCUNHO — Contestação — <CNJ>", "tipo": "contestacao", "link": "https://...", "status": "RASCUNHO", "geradoEm": "ISO", "prazoRelacionado": "AAAA-MM-DD"}
```
Tipos: `manifestacao, contestacao, recurso, embargos, peticao_simples, parecer, outro`. O status é sempre `RASCUNHO`. Campo opcional `texto` (Markdown, até 30.000 caracteres, começando por "RASCUNHO — NÃO PROTOCOLAR"): plano B quando não há Claude Docs; nesse caso `link` aponta para o painel.
