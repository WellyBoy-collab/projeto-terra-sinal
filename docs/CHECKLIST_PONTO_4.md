# Checklist da secção 4 — Projecto 3

As secções 4.1–4.8 da ficha determinam o domínio e a interface deste protótipo. A ficha geral também exige backend ASP.NET, segurança, dados, IA e API. Este ficheiro distingue explicitamente apresentação visual de funcionalidade real.

| Exigência da ficha | Onde está representada | O que falta no backend |
|---|---|---|
| Búzi e Muanza (4.1) | Filtro de região, mapa, dashboard | Observações reais por distrito |
| Copernicus NDVI (4.2) | KPI, gráficos, fonte | Ingestão e calibração/normalização reais |
| Sentinel-1, humidade (4.2) | KPI, gráfico, fonte | Pipeline radar/derivação apropriado |
| CHIRPS, precipitação (4.2) | KPI e histórico | Recortes e dados reais |
| Classes saudável/lig./mod./sev. (4.3) | Dashboard, mapa, regras | Modelo ML.NET classificador treinado |
| Atraso temporal chuva/solo (4.3 e 4.5) | Página Análise temporal, lag T−1 | Construir/testar lags sem fuga de dados |
| Exemplo de treino (4.4) | Três registos da ficha no mock | Pipeline de features e etiquetas reais |
| Importar três fontes (4.5) | Página Dados e importação + pré-validação CSV/JSON | Upload/autorização/persistência no servidor |
| Sincronizar por região/data/coord. (4.5) | Validação e etapas de pipeline | Integração ETL real |
| Anomalias NDVI/chuva (4.5) | Indicadores e campos na importação | Definir baseline, fórmula e qualidade |
| Dois classificadores (4.5) | Ecrã Modelos: FastTree e SDCA | Treinar dois modelos de facto |
| Accuracy, Precision, Recall, F1 (4.5) | Ecrã Modelos com valores fictícios marcados | Calcular métricas e justificar selecção |
| Matriz de confusão (4.5) | Ecrã Modelos com exemplo fictício | Calcular matriz a partir de teste real |
| Stress por região/período (4.5) | Filtros e dashboard | Endpoint de previsão real |
| Gráficos NDVI/chuva/solo (4.5) | Análise temporal e dashboard | Dados reais e séries alinhadas |
| Mapa de stress (4.5) | Mapa com pontos aproximados | Localizações/polígonos oficiais e georreferenciamento |
| Recomendações explicáveis (4.5 e 4.6) | R01–R04, evidências e aviso de avaliação humana | Motor de regras no servidor e sua versão |
| Guardar previsões/recomendações (4.5) | Histórico demo, registo local e exportação | EF Core, auditoria em base de dados |
| Componentes web / API (4.7) | Nove módulos, adaptador e contratos | API/Swagger/Identity/ML.NET completos |
| Exemplo Búzi Fev. 2026 (4.8) | Dados NDVI 0.41, anomalia −0.20, chuva 19, solo .15, classe severo | Modelo real e confiança se disponível |

## Não interpretar estes ecrãs como resultados científicos

- A amostra contém os dados de exemplo da ficha (secção 4.4) e outras linhas explicitamente sintéticas.
- O ecrã de modelos não tem ainda treino nem matriz calculada. A recomendação é uma regra, não uma resposta gerativa da IA.
- A alteração visual de role não é um mecanismo de controlo de acesso. O backend deve impor roles de forma independente.
- O starter ASP.NET serve apenas GETs de leitura simulados. A conformidade completa com a ficha exige implementar as fases descritas em `MIGRACAO_ASP_NET.md`.
