param(
    [Parameter(Mandatory = $true)]
    [string]$Namespace,

    [string]$Tag = "latest",

    [string]$RenderApiUrl = "https://product-importer-api.onrender.com"
)

$ErrorActionPreference = "Stop"

$apiImage = "docker.io/$Namespace/product-importer-api:$Tag"
$webImage = "docker.io/$Namespace/product-importer-web:$Tag"

Write-Host "Building $apiImage"
docker build -t $apiImage ./backend

Write-Host "Building $webImage with NEXT_PUBLIC_API_URL=$RenderApiUrl"
docker build `
    --build-arg NEXT_PUBLIC_API_URL=$RenderApiUrl `
    -t $webImage `
    ./frontend

Write-Host "Pushing $apiImage"
docker push $apiImage

Write-Host "Pushing $webImage"
docker push $webImage

Write-Host ""
Write-Host "Docker Hub images pushed:"
Write-Host "  $apiImage"
Write-Host "  $webImage"
Write-Host ""
Write-Host "Update render.yaml image URLs if needed, then create/sync the Render Blueprint."
