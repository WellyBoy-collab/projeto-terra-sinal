/**
 * Dados SINTÉTICOS para demonstração de interface. Três registos replicam
 * os exemplos da secção 4.4 do enunciado (Búzi Jan/Fev, Muanza Jan).
 * Os restantes valores são inteiramente ilustrativos. Não são observações
 * validadas, medições em tempo real nem previsões de um modelo ML.NET.
 */
window.TERRA_MOCK = Object.freeze({
  modelVersion: 'v0.3-demo',
  updatedAt: '2026-04-30',
  observations: [
    {id:'OBS-001', region:'Buzi',period:'2026-01',ndvi:.52,ndviAnomaly:-.11,rainfall:38,rainAnomaly:-.18,soilMoisture:.21,rainLag:46,soilLag:.24,stressClass:'Moderado',confidence:null,source:'Enunciado §4.4'},
    {id:'OBS-002', region:'Buzi',period:'2026-02',ndvi:.41,ndviAnomaly:-.20,rainfall:19,rainAnomaly:-.31,soilMoisture:.15,rainLag:38,soilLag:.21,stressClass:'Severo',confidence:null,source:'Enunciado §4.4'},
    {id:'OBS-003', region:'Buzi',period:'2026-03',ndvi:.44,ndviAnomaly:-.16,rainfall:24,rainAnomaly:-.27,soilMoisture:.17,rainLag:19,soilLag:.15,stressClass:'Moderado',confidence:null,source:'Dados sintéticos'},
    {id:'OBS-004', region:'Buzi',period:'2026-04',ndvi:.50,ndviAnomaly:-.10,rainfall:45,rainAnomaly:-.12,soilMoisture:.23,rainLag:24,soilLag:.17,stressClass:'Ligeiro',confidence:null,source:'Dados sintéticos'},
    {id:'OBS-005', region:'Muanza',period:'2026-01',ndvi:.66,ndviAnomaly:.02,rainfall:73,rainAnomaly:.04,soilMoisture:.34,rainLag:81,soilLag:.36,stressClass:'Saudável',confidence:null,source:'Enunciado §4.4'},
    {id:'OBS-006', region:'Muanza',period:'2026-02',ndvi:.60,ndviAnomaly:-.04,rainfall:62,rainAnomaly:-.08,soilMoisture:.29,rainLag:73,soilLag:.34,stressClass:'Ligeiro',confidence:null,source:'Dados sintéticos'},
    {id:'OBS-007', region:'Muanza',period:'2026-03',ndvi:.58,ndviAnomaly:-.08,rainfall:53,rainAnomaly:-.15,soilMoisture:.25,rainLag:62,soilLag:.29,stressClass:'Moderado',confidence:null,source:'Dados sintéticos'},
    {id:'OBS-008', region:'Muanza',period:'2026-04',ndvi:.64,ndviAnomaly:.01,rainfall:78,rainAnomaly:.08,soilMoisture:.33,rainLag:53,soilLag:.25,stressClass:'Saudável',confidence:null,source:'Dados sintéticos'}
  ],
  mapSites: [
    {id:'B-01',region:'Buzi',lat:-19.89,lng:34.59,label:'Búzi · ponto ilustrativo 01',stressClass:'Severo',ndvi:.41,soilMoisture:.15},
    {id:'B-02',region:'Buzi',lat:-19.98,lng:34.43,label:'Búzi · ponto ilustrativo 02',stressClass:'Moderado',ndvi:.49,soilMoisture:.19},
    {id:'B-03',region:'Buzi',lat:-19.78,lng:34.72,label:'Búzi · ponto ilustrativo 03',stressClass:'Ligeiro',ndvi:.57,soilMoisture:.26},
    {id:'M-01',region:'Muanza',lat:-18.91,lng:34.79,label:'Muanza · ponto ilustrativo 01',stressClass:'Saudável',ndvi:.66,soilMoisture:.34},
    {id:'M-02',region:'Muanza',lat:-18.79,lng:34.72,label:'Muanza · ponto ilustrativo 02',stressClass:'Ligeiro',ndvi:.61,soilMoisture:.30},
    {id:'M-03',region:'Muanza',lat:-19.06,lng:34.89,label:'Muanza · ponto ilustrativo 03',stressClass:'Moderado',ndvi:.55,soilMoisture:.24}
  ],
  seededHistory: [
    {id:'H-001',recordedAt:'2026-01-31',period:'2026-01',region:'Buzi',stressClass:'Moderado',ruleId:'R03',modelVersion:'v0.3-demo',status:'Exemplo'},
    {id:'H-002',recordedAt:'2026-02-28',period:'2026-02',region:'Buzi',stressClass:'Severo',ruleId:'R04',modelVersion:'v0.3-demo',status:'Exemplo'},
    {id:'H-003',recordedAt:'2026-01-31',period:'2026-01',region:'Muanza',stressClass:'Saudável',ruleId:'R01',modelVersion:'v0.3-demo',status:'Exemplo'}
  ],
  rules: {
    'Saudável': {id:'R01',text:'Manter a monitoria normal e apresentar a próxima data prevista de actualização.'},
    'Ligeiro': {id:'R02',text:'Aumentar a frequência de observação e acompanhar a tendência de precipitação e humidade do solo.'},
    'Moderado': {id:'R03',text:'Sinalizar necessidade de análise técnica e comparar NDVI, chuva e solo com períodos anteriores.'},
    'Severo': {id:'R04',text:'Gerar alerta de prioridade elevada, destacar a região e verificar a evolução dos indicadores nos períodos seguintes.'}
  }
});
