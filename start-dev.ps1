<#
  Levanta todo PortalFirma Asset en desarrollo con un solo comando, en UNA pestana de Windows Terminal
  con un panel por servicio.

    .\start-dev.ps1              # tunel BD + api + desktop
    .\start-dev.ps1 -SinTunel    # no abre el tunel SSH a la base (si ya lo tienes abierto en otra parte)
    .\start-dev.ps1 -Detener     # cierra la api, la app de escritorio y el tunel
    .\start-dev.ps1 -Simular     # solo muestra lo que haria, sin levantar nada

  Orden de arranque (cada panel espera al anterior, asi no hay errores por llegar antes):
    tunel BD (localhost:15432 -> PostgreSQL del servidor)  ->  api (http://localhost:3000/v1)  ->  desktop (Electron)

  Si Windows no deja ejecutarlo: powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
  Detalle en desktop/RESUMEN-TECNICO.md (seccion 2) y api/README.md.
#>
param(
  [switch]$SinTunel,
  [switch]$Detener,
  [switch]$Simular
)
$ErrorActionPreference = 'Stop'
$Raiz = $PSScriptRoot
$PuertoApi = 3000
$PuertoTunel = 15432

function Escuchando([int]$puerto) {
  Get-NetTCPConnection -State Listen -LocalPort $puerto -ErrorAction SilentlyContinue | Select-Object -First 1
}

# Procesos de desarrollo de este repositorio (nest, nodemon, vite, electron, tunel) aunque no tengan puerto
function ProcesosDev {
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -like "*$Raiz*" -and
    $_.CommandLine -match 'nest(\.js)?["'' ]+start|nodemon|tools[\/](dev|esperar-api)\.js|scripts[\/](dev|tunel)\.js|electron'
  }
}

# Un panel de Windows Terminal: carpeta, titulo y comando
function Panel([string]$titulo, [string]$carpeta, [string]$comando) {
  Write-Host ("  {0,-10} {1}" -f $titulo, $comando) -ForegroundColor Gray
  "-d `"$carpeta`" --title `"$titulo`" --suppressApplicationTitle powershell -NoExit -NoProfile -Command $comando"
}

# ---------------------------------------------------------------- detener
if ($Detener) {
  foreach ($p in @($PuertoApi, $PuertoTunel)) {
    $c = Escuchando $p
    if ($c) {
      if ($Simular) { Write-Host "  (cerraria el proceso del puerto $p)" -ForegroundColor DarkGray }
      else { taskkill /PID $c.OwningProcess /T /F | Out-Null; Write-Host "  cerrado el proceso del puerto $p" }
    }
  }
  ProcesosDev | ForEach-Object {
    if ($Simular) { Write-Host "  (cerraria $($_.Name) $($_.ProcessId))" -ForegroundColor DarkGray }
    else { taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null }
  }
  Write-Host 'Listo: servicios de desarrollo detenidos.' -ForegroundColor Green
  exit 0
}

# ---------------------------------------------------------------- revisiones previas
if (-not (Get-Command wt -ErrorAction SilentlyContinue)) {
  Write-Host 'No encontre Windows Terminal (wt). Instalalo desde Microsoft Store: winget install Microsoft.WindowsTerminal' -ForegroundColor Red
  exit 1
}
if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) { Write-Host 'No encontre yarn: npm install -g yarn' -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $Raiz 'api\.env'))) { Write-Host 'Falta api\.env (credenciales de desarrollo).' -ForegroundColor Red; exit 1 }
foreach ($d in 'api', 'desktop') {
  if (-not (Test-Path (Join-Path $Raiz "$d\node_modules"))) {
    if ($Simular) { Write-Host "  (instalaria dependencias en $d)" -ForegroundColor DarkGray; continue }
    Write-Host "Instalando dependencias en $d ..." -ForegroundColor Cyan
    Push-Location (Join-Path $Raiz $d); yarn install; $ok = $?; Pop-Location
    if (-not $ok) { Write-Host "yarn install fallo en $d" -ForegroundColor Red; exit 1 }
  }
}

# ---------------------------------------------------------------- puertos libres
$ocupado = Escuchando $PuertoApi
$desktopAbierto = @(ProcesosDev | Where-Object { $_.CommandLine -match 'tools[\/]dev\.js|nodemon' }).Count -gt 0
if ($ocupado -or $desktopAbierto) {
  $que = @(); if ($ocupado) { $que += "api ($PuertoApi)" }; if ($desktopAbierto) { $que += 'desktop (yarn dev)' }
  Write-Host "Ya esta corriendo: $($que -join ', ')" -ForegroundColor Yellow
  Write-Host 'Cierralo antes, o corre .\start-dev.ps1 -Detener' -ForegroundColor Yellow
  if (-not $Simular) { exit 1 }
}

# ---------------------------------------------------------------- arranque
# Una sola pestana de Windows Terminal dividida en paneles:
#   +---------------+---------------+
#   | api           | desktop       |
#   |               +---------------+
#   |               | tunel BD      |
#   +---------------+---------------+
Write-Host 'Levantando servicios en una pestana de Windows Terminal:' -ForegroundColor Cyan
$conTunel = -not $SinTunel -and -not (Escuchando $PuertoTunel)
if (-not $SinTunel -and -not $conTunel) { Write-Host "  tunel BD   ya abierto en $PuertoTunel" -ForegroundColor Gray }

# la api espera al tunel (dev:panel); si no se abre aqui, lo abre ella misma si hace falta (dev)
$cmdApi = if ($conTunel) { 'yarn dev:panel' } else { 'yarn dev' }
$wt = @(
  "-w 0 new-tab $(Panel 'api' (Join-Path $Raiz 'api') $cmdApi)"
  "split-pane -V $(Panel 'desktop' (Join-Path $Raiz 'desktop') 'yarn dev:api')"
)
if ($conTunel) { $wt += "split-pane -H $(Panel 'tunel BD' (Join-Path $Raiz 'api') 'yarn tunel')" }
$argumentos = $wt -join ' ; '
if ($Simular) { Write-Host "`nwt $argumentos" -ForegroundColor DarkGray; exit 0 }
Start-Process wt -ArgumentList $argumentos

Write-Host ''
Write-Host 'Listo. Cuando terminen de compilar:' -ForegroundColor Green
Write-Host "  api        http://localhost:$PuertoApi/v1/salud"
Write-Host '  desktop    la ventana de Electron se abre sola cuando la api responde'
Write-Host 'Para cerrar todo: .\start-dev.ps1 -Detener'
