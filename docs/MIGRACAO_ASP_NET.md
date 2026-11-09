# Guia de integração ASP.NET Core MVC — TERRA.SINAL

## 1. Objectivo e escolha de arquitectura

O trabalho do Grupo 03 exige uma aplicação **ASP.NET Core MVC ou Razor Pages** com **ASP.NET Core Web API, Entity Framework Core, SQL Server/PostgreSQL, ASP.NET Core Identity e ML.NET**, além de dashboard, importação/validação, histórico, auditoria e testes. A presente interface está organizada para **MVC + Razor Views**.

As 9 secções `section[data-view]` no HTML são mantidas como 9 partial views na pasta `Views/Observatorio/` do starter. Por agora a navegação é uma SPA simples baseada no fragmento `#pagina`. Em etapas futuras, o grupo pode converter cada partial em uma View fortemente tipada associada a uma rota MVC, preservando os estilos.

## 2. O que já existe, e o que NÃO existe

| Componente | Estado actual | Implementação real futura |
|---|---|---|
| Bootstrap + CSS3 + HTML5 + JS | Implementado | Colocar em `wwwroot/assets` |
| Views MVC e Layout Razor | Starter preparado | ViewModels, rotas MVC independentes |
| Dashboard / Mapas / Gráficos | UI demonstrativa | Consultar dados reais da API |
| Adaptador de dados (`TERRA_API`) | Mock e REST GET previstos | Trocar para respostas da Web API |
| Importação de ficheiros | Apenas leitura e pré-validação no browser | Multipart/upload no servidor, limites, segurança, persistência, logs |
| Recomendações R01–R04 | Regras explícitas no JavaScript | `RecommendationService` no servidor, versionamento, auditoria |
| Histórico | Dados demo + `localStorage` | Registo transaccional em PostgreSQL/SQL Server |
| Comparação ML | Só valores visuais ilustrativos | Treino/avaliação reais com ML.NET e métricas persistidas |
| Autenticação | Selector visual de roles, sem senha | Identity, roles, cookies, antiforgery, lockout |
| API no starter | Endpoints GET com JSON demo | Contratos completos, Swagger e autenticação |

## 3. Desenvolvimento recomendado — por ordem

**Fase A — MVC e modelos do domínio**
1. Partir de `aspnet-mvc-starter` (ou criar uma solução ASP.NET Core MVC e copiar `Views` + `wwwroot/assets`).
2. Introduzir Projectos/camadas: `TerraSinal.Web`, `TerraSinal.Api` (opcional se APIs no mesmo host), `TerraSinal.Domain`, `TerraSinal.Application`, `TerraSinal.Infrastructure`, `TerraSinal.ML` e `TerraSinal.Tests`.
3. Criar entidades: `Region`, `DatasetSource`, `ClimateObservation`, `ImportBatch`, `DataQualityIssue`, `ModelVersion`, `ModelMetric`, `StressPrediction`, `DecisionRecommendation`, `AuditEvent`.
4. Usar PostgreSQL/PostGIS quando houver geometrias; EF Core com migrations. Guardar data/período, fonte e qualidade para cada variável. Não considerar o NDVI como um único valor do distrito sem explicitar a agregação espacial/temporal.

**Fase B — Ingestão e qualidade**
5. Importar amostras Copernicus NDVI, Sentinel-1 e CHIRPS; aceitar o esquema confirmado pelo docente. Fazer parsing por fonte, validação robusta no servidor, trilho de proveniência e deduplicação.
6. Alinhar observações por distrito, período, e quando aplicável por localização e resolução espacial. Documentar como são agregadas séries de temporalidades diferentes.
7. Derivar anomalia NDVI e anomalia de precipitação apenas com climatologia de referência identificada e fórmula documentada; gerar `rainLag1`, `soilLag1` e outros lags sem usar dados do futuro.

