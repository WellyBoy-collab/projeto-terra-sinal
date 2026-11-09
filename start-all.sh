#!/usr/bin/env bash
# TERRA.SINAL — compila a solução e arranca o site (ASP.NET Core + modelo ML.NET no mesmo processo)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
dotnet restore TerraSinal.sln
dotnet build TerraSinal.sln -c Release
cd aspnet-mvc-starter
echo "Interface: http://localhost:5050/   (admin@terrasinal.mz / Admin@2026)"
ASPNETCORE_ENVIRONMENT=Development dotnet run -c Release --no-build --urls "http://localhost:5050"
