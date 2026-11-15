<#
.SYNOPSIS
  Baut das Prompt-Studio lokal und spielt es per SSH/SCP auf den VPS.

.DESCRIPTION
  Überträgt nur Build-Ergebnisse und Paketdateien. Die Dateien .env und data/
  auf dem Server werden nie angefasst.

.EXAMPLE
  .\deploy\deploy.ps1 -Server root@kodinitools.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$RemoteDir = '/opt/prompt-studio',
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Invoke-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "Schritt fehlgeschlagen: $Name" }
}

Invoke-Step 'Abhängigkeiten installieren' { npm ci }
if (-not $SkipTests) { Invoke-Step 'Tests' { npm test } }
Invoke-Step 'Build' { npm run build }

$archive = Join-Path $env:TEMP 'prompt-studio-release.tar.gz'
if (Test-Path $archive) { Remove-Item $archive }
Invoke-Step 'Archiv packen' {
  tar -czf $archive dist dist-server package.json package-lock.json deploy/ecosystem.config.cjs deploy/nginx/promptgenerator.conf
}

Invoke-Step 'Archiv hochladen' { scp $archive "${Server}:/tmp/prompt-studio-release.tar.gz" }

# Remote-Skript: läuft über stdin in bash (kein Quoting-Risiko), bricht beim ersten
# Fehler ab (set -e). Nur ASCII, damit die Zeichenkodierung von PowerShell keine Rolle spielt.
$remote = @"
set -e
mkdir -p $RemoteDir
cd $RemoteDir
if [ ! -f .env ]; then echo 'FEHLER: $RemoteDir/.env fehlt. Zuerst die Ersteinrichtung aus dem README ausfuehren.'; exit 1; fi
rm -rf dist dist-server
tar -xzf /tmp/prompt-studio-release.tar.gz
rm -f /tmp/prompt-studio-release.tar.gz
npm ci --omit=dev --no-audit --no-fund
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
sleep 2
PORT=`$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d '[:space:]' || true)
if [ -z "`$PORT" ]; then PORT=3022; fi
echo 'Health (erwartet {"ok":true}):'
curl -fsS "http://127.0.0.1:`$PORT/health"; echo
echo 'Ohne Anmeldung (erwartet 401):'
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:`$PORT/api/store"
# Ende (diese Zeile faengt ein angehaengtes Zeilenende von PowerShell ab)
"@ -replace "`r", ''

Invoke-Step 'Auf dem Server einspielen' { $remote | ssh $Server 'bash -s' }
Remove-Item $archive
Write-Host 'Fertig.' -ForegroundColor Green
