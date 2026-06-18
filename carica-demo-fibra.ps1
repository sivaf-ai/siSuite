# =====================================================================
#  carica-demo-fibra.ps1 — azzera e ricarica i DATI DEMO del verticale Fibra
#  (tenant "Fibra Demo": commesse, ordini di lavoro, magazzino, rapportini...).
#  ATTENZIONE: azzera e ricarica SOLO i dati demo del pack 'fiber'.
#  Richiede che siSuite sia gia' avviato (avvia-siSuite.bat).
# =====================================================================
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Info($m){ Write-Host "[demo] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[demo] $m" -ForegroundColor Green }
function Err($m){ Write-Host "[demo] $m" -ForegroundColor Red }

# credenziali admin piattaforma dal .env (fallback ai default dev)
$email = 'owner@sisuite.local'; $pwd = 'Owner123!'
if (Test-Path ".env") {
  foreach ($line in Get-Content ".env") {
    if ($line -match '^\s*OWNER_EMAIL\s*=\s*(.+?)\s*$') { $email = $Matches[1] }
    if ($line -match '^\s*OWNER_PASSWORD\s*=\s*(.+?)\s*$') { $pwd = $Matches[1] }
  }
}

Info "Login come $email ..."
try {
  $tokRes = Invoke-RestMethod -Method Post -Uri "http://localhost:9999/token?grant_type=password" `
    -ContentType "application/json" -Body (@{ email = $email; password = $pwd } | ConvertTo-Json)
  $tok = $tokRes.access_token
} catch { Err "Login fallito. siSuite e' avviato? (avvia-siSuite.bat). Dettaglio: $($_.Exception.Message)"; exit 1 }
if (-not $tok) { Err "Token non ottenuto."; exit 1 }

$headers = @{ Authorization = "Bearer $tok" }
Info "Azzero i dati demo Fibra..."
Invoke-RestMethod -Method Post -Uri "http://localhost:3010/platform/demo/fiber/wipe" -Headers $headers | Out-Null
Info "Carico il pack 'fiber'..."
Invoke-RestMethod -Method Post -Uri "http://localhost:3010/platform/demo/fiber/load" -Headers $headers | Out-Null

Ok "Demo Fibra caricata. Accedi all'app con:  owner@fibra.demo  /  Demo123!"
Write-Host "    App: http://localhost:5173" -ForegroundColor Gray
