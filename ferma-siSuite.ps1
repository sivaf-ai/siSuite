# =====================================================================
#  ferma-siSuite.ps1 — ferma i container siSuite. I DATI restano salvati
#  (volumi Docker): al prossimo avvio ritrovi tutto.
# =====================================================================
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host "[siSuite] Fermo i container (i dati restano salvati)..." -ForegroundColor Cyan
docker compose stop
if ($LASTEXITCODE -eq 0) { Write-Host "[siSuite] Fermato. Riavvia con avvia-siSuite.bat" -ForegroundColor Green }
else { Write-Host "[siSuite] Qualcosa e' andato storto durante lo stop." -ForegroundColor Red }
