# Configura a automação diária do Vigia no Windows.
#
#  1) Tarefa "MonitorProcessual - Atualizacao": passa a ter, nesta ordem,
#       importar do painel -> run_daily.py -> fonte DataJud -> exportador -> cópia para o Drive.
#     (idempotente: não duplica ações; faz backup do XML da tarefa antes de mexer)
#  2) Tarefa "VigiaGatilhoLocal": ao entrar no Windows, inicia a página local
#     http://127.0.0.1:8765/ , que atualiza o dia na primeira abertura do navegador.
#
# NÃO apaga nada, NÃO altera o banco nem o run_daily.py. Desfazer:
#   Unregister-ScheduledTask -TaskName VigiaGatilhoLocal -Confirm:$false
#   Register-ScheduledTask -TaskName "MonitorProcessual - Atualizacao" -Xml (Get-Content "<backup>.xml" -Raw) -Force
# SIGILO: o retrato tem dados de clientes. Não compartilhe a pasta do Drive.
param(
    [string]$Monitor = "C:\Users\SAMSUNG\Downloads\MonitorProcessual",
    [string]$Lista   = "C:\Users\SAMSUNG\Documents\VigiaProcessual\processos.json",
    [string]$NomePasta = "Vigia Processual - Retrato",
    [string]$Tarefa  = "MonitorProcessual - Atualizacao",
    [int]$Porta = 8765
)
$ErrorActionPreference = "Stop"

$py  = Join-Path $Monitor "venv\Scripts\python.exe"
$pyw = Join-Path $Monitor "venv\Scripts\pythonw.exe"
foreach ($f in @($py, $pyw, (Join-Path $Monitor "run_daily.py"), (Join-Path $Monitor "core\gatilho_diario.py"), (Join-Path $Monitor "core\importar_painel.py"))) {
    if (-not (Test-Path -LiteralPath $f)) { throw "Não encontrei $f. Instale o pacote novo antes (instalar_calendarios.py)." }
}
if (-not (Test-Path -LiteralPath $Lista)) { throw "Não encontrei a lista do monitor em $Lista. Rode de novo com -Lista <caminho do processos.json>." }

# --- Drive
$cand = @()
foreach ($d in Get-PSDrive -PSProvider FileSystem) { foreach ($n in "Meu Drive","My Drive") { $cand += (Join-Path $d.Root $n) } }
$drive = $cand | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $drive) { throw "Meu Drive não encontrado. Abra o Google Drive para computador e entre na conta." }
$pasta = Join-Path $drive $NomePasta
New-Item -ItemType Directory $pasta -Force | Out-Null
"Monitor: $Monitor"; "Lista:   $Lista"; "Drive:   $pasta"

# --- porta livre?
$emUso = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
$jaTemGatilho = Get-ScheduledTask -TaskName "VigiaGatilhoLocal" -ErrorAction SilentlyContinue
if ($emUso -and -not $jaTemGatilho) { throw "A porta $Porta já está em uso por outro programa. Rode com -Porta <outra>." }

# --- 1) tarefa de atualização
$bkp = Join-Path $Monitor ("_backup_tarefa_{0}.xml" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
Export-ScheduledTask -TaskName $Tarefa | Out-File $bkp -Encoding utf8
"Backup da tarefa: $bkp"

$t = Get-ScheduledTask -TaskName $Tarefa
$acoes = @($t.Actions)
$temImport = $acoes | Where-Object { $_.Arguments -like "*core.importar_painel*" }
$temExport = $acoes | Where-Object { $_.Arguments -like "*core.exportador_vigia*" }
$temFonte  = $acoes | Where-Object { $_.Arguments -like "*core.datajud_fonte*" }
$temCopia  = $acoes | Where-Object { $_.Arguments -like "*$NomePasta*" }
$novas = @()
if (-not $temImport) {
    $argImp = "-m core.importar_painel --origem `"$pasta\numeros_painel.json`" --lista `"$Lista`""
    $novas += New-ScheduledTaskAction -Execute $py -Argument $argImp -WorkingDirectory $Monitor
}
$final = $novas + $acoes
if (-not $temExport) {
    $final += New-ScheduledTaskAction -Execute $py -Argument "-m core.exportador_vigia --db data\monitor.db --saida data\retrato_vigia.json" -WorkingDirectory $Monitor
}
if (-not $temCopia) {
    $origem = Join-Path $Monitor "data\retrato_vigia.json"
    $argCop = "-NoProfile -Command Copy-Item -LiteralPath '$origem' -Destination '$pasta\retrato_vigia.json' -Force"
    $final += New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argCop -WorkingDirectory $Monitor
}
if (-not $temFonte) {
    # registra a atualização da fonte DataJud logo ANTES do exportador
    $acaoFonte = New-ScheduledTaskAction -Execute $py -Argument "-m core.datajud_fonte --db data\monitor.db" -WorkingDirectory $Monitor
    $ordenado = @()
    foreach ($a in $final) {
        if ($a.Arguments -like "*core.exportador_vigia*") { $ordenado += $acaoFonte }
        $ordenado += $a
    }
    $final = $ordenado
}
if ($final.Count -ne $acoes.Count) {
    Set-ScheduledTask -TaskName $Tarefa -Action $final | Out-Null
    "Tarefa '$Tarefa' atualizada."
} else { "Tarefa '$Tarefa' já estava completa." }

# --- 2) gatilho local ao entrar no Windows
$argGat = "-m core.gatilho_diario --base `"$Monitor`" --drive `"$pasta`" --lista `"$Lista`" --porta $Porta"
$acaoGat = New-ScheduledTaskAction -Execute $pyw -Argument $argGat -WorkingDirectory $Monitor
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$conf = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "VigiaGatilhoLocal" -Action $acaoGat -Trigger $gatilho -Settings $conf `
    -Description "Página local do Vigia Processual (127.0.0.1:$Porta): atualiza o dia ao abrir o navegador." -Force | Out-Null
"Tarefa 'VigiaGatilhoLocal' registrada."
Start-ScheduledTask -TaskName "VigiaGatilhoLocal"
Start-Sleep -Seconds 4

# --- conferência
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/status" -TimeoutSec 5
    "Página local no ar: estado = $($r.estado)"
} catch { "A página local ainda não respondeu. Aguarde alguns segundos e abra http://127.0.0.1:$Porta/ " }
"Ações da tarefa de atualização:"
(Get-ScheduledTask -TaskName $Tarefa).Actions | Select-Object Execute, Arguments | Format-List
""
"PRÓXIMO PASSO (uma vez): defina http://127.0.0.1:$Porta/ como página inicial do navegador."
"  Edge:   edge://settings/onStartup   -> 'Abrir uma ou mais páginas específicas' -> Adicionar nova página"
"  Chrome: chrome://settings/onStartup -> 'Abrir uma página específica' -> Adicionar"
