# Instalação dos calendários por tribunal no monitor processual

O instalador `instalar_calendarios.py` coloca no monitor os calendários do TJRJ, do TRT1 e o de reserva nacional, corrige **uma linha** do `run_daily.py` e confere tudo com um teste de fumaça. Se algo falhar, ele desfaz sozinho.

## Antes de começar
1. Use o Python **do ambiente virtual do monitor que roda na tarefa agendada** (`<pasta do monitor>\venv\Scripts\python.exe`), para que o teste de fumaça valide o mesmo ambiente de produção.
2. Instale quando **nenhuma execução do monitor estiver em andamento** (a tarefa diária roda de manhã; verifique no Agendador de Tarefas).
3. Extraia o pacote em qualquer pasta (a estrutura `instalacao\`, `core\`, `tests\` e `VERSAO.json` deve ficar junta).

## Passo a passo
```powershell
$py  = "<pasta do monitor>\venv\Scripts\python.exe"
$dst = "<pasta do monitor>"

# 1) Simular (não altera nada): mostra o plano e avisa se alguma coisa não se encaixa
& $py instalacao\instalar_calendarios.py --destino $dst --simular

# 2) Instalar (pede confirmação digitando SIM)
& $py instalacao\instalar_calendarios.py --destino $dst

# 3) Conferir depois, quando quiser (não altera nada)
& $py instalacao\instalar_calendarios.py --destino $dst --verificar

# 4) Desfazer, se precisar (use a pasta de backup que o instalador mostrou)
& $py instalacao\instalar_calendarios.py --reverter "$dst\_backup_calendarios_AAAAMMDD_HHMMSS"
```

## O que o instalador faz
| Etapa | Detalhe |
|---|---|
| Confere | arquivos do pacote (SHA-256 em `VERSAO.json`) e se o destino é mesmo o monitor |
| Backup | `_backup_calendarios_<data_hora>\` com cópia de tudo o que será trocado + `MANIFESTO.json` |
| Instala | `core\`: `calendar_prazos`, `calendarios`, `calendario_tjrj`, `calendario_trt1`, `calendario_nacional`, `vigia_contrato`; `tests\`: `test_prazos`, `test_calendarios`, `test_vigia_contrato` |
| Corrige | em `run_daily.py`, a chamada de `calcular_prazo` ganha `tribunal=comunicacao.get("sigla_tribunal"),` (preserva quebras de linha e BOM) |
| Teste de fumaça | importa os módulos, confere datas conhecidas (TJRJ e TRT1), passa amostras pelo **seu** classificador e roda os testes do pacote (se o `pytest` estiver instalado) |
| Se falhar | restaura os arquivos (conferido por SHA-256) e remove os que foram criados |

Ele **não** executa o `run_daily.py`, **não** acessa a rede e **não** grava no banco.

## Se o instalador recusar
- **"Não consegui corrigir o run_daily.py":** o trecho esperado não foi encontrado. Nada foi alterado. Edite à mão (acrescente `tribunal=comunicacao.get("sigla_tribunal"),` na chamada de `calcular_prazo`) e rode com `--sem-patch-run-daily`.
- **"SHA-256 diferente":** o pacote foi alterado ou corrompido na cópia. Extraia de novo.
- **Aviso de outros arquivos que chamam `calcular_prazo`:** eles não são alterados e usarão o TJRJ por padrão. Se calculam prazos de outros tribunais, ajuste-os da mesma forma.

## Depois de instalar
1. Reinicie a tarefa **Painel** (ou o computador) para o painel carregar os módulos novos.
2. Na próxima execução diária, confira o fim do `data\log.txt` e os prazos novos: o campo de observações traz os avisos (tribunal sem perfil, dia com ressalva, ano sem ato cadastrado).
3. Processos da Comarca/município da **Capital**: o instalador não liga isso. Se for o caso, acrescente `capital=True` na mesma chamada.
4. Tribunais sem perfil (ex.: TJSP) usam o calendário nacional de reserva e **sempre** avisam: confira o vencimento no calendário do tribunal.

## Requisitos
Python 3.9 ou superior. `pytest` é opcional (sem ele, os testes do pacote não rodam, mas a fumaça sim). A biblioteca `holidays` deixou de ser usada pelo cálculo.
