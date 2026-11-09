// Limites administrativos (nível distrito) de Moçambique
var distritos = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Mozambique'))
  .filter(ee.Filter.or(
    ee.Filter.eq('ADM2_NAME', 'Buzi'),
    ee.Filter.eq('ADM2_NAME', 'Muanza')
  ));

// Verificar o que foi encontrado
print('Número de distritos encontrados:', distritos.size());
print(distritos);

// Mostrar no mapa
Map.centerObject(distritos, 8);
Map.addLayer(distritos, {color: 'red'}, 'Búzi e Muanza');

//===================================================
// ---------- NDVI mensal Sentinel-2 (2018-2025) ----------

// Função: remove nuvens/sombras e calcula o NDVI
function prepararS2(img) {
  var scl = img.select('SCL');
  // Mantém só: 4 = vegetação, 5 = solo nu, 6 = água, 7 = não classificado baixo
  var limpo = scl.eq(4).or(scl.eq(5)).or(scl.eq(6)).or(scl.eq(7));
  var ndvi = img.select('B8').divide(10000)
    .subtract(img.select('B4').divide(10000))
    .divide(img.select('B8').divide(10000).add(img.select('B4').divide(10000)))
    .rename('NDVI');
  return ndvi.updateMask(limpo)
    .copyProperties(img, ['system:time_start']);
}

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(distritos)
  .filterDate('2018-01-01', '2026-01-01')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
  .map(prepararS2);

// Teste rápido: quantas imagens foram encontradas?
print('Imagens Sentinel-2:', s2.size());

// Visualizar o NDVI médio de 2024 como teste
var ndvi2024 = s2.filterDate('2024-01-01', '2025-01-01').mean().clip(distritos);
Map.addLayer(ndvi2024, {min: 0, max: 0.9, palette: ['brown', 'yellow', 'green']}, 'NDVI médio 2024');

//=================================================
// ---------- Tabela mensal: NDVI por distrito, ano e mês ----------

var anos = ee.List.sequence(2018, 2025);
var meses = ee.List.sequence(1, 12);

var tabelaNDVI = ee.FeatureCollection(
  anos.map(function(a) {
    return meses.map(function(m) {
      var inicio = ee.Date.fromYMD(a, m, 1);
      var fim = inicio.advance(1, 'month');
      var colecao = s2.filterDate(inicio, fim);
      var nImagens = colecao.size();

      // Se não há imagens nesse mês, usa uma imagem totalmente mascarada
      var vazia = ee.Image(0).rename('NDVI').updateMask(ee.Image(0));
      var composto = ee.Image(ee.Algorithms.If(nImagens.gt(0), colecao.mean(), vazia));

      var reducer = ee.Reducer.mean().combine(ee.Reducer.count(), '', true);

      return composto.select('NDVI').reduceRegions({
        collection: distritos,
        reducer: reducer,
        scale: 100,
        tileScale: 4
      }).map(function(f) {
        return ee.Feature(null, {
          distrito: f.get('ADM2_NAME'),
          ano: a,
          mes: m,
          ndvi_medio: f.get('mean'),
          pixels_validos: f.get('count'),
          n_imagens: nImagens
        });
      });
    });
  }).flatten()
).flatten();
// Exportar a tabela NDVI para o Google Drive (CSV)
Export.table.toDrive({
  collection: tabelaNDVI,
  description: 'ndvi_mensal_buzi_muanza',
  fileNamePrefix: 'ndvi_mensal_buzi_muanza',
  fileFormat: 'CSV',
  selectors: ['distrito', 'ano', 'mes', 'ndvi_medio', 'pixels_validos', 'n_imagens']
});

//=====================================================

// ---------- Precipitação mensal CHIRPS (2018-2025) ----------

var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterBounds(distritos);

var tabelaChuva = ee.FeatureCollection(
  anos.map(function(a) {
    return meses.map(function(m) {
      var inicio = ee.Date.fromYMD(a, m, 1);
      var fim = inicio.advance(1, 'month');
      var chuvaMensal = chirps.filterDate(inicio, fim)
        .select('precipitation').sum().rename('chuva_mm');

      return chuvaMensal.reduceRegions({
        collection: distritos,
        reducer: ee.Reducer.mean(),
        scale: 5566
      }).map(function(f) {
        return ee.Feature(null, {
          distrito: f.get('ADM2_NAME'),
          ano: a,
          mes: m,
          chuva_mm: f.get('mean')
        });
      });
    });
  }).flatten()
).flatten();

Export.table.toDrive({
  collection: tabelaChuva,
  description: 'chuva_mensal_buzi_muanza',
  fileNamePrefix: 'chuva_mensal_buzi_muanza',
  fileFormat: 'CSV',
  selectors: ['distrito', 'ano', 'mes', 'chuva_mm']
});

//=====================================

// ---------- Radar Sentinel-1 mensal (2018-2025) ----------

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(distritos)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .select(['VV', 'VH']);

var vaziaS1 = ee.Image([0, 0]).rename(['VV', 'VH']).updateMask(ee.Image(0));

var tabelaRadar = ee.FeatureCollection(
  anos.map(function(a) {
    return meses.map(function(m) {
      var inicio = ee.Date.fromYMD(a, m, 1);
      var fim = inicio.advance(1, 'month');
      var colecao = s1.filterDate(inicio, fim);
      var nImagens = colecao.size();
      var composto = ee.Image(ee.Algorithms.If(nImagens.gt(0), colecao.mean(), vaziaS1));

      return composto.reduceRegions({
        collection: distritos,
        reducer: ee.Reducer.mean(),
        scale: 100,
        tileScale: 4
      }).map(function(f) {
        return ee.Feature(null, {
          distrito: f.get('ADM2_NAME'),
          ano: a,
          mes: m,
          vv_medio: f.get('VV'),
          vh_medio: f.get('VH'),
          n_imagens: nImagens
        });
      });
    });
  }).flatten()
).flatten();

Export.table.toDrive({
  collection: tabelaRadar,
  description: 'radar_mensal_buzi_muanza',
  fileNamePrefix: 'radar_mensal_buzi_muanza',
  fileFormat: 'CSV',
  selectors: ['distrito', 'ano', 'mes', 'vv_medio', 'vh_medio', 'n_imagens']
});
