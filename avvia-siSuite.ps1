# =====================================================================
#  avvia-siSuite.ps1 — avvia TUTTO lo stack siSuite in Docker e apre il browser.
#  Lanciato da avvia-siSuite.bat (doppio click). Non serve aprire terminali.
#  Ordine gestito da docker compose: db -> auth + migrate (schema/RLS/bootstrap)
#  -> backend -> frontend. Le migrazioni girano da sole all'avvio.
# =====================================================================
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Info($m){ Write-Host "[siSuite] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[siSuite] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[siSuite] $m" -ForegroundColor Yellow }
function Err($m){ Write-Host "[siSuite] $m" -ForegroundColor Red }

Write-Host ""
Info "Avvio di siSuite..."

# 1) Docker installato?
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Err "Docker non e' installato o non e' nel PATH."
  Err "Installa Docker Desktop: https://www.docker.com/products/docker-desktop/"
  exit 1
}

# 2) Docker Desktop in esecuzione? (avvia e attendi se serve)
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Warn "Docker Desktop non e' in esecuzione: provo ad avviarlo..."
  $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dd) { Start-Process $dd | Out-Null } else { Err "Non trovo Docker Desktop. Avvialo a mano e riprova."; exit 1 }
  Info "Attendo che Docker sia pronto (puo' richiedere 1-2 minuti)..."
  $tries = 0
  do {
    Start-Sleep -Seconds 4; $tries++
    docker info *> $null
  } until ($LASTEXITCODE -eq 0 -or $tries -ge 45)
  if ($LASTEXITCODE -ne 0) { Err "Docker non e' diventato pronto. Avvia Docker Desktop a mano e riprova."; exit 1 }
}
Ok "Docker e' pronto."

# 3) File .env presente? (se manca, copia dall'esempio)
if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") { Copy-Item ".env.example" ".env"; Warn "Creato .env da .env.example (controlla i valori se serve)." }
  else { Err "Manca il file .env e non c'e' .env.example. Impossibile continuare."; exit 1 }
}

# 4) Su, costruendo le immagini se necessario (la prima volta ci mette qualche minuto)
Info "Avvio dei container (la PRIMA volta scarica/costruisce: anche 3-5 min)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Err "docker compose up ha fallito. Vedi i messaggi sopra."; exit 1 }

# 5) Attendi che il frontend risponda
Info "Attendo che l'app sia pronta..."
$url = "http://localhost:5173"
$ready = $false; $tries = 0
do {
  Start-Sleep -Seconds 3; $tries++
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 4; if ($r.StatusCode -eq 200) { $ready = $true } } catch {}
} until ($ready -or $tries -ge 60)

Write-Host ""
if ($ready) {
  Ok "siSuite e' ATTIVO."
  Start-Process $url
} else {
  Warn "L'app non ha ancora risposto entro il tempo previsto, ma i container sono avviati."
  Warn "Riprova ad aprire $url tra qualche secondo (la prima build puo' essere lunga)."
}

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host " APP:      http://localhost:5173" -ForegroundColor White
Write-Host " API:      http://localhost:3010   ·  Auth: http://localhost:9999" -ForegroundColor White
Write-Host " MinIO:    http://localhost:9101   (console object storage)" -ForegroundColor White
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host " LOGIN amministratore piattaforma:  owner@sisuite.local  /  Owner123!" -ForegroundColor White
Write-Host " LOGIN demo Fibra (dopo aver caricato la demo): owner@fibra.demo / Demo123!" -ForegroundColor White
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host " Per caricare i DATI DEMO 'Fibra':" -ForegroundColor White
Write-Host "   - entra come owner@sisuite.local, vai in 'Demo / Super admin' e carica il pack 'fiber'" -ForegroundColor Gray
Write-Host "   - oppure doppio click su  carica-demo-fibra.bat" -ForegroundColor Gray
Write-Host " Per FERMARE tutto:  doppio click su  ferma-siSuite.bat" -ForegroundColor White
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
