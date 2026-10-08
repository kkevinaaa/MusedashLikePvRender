$ErrorActionPreference = 'Stop'

$toolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $toolRoot '..\..')
$entryPoint = Join-Path $toolRoot 'equidistant_white_edge_generator.py'
$distPath = Join-Path $toolRoot 'dist'
$workPath = Join-Path $toolRoot 'build'
$specPath = $toolRoot

python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --name EquidistantWhiteEdgeGenerator `
    --distpath $distPath `
    --workpath $workPath `
    --specpath $specPath `
    $entryPoint

Write-Host "Built: $(Join-Path $distPath 'EquidistantWhiteEdgeGenerator.exe')"
