# TERRA.SINAL — Grupo 03
## AI Vegetation Stress and Drought Decision Support System — Búzi e Muanza

Observatório web em **ASP.NET Core MVC** integrado com o **modelo treinado do ProjetoSeca**
(**ML.NET 5 + LightGBM**), com dados mensais reais extraídos no Google Earth Engine
(Sentinel-2 NDVI, CHIRPS e Sentinel-1 VV/VH) para 2018–2025.

O modelo corre **dentro do processo .NET** (sem serviço Python): o projecto web referencia a
biblioteca `Vegetation.ML` e carrega `modelo_lightgbm.zip` + `normais.json` + `metricas.json`.

### Requisitos

- **.NET SDK 10** (compila o projecto web net8.0 e o treino net10.0; o site usa `RollForward=Major`,
  por isso corre mesmo sem o runtime 8 instalado).
- **MySQL 8** (ou MariaDB) para o login e o histórico.
- Em Linux/macOS o LightGBM precisa do OpenMP (`sudo apt install libgomp1` / `brew install libomp`).


### Como o modelo é usado

| Onde | O que faz |
|---|---|
| **Visão geral** | Indicadores do mês (NDVI, chuva, radar), anomalias z, classe **prevista** pelo LightGBM com probabilidades, classe **observada** pelo NDVI e recomendação R01–R03 |
| **Análise temporal** | Séries 2018–2025 e gráfico *prevista vs observada* |
| **Modelo de IA e previsão** | Métricas reais de teste (referência, logística, LightGBM), matriz de confusão, previsão do período seleccionado e **previsão com valores introduzidos** (ex.: mês de 2026 ainda sem dados) |
| **Dados e importação** (Admin) | Importar CSV no formato `dados_unidos.csv` (validação, cópia de segurança, junção por distrito+ano+mês) |
| **Retreinar** (Admin) | Corre o `Treinador` do ProjetoSeca com o dataset actual; o modelo anterior fica em `App_Data/arquivo/<versão>` |
| **Histórico** | Previsões e análises gravadas em MySQL com versão do modelo, entradas, utilizador e nota |

Entradas do modelo (iguais ao ProjetoSeca): distrito, mês (seno/cosseno), z da chuva do mês e dos 3 meses
anteriores, z de VV e VH. As anomalias usam as normais do modelo activo (só anos de treino).
Para prever um mês pelo dataset são precisos os **3 meses anteriores**.

### 4. Integrar um modelo novo treinado fora da web

```bash
dotnet run --project Vegetation.ML.Treino -- aspnet-mvc-starter/ModeloIA/dados/dados_unidos.csv novo_modelo
```

Copiar os 4 ficheiros de `novo_modelo/` (`modelo_lightgbm.zip`, `modelo_logistica.zip`, `normais.json`,
`metricas.json`) para `aspnet-mvc-starter/App_Data/modelo/` (modelo activo) e reiniciar o site —
ou para `ModeloIA/modelo/` e apagar `App_Data/` para recomeçar do zero.

### 5. API

Ver `docs/API_CONTRACTS.md`. Todas as rotas `/api/*` exigem sessão (401 em JSON se não houver);
os `POST` exigem o cabeçalho `RequestVerificationToken` (a interface envia-o automaticamente).

### Avisos de rigor científico

- A classe "real" vem do z-score do NDVI (limiares −0,5 e −1,0 fixados antes do teste).
- O teste tem poucos meses de stress (1 moderado, 7 severos em 2024–2025): as métricas por classe são
  instáveis. O LightGBM foi escolhido pelo F1-macro (0,536) e não pela exatidão.
- Retreinar com anos incompletos muda a divisão treino/teste (últimos 2 anos = teste) e as normais.
- O sistema apoia especialistas: as recomendações exigem validação humana.