**Fase C — IA com ML.NET**
8. Treinar e comparar pelo menos dois classificadores (os exemplos visuais FastTree e SDCA Maximum Entropy são sugestões, não resultados).
9. Separar treino/teste temporalmente; calcular Accuracy, Precision/Recall/F1 (incluindo macro para desequilíbrios) e matriz de confusão; documentar classes, dados e falsos positivos/negativos.
10. Guardar a versão do modelo, data, conjunto de treino, features e métricas. Disponibilizar classificação e indicadores de suporte; confiança só se calibrada/disponível.

**Fase D — Recomendações, segurança e API**
11. Implementar R01–R04 no servidor, com regras determinísticas configuráveis, classes e indicadores de suporte. Guardar a recomendação emitida e eventual validação humana, nunca actuar automaticamente no terreno.
12. Usar Identity com roles **Administrador** e **Investigador**, proteger upload e treino por `[Authorize(Roles="Administrador")]`, configurar antiforgery nos formulários MVC, tamanho/extensões/MIME seguros no upload e logs. Não confundir o selector de papéis da interface com autorização.
13. Implementar API REST/Swagger, controllers com DTOs e `ProblemDetails`. Não incluir segredos no código-fonte. Testar autenticação, autorização, endpoints, validação, transformação e regras.
14. Adaptar `wwwroot/assets/js/api-client.js`: usar `window.TERRA_CONFIG.useApi = true` e garantir que os DTOs correspondem aos atributos consumidos em `app.js`. Remover `mock-data.js` e as métricas estáticas **apenas quando** todos os seus consumidores forem substituídos por respostas reais.

## 4. Separação UI / negócio

- `Views/*.cshtml`: estrutura e componentes visuais; não colocar consulta SQL, importação pesada ou treino ML.
- `wwwroot/assets/js/app.js`: estados de UI, gráficos, eventos e navegação.
- `wwwroot/assets/js/api-client.js`: requisições `fetch()` e tratamento de erros/JSON.
- `Controllers`: converter HTTP em chamadas a serviços de aplicação.
- `Application`: sincronização, cálculo de features, classificação, recomendações, autorização por caso de uso.
- `Infrastructure`: EF Core, ficheiros, provedores externos, logs.
- `ML`: pipelines de treino, avaliação, métricas e `PredictionEnginePool`/inferência em serviço dedicado.

## 5. Exemplo de substituição de dados

Hoje:

```js
window.TERRA_CONFIG = { useApi: false, baseUrl: '/api' };
const observacao = await TERRA_API.observations('Buzi', '2026-02');
```

Quando a Web API estiver pronta:

```js
window.TERRA_CONFIG = { useApi: true, baseUrl: '/api' };
const observacao = await TERRA_API.observations('Buzi', '2026-02');
```

A interface espera `region`, `period`, `ndvi`, `ndviAnomaly`, `rainfall`, `rainAnomaly`, `soilMoisture`, `rainLag`, `soilLag` e `stressClass`. Ajustar os contratos se os dados reais diferirem; **não forçar os datasets brutos** a adoptar este esquema de dashboard sem uma etapa ETL documentada.

## 6. Pormenores importantes de Razor

- CSS, SVG, JavaScript, bibliotecas e folhas de estilo residem em `wwwroot` e são referenciados com `~/assets/...`.
- `_Layout.cshtml` concentra Bootstrap e scripts; `_ViewImports.cshtml` activa tag helpers.
- `Index.cshtml` referencia as partial views, para permitir alterar módulos separadamente.
- Formulários de operações mutáveis devem implementar antiforgery e endpoints autorizados. Para `fetch` com cookie Identity, adicionar o token CSRF ao cabeçalho conforme configuração do backend.
- A utilização de `@Model`/ViewModels e da navegação MVC por controllers é uma melhoria futura possível, não depende da aparência actual.

## 7. Testes prioritários

- Importação de CSV inválido, nulos, datas incongruentes e duplicados; ficheiros maliciosos/volumosos.
- Regiões/períodos inexistentes e sincronização de datas e coordenadas.
- Garantir que lags não usam o futuro; treino/teste independentes.
- Auditoria de quem importou, treinou, classificou e confirmou uma recomendação.
- Investigador não pode importar ou treinar, mesmo a tentar a API directamente.
- Consistência dos resultados entre Web UI e API.
