# Legado (não usado pela aplicação)

- `ai-agent-python/` — agente FastAPI + RandomForest treinado com **dados sintéticos**. Foi substituído pelo
  modelo real do ProjetoSeca (ML.NET + LightGBM), que corre dentro do próprio ASP.NET (`Vegetation.ML`).
- `prototype-html/` — protótipo HTML estático com dados fictícios (4 classes, 2026-01..04).
- `tools/sync_razor.py` — gerava as Views Razor a partir do protótipo. **Não usar**: as Views actuais
  foram reescritas para os dados reais e seriam sobrescritas.
