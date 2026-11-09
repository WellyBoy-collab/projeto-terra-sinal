# Contratos da Web API — Grupo 03 (implementados)

Todas as rotas exigem sessão iniciada (roles `Administrador` ou `Investigador`). Sem sessão: `401`;
sem permissão: `403`. Os `POST` exigem o cabeçalho `RequestVerificationToken` (antiforgery).
Erros devolvem `ProblemDetails` (`title`, `detail`, `status`). `period` = `AAAA-MM`.

| Método | Rota | Permissão | Retorno/Acção |
|---|---|---|---|
| GET | `/api/regions` | Investigador/Admin | `["Buzi","Muanza"]` |
| GET | `/api/periods?region=Buzi` | Investigador/Admin | Meses disponíveis, do mais recente |
| GET | `/api/observations?region=Buzi&period=2025-10` | Investigador/Admin | Observação + anomalias + classe observada + previsão |
| GET | `/api/observations?region=Buzi` | Investigador/Admin | Série completa com previsões |
| GET | `/api/observations/sites?period=2025-10` | Investigador/Admin | Um marcador por distrito |
| POST | `/api/predictions` | Investigador/Admin | Previsão (dataset ou valores manuais); `save:true` grava |
| GET | `/api/predictions/history?region=&take=200` | Investigador/Admin | Histórico (MySQL) |
| GET | `/api/recommendations` | Investigador/Admin | Regras R01–R03 |
| POST | `/api/recommendations/review` | Investigador/Admin | Regista análise humana `{region, period, note}` |
| GET | `/api/models/status` | Investigador/Admin | Estado do modelo e do dataset |
| GET | `/api/models/metrics` | Investigador/Admin | Métricas de teste dos 3 modelos + matrizes |
| POST | `/api/models/train` | **Administrador** | Retreina e activa o novo modelo |
| GET | `/api/datasets/current` | Investigador/Admin | `dados_unidos.csv` actual |
| POST | `/api/datasets/import` | **Administrador** | `multipart/form-data`: `file` (CSV), `dryRun` |

### Observação (`GET /api/observations?region=Buzi&period=2025-10`)

```json
{
  "region": "Buzi", "period": "2025-10", "year": 2025, "month": 10,
  "ndvi": 0.297, "ndviZ": -1.044, "pixelsValidos": 783286, "cobertura": 1.0, "coberturaOk": true, "nImagensS2": 75,
  "chuvaMm": 22.6, "chuvaZ": -0.084, "chuvaLag1": 8.2, "chuvaLag2": 8.0, "chuvaLag3": 29.8,
  "vv": -12.42, "vh": -19.00, "vvZ": -1.278, "vhZ": -1.146, "nImagensS1": 17,
  "classeObservada": "severo", "conjunto": "teste",
  "previsao": { "classe": "…", "probNormal": 0.0, "probModerado": 0.0, "probSevero": 0.0,
                "confianca": 0.0, "versaoModelo": "v20261108-132623", "geradoEmUtc": "…" },
  "previsaoErro": null,
  "recomendacao": { "id": "R03", "classe": "severo", "titulo": "Stress severo", "texto": "…", "prioridade": "Alta" },
  "notas": ["…"]
}
```

### Previsão (`POST /api/predictions`)

Com os dados do dataset:

```json
{ "region": "Muanza", "period": "2024-02", "save": true }
```

Com valores introduzidos (mês que ainda não está no dataset):

```json
{ "region": "Buzi", "period": "2026-01", "chuvaMm": 40.5, "chuvaLag1": 141.3, "chuvaLag2": 306.5,
  "chuvaLag3": 22.6, "vv": -11.9, "vh": -18.0, "save": true }
```

Resposta: `region`, `period`, `origin` (`historico`/`manual`), `input`, `prediction`, `observedClass`,
`recommendation`, `notes`, `savedId`, `saveWarning`.

### Importação (`POST /api/datasets/import`)

CSV com o cabeçalho
`distrito,ano,mes,ndvi_medio,pixels_validos,n_imagens_s2,chuva_mm,vv_medio,vh_medio,n_imagens_s1`.
`ndvi_medio` pode ficar vazio (meses com nuvens). Resposta:
`{ simulacao, linhasLidas, novas, actualizadas, totalDepois, erros[], avisos[] }` (400 se houver erros).
