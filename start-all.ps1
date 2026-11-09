# TERRA.SINAL — compila a solução e arranca o site (Windows / PowerShell)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
dotnet restore TerraSinal.sln
dotnet build TerraSinal.sln -c Release
Set-Location aspnet-mvc-starter
Write-Host "Interface: http://localhost:5050/   (admin@terrasinal.mz / Admin@2026)"
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet run -c Release --no-build --urls "http://localhost:5050"
