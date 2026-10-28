$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& node --env-file=.env.local --import tsx scripts/collect-etf-rankings.ts --watch
exit $LASTEXITCODE
