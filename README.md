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
