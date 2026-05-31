param(
    [Parameter(Mandatory = $true)]
    [string]$Namespace,

    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"

$renderPath = Join-Path (Split-Path $PSScriptRoot -Parent) "render.yaml"
$content = Get-Content $renderPath -Raw
$content = $content -replace "docker\.io/[^/\s]+/product-importer-api:[^\s]+", "docker.io/$Namespace/product-importer-api:$Tag"
$content = $content -replace "docker\.io/[^/\s]+/product-importer-web:[^\s]+", "docker.io/$Namespace/product-importer-web:$Tag"
Set-Content -Path $renderPath -Value $content -Encoding UTF8

Write-Host "Updated render.yaml:"
Write-Host "  docker.io/$Namespace/product-importer-api:$Tag"
Write-Host "  docker.io/$Namespace/product-importer-web:$Tag"
