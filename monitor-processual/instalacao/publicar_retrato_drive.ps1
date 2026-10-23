# Publica o retrato do monitor numa pasta PRIVADA do Google Drive e agenda a cópia.
#
# O que faz (nesta ordem, parando no primeiro problema):
#   1. localiza o "Meu Drive" do Google Drive para computador (qualquer letra de unidade);
#   2. cria a pasta "Vigia Processual - Retrato" e faz uma cópia de teste de data\retrato_vigia.json;
#   3. exporta um backup da tarefa agendada e acrescenta a cópia como ÚLTIMA ação (sem duplicar).
#
# Não altera o banco, o run_daily.py nem arquivos do monitor. Desfazer: Register-ScheduledTask com o XML de backup.
# SIGILO: o retrato tem dados de clientes. NÃO compartilhe a pasta no Drive.
param(
    [string]$Destino = "C:\Users\SAMSUNG\Downloads\MonitorProcessual",
    [string]$Tarefa  = "MonitorProcessual - Atualizacao",
    [string]$NomePasta = "Vigia Processual - Retrato"
)
$ErrorActionPreference = "Stop"

$origem = Join-Path $Destino "data\retrato_vigia.json"
if (-not (Test-Path $origem)) {
    throw "Não achei $origem. Rode antes: python -m core.exportador_vigia --db data\monitor.db --saida data\retrato_vigia.json"
}

# 1) localizar o Meu Drive
$candidatos = @()
foreach ($d in Get-PSDrive -PSProvider FileSystem) {
    foreach ($n in "Meu Drive", "My Drive") { $candidatos += (Join-Path $d.Root $n) }
}
foreach ($n in "Meu Drive", "My Drive", "Google Drive") { $candidatos += (Join-Path $env:USERPROFILE $n) }
$drive = $candidatos | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $drive) {
    throw "Meu Drive não encontrado. Confirme que o Google Drive para computador está aberto e logado (processo GoogleDriveFS)."
}
"Drive: $drive"

# 2) pasta + cópia de teste
$pasta = Join-Path $drive $NomePasta
New-Item -ItemType Directory $pasta -Force | Out-Null
$alvo = Join-Path $pasta "retrato_vigia.json"
Copy-Item -LiteralPath $origem -Destination $alvo -Force
Get-Item -LiteralPath $alvo | Select-Object FullName, Length, LastWriteTime | Format-List

# 3) backup da tarefa + ação de cópia (sem duplicar)
$bkp = Join-Path $Destino ("_backup_tarefa_{0}.xml" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
Export-ScheduledTask -TaskName $Tarefa | Out-File $bkp -Encoding utf8
"Backup da tarefa: $bkp"

$t = Get-ScheduledTask -TaskName $Tarefa
if ($t.Actions | Where-Object { $_.Arguments -like "*$NomePasta*" }) {
    "A ação de cópia já existe; nada a fazer."
} else {
    $arg = "-NoProfile -Command Copy-Item -LiteralPath '$origem' -Destination '$alvo' -Force"
    $acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg -WorkingDirectory $Destino
    Set-ScheduledTask -TaskName $Tarefa -Action ($t.Actions + $acao) | Out-Null
    "Ação de cópia acrescentada."
}
"Ações atuais da tarefa:"
(Get-ScheduledTask -TaskName $Tarefa).Actions | Select-Object Execute, WorkingDirectory | Format-List
