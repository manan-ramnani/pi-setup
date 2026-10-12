$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
& node (Join-Path $root "scripts/bootstrap.mjs") @args
exit $LASTEXITCODE
