/** TERRA.SINAL — interface front-end, sem autenticação real nem ML.NET. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const viewTitles={inicio:['Apresentação','Conhecer o sistema, o território e as três fontes de dados.'],dashboard:['Estado da paisagem','Três fontes de observação. Uma leitura integrada do território.'],mapa:['Mapa de stress','Monitoria geográfica ilustrativa para Búzi e Muanza.'],temporal:['Análise temporal','Comparar a resposta da vegetação às mudanças de chuva e solo.'],recomendacoes:['Apoio à decisão','Recomendações auditáveis por classe de stress.'],modelos:['Modelos de inteligência artificial','Avaliação transparente e comparação de classificadores.'],dados:['Dados e importação','Validação antes da sincronização ambiental.'],historico:['Histórico e auditoria','Registos rastreáveis de recomendações e previsões.'],api:['API e integração .NET','Contratos para implementação futura em ASP.NET Core.']};
 const state={page:'dashboard',region:'Buzi',period:'2026-02',role:'Investigador',mapLayer:'stress',observation:null,charts:{},maps:{},mapLayers:{},sites:[]};
 const BR={Buzi:'Búzi',Muanza:'Muanza'};
 const fmt=(v,d=2)=>Number(v).toLocaleString('pt-PT',{minimumFractionDigits:d,maximumFractionDigits:d});
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const classColor={Saudável:'#69a77a',Ligeiro:'#dec36f',Moderado:'#dca16a',Severo:'#c37660'};
 const shortPeriod=p=>({'2026-01':'Jan. 2026','2026-02':'Fev. 2026','2026-03':'Mar. 2026','2026-04':'Abr. 2026'})[p] || p;
 function toast(message,type='success'){
  const wrap=$('toastArea'); if(!wrap)return;
  const el=document.createElement('div');el.className='toast show align-items-center text-bg-'+(type==='danger'?'danger':type==='warning'?'warning':'success')+' border-0';el.setAttribute('role','status');
  const content=document.createElement('div');content.className='d-flex';const body=document.createElement('div');body.className='toast-body';body.textContent=message;const close=document.createElement('button');close.type='button';close.className='btn-close btn-close-white me-2 m-auto';close.setAttribute('aria-label','Fechar');close.onclick=()=>el.remove();content.append(body,close);el.append(content);wrap.append(el);setTimeout(()=>el.remove(),4800);
 }
 function bind(name,value){document.querySelectorAll('[data-bind="'+name+'"]').forEach(el=>el.textContent=value);}
 function showPage(page){
  if(!viewTitles[page])page='dashboard';state.page=page;
  document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===page;el.hidden=!active;el.classList.toggle('is-visible',active)});
  document.querySelectorAll('.nav-item').forEach(el=>{const on=el.dataset.page===page;el.classList.toggle('is-active',on);el.setAttribute('aria-current',on?'page':'false')});
  $('crumb').textContent=viewTitles[page][0];$('pageTitle').textContent=viewTitles[page][0];$('pageSub').textContent=viewTitles[page][1];
  $('globalFilters').style.display=['inicio','api','modelos','dados','historico'].includes(page)?'none':'flex';
  $('sidebar').classList.remove('is-open');$('mobileShade').classList.remove('active');window.scrollTo({top:0,behavior:'instant'});
  if(page==='dashboard'){drawDashboardChart();ensureMap('dashboardMap');}
  if(page==='mapa'){ensureMap('largeMap');updateMap();}
  if(page==='temporal')drawTemporalCharts();
  if(page==='historico')renderHistory();
  if(page==='dados')updateAdminView();
 }
 function navigate(page){if(location.hash.slice(1)!==page)location.hash=page;else showPage(page)}
 function reflect(obs){
  state.observation=obs;const rule=window.TERRA_MOCK.rules[obs.stressClass];
  bind('region',BR[obs.region]);bind('periodText',shortPeriod(obs.period));bind('ndvi',fmt(obs.ndvi));bind('ndviAnomaly',(obs.ndviAnomaly<0?'−':'+')+fmt(Math.abs(obs.ndviAnomaly)));bind('rainfall',fmt(obs.rainfall,0));bind('rainAnomaly',(obs.rainAnomaly<0?'−':'+')+fmt(Math.abs(obs.rainAnomaly*100),0)+'%');bind('soilMoisture',fmt(obs.soilMoisture));bind('rainLag',fmt(obs.rainLag,0));bind('soilLag',fmt(obs.soilLag));bind('stressClass',obs.stressClass==='Saudável'?'Vegetação saudável':'Stress '+obs.stressClass.toLowerCase());bind('recommendation',rule.text);bind('ruleId',rule.id);bind('modelVersion',window.TERRA_MOCK.modelVersion);bind('ndviEvidence',fmt(obs.ndvi)+' / '+(obs.ndviAnomaly<0?'−':'+')+fmt(Math.abs(obs.ndviAnomaly)));bind('rainEvidence',fmt(obs.rainfall,0)+' / '+fmt(obs.rainLag,0)+' mm');
  const stressBox=document.querySelector('.decision-condition'); if(stressBox){stressBox.style.borderLeft='4px solid '+classColor[obs.stressClass]}
  drawDashboardChart();if(state.page==='temporal')drawTemporalCharts();if(state.page==='mapa')updateMap();
 }
 async function refresh(){try{reflect(await window.TERRA_API.observations(state.region,state.period))}catch(err){toast(err.message,'danger')}}
 function createChart(id,config){const canvas=$(id);if(!canvas||canvas.closest('[hidden]'))return;if(typeof Chart==='undefined'){drawFallbackChart(id,config);return;}const old=canvas.parentElement.querySelector('.fallback-svg');if(old)old.remove();canvas.style.display='';const prev=state.charts[id];if(prev)prev.destroy();state.charts[id]=new Chart(canvas,config)}
 function drawFallbackChart(id,config){
  const canvas=$(id),holder=canvas.parentElement;const old=holder.querySelector('.fallback-svg');if(old)old.remove();canvas.style.display='none';
  const labels=config.data.labels||[],series=config.data.datasets||[];
  const vals=series.flatMap(d=>d.data.map(Number).filter(Number.isFinite));const min=Number.isFinite(config.options?.scales?.y?.min)?config.options.scales.y.min:Math.min(0,...vals),max=Number.isFinite(config.options?.scales?.y?.max)?config.options.scales.y.max:Math.max(...vals);
  const width=640,height=250,left=44,right=16,top=18,bottom=50;const cw=width-left-right,ch=height-top-bottom;
  const x=i=>left+(labels.length<=1?0.5:i/(labels.length-1))*cw,y=v=>top+ch-(v-min)/(max-min||1)*ch;
  let output=`<svg class="fallback-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico ilustrativo">`;
  for(let i=0;i<=4;i++){const yy=top+i*ch/4;output+=`<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#e9eee8"/><text x="${left-9}" y="${yy+3}" font-size="10" fill="#92a595" text-anchor="end">${fmt(max-i*(max-min)/4,1)}</text>`}
  labels.forEach((str,i)=>{output+=`<text x="${x(i)}" y="${height-25}" font-size="12" text-anchor="middle" fill="#8aa18e">${esc(str)}</text>`});
  series.forEach((d,si)=>{const color=d.borderColor||d.backgroundColor||'#648f70';if(config.type==='bar'){d.data.forEach((v,i)=>{const barwidth=Math.min(70,cw/(labels.length*2));output+=`<rect x="${x(i)-barwidth/2}" y="${y(v)}" width="${barwidth}" height="${top+ch-y(v)}" rx="5" fill="${color}" opacity=".9"/>`})}else{const poly=d.data.map((v,i)=>`${x(i)},${y(v)}`).join(' ');output+=`<polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${poly}"/>`;d.data.forEach((v,i)=>output+=`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${color}" stroke="white" stroke-width="2"/>`)}});
  output+='</svg>';holder.insertAdjacentHTML('beforeend',output);
 }

 function commonChartOptions(yMin,yMax){return {responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',font:{size:10},color:'#819588'}},tooltip:{backgroundColor:'#1c3e32'}},scales:{x:{grid:{display:false},ticks:{color:'#90a194',font:{size:10}}},y:{min:yMin,max:yMax,grid:{color:'#eff1ea'},ticks:{color:'#90a194',font:{size:10}}}}}}
 const palette={ndvi:'#588c64',rain:'#c79f5e',soil:'#7197aa',anomaly:'#ca8364'};
 const line=(label,data,color,fill=false)=>({label,data,borderColor:color,backgroundColor:color,borderWidth:2.5,tension:.33,fill,pointRadius:3,pointHoverRadius:5});
 function drawDashboardChart(){if(state.page!=='dashboard')return;window.TERRA_API.timeSeries(state.region).then(rows=>{if(state.page!=='dashboard')return;createChart('dashboardChart',{type:'line',data:{labels:rows.map(r=>shortPeriod(r.period).split(' ')[0]),datasets:[line('NDVI',rows.map(r=>r.ndvi),palette.ndvi),line('Chuva normalizada',rows.map(r=>r.rainfall/100),palette.rain),line('Humidade do solo',rows.map(r=>r.soilMoisture),palette.soil)]},options:commonChartOptions(0,.85)})}).catch(()=>{});}
 function drawTemporalCharts(){window.TERRA_API.timeSeries(state.region).then(rows=>{if(state.page!=='temporal')return;const labels=rows.map(r=>shortPeriod(r.period).split(' ')[0]);createChart('ndviChart',{type:'line',data:{labels,datasets:[line('NDVI',rows.map(r=>r.ndvi),palette.ndvi),line('Anomalia',rows.map(r=>r.ndviAnomaly),palette.anomaly)]},options:commonChartOptions(-.3,.85)});createChart('rainChart',{type:'bar',data:{labels,datasets:[{label:'Chuva (mm)',data:rows.map(r=>r.rainfall),backgroundColor:'#c7a36b',borderRadius:6}]},options:commonChartOptions(0,100)});createChart('soilChart',{type:'line',data:{labels,datasets:[line('Humidade do solo',rows.map(r=>r.soilMoisture),palette.soil)]},options:commonChartOptions(0,.5)})}).catch(()=>{});}
 function mapMarker(site,layer){const color=layer==='ndvi'?(site.ndvi>=.6?'#69a77a':site.ndvi>=.5?'#dca16a':'#c37660'):layer==='soil'?(site.soilMoisture>=.30?'#69a77a':site.soilMoisture>=.22?'#dca16a':'#c37660'):classColor[site.stressClass];return color;}
 function buildFallbackMap(id){
  const target=$(id);if(!target)return;
  const shown=state.sites.filter(s=>id==='largeMap'||s.region===state.region);
  const pctX=site=>Math.max(9,Math.min(91,((site.lng-34.32)/.74)*100));
  const pctY=site=>Math.max(12,Math.min(88,(((-18.63)-site.lat)/1.57)*100));
  target.innerHTML=`<div class="offline-map"><div class="offline-river"></div><span class="offline-map-label">SOFALA / ZONAS ILUSTRATIVAS</span><span class="offline-region" style="top:18%;left:68%">MUANZA</span><span class="offline-region" style="top:74%;left:25%">BÚZI</span><small class="offline-map-info">Mapa esquemático · sem limites oficiais</small></div>`;
  const inner=target.querySelector('.offline-map');shown.forEach(site=>{const b=document.createElement('button');b.type='button';b.className='offline-pin';b.style.left=pctX(site)+'%';b.style.top=pctY(site)+'%';b.style.background=mapMarker(site,state.mapLayer);b.title=site.label+' · '+site.stressClass+' · NDVI '+fmt(site.ndvi);b.setAttribute('aria-label',b.title);b.onclick=()=>toast(b.title);inner.append(b)});
 }
 
 function ensureMap(id){
  if(!$(id))return;
  if(typeof L==='undefined'){buildFallbackMap(id);return;}
  if(!state.maps[id]){
   $(id).innerHTML='';const map=L.map(id,{zoomControl:true,scrollWheelZoom:false}).setView([-19.35,34.73],8);state.maps[id]=map;
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:16,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  }
  updateMap(id);setTimeout(()=>state.maps[id]&&state.maps[id].invalidateSize(),100);
 }
 function updateMap(singleId){if(typeof L==='undefined'){(singleId?[singleId]:['dashboardMap','largeMap']).forEach(id=>{if($(id))buildFallbackMap(id)});renderMapSites();return;}const ids=singleId?[singleId]:Object.keys(state.maps);ids.forEach(id=>{
  const map=state.maps[id];if(!map)return;
  if(state.mapLayers[id])state.mapLayers[id].forEach(layer=>map.removeLayer(layer));state.mapLayers[id]=[];
  state.sites.filter(site=>id==='largeMap'||site.region===state.region).forEach(site=>{
    const color=mapMarker(site,state.mapLayer);
    const circle=L.circleMarker([site.lat,site.lng],{radius:id==='largeMap'?15:12,color:'#fff',weight:3,fillColor:color,fillOpacity:.86}).bindPopup(`<strong>${esc(site.label)}</strong><br>Classe: ${esc(site.stressClass)}<br>NDVI: ${fmt(site.ndvi)}<br>Humidade: ${fmt(site.soilMoisture)}<br><small>Dados ilustrativos</small>`).addTo(map);
    state.mapLayers[id].push(circle);
  });
  if(id==='dashboardMap')map.setView(state.region==='Buzi'?[-19.89,34.59]:[-18.91,34.79],9);
  else map.setView([-19.35,34.73],8);
 });renderMapSites()}
 function renderMapSites(){const el=$('mapSiteList');if(!el)return;el.innerHTML='';state.sites.forEach(site=>{const b=document.createElement('button');b.className='site-row';b.type='button';const c=mapMarker(site,state.mapLayer);b.innerHTML=`<i class="legend-dot" style="background:${c}"></i><span><b>${esc(site.label)}</b><small>${esc(site.stressClass)} · NDVI ${fmt(site.ndvi)}</small></span><i class="bi bi-arrow-up-right"></i>`;b.onclick=()=>{const map=state.maps.largeMap;if(map){map.setView([site.lat,site.lng],11);const item=state.mapLayers.largeMap.find(x=>x.getLatLng().lat===site.lat);if(item)item.openPopup()}};el.append(b)})}
 function keyHistory(){return 'terra-sinal-demo-history-v1'}
 function readStored(){try{const v=JSON.parse(localStorage.getItem(keyHistory())||'[]');return Array.isArray(v)?v:[]}catch{return []}}
 function historyList(){return [...readStored(),...window.TERRA_MOCK.seededHistory].sort((a,b)=>String(b.recordedAt).localeCompare(String(a.recordedAt)))}
 function renderHistory(){const rows=historyList(),root=$('historyBody');if(!root)return;root.innerHTML='';$('historyCount').textContent=rows.length+' registos';rows.forEach(r=>{const tr=document.createElement('tr');const severity=(r.stressClass==='Severo'?'class-severe':r.stressClass==='Saudável'?'class-healthy':'');tr.innerHTML=`<td>${esc(r.recordedAt)}<br><small>${esc(r.period)}</small></td><td>${esc(BR[r.region]||r.region)}</td><td><span class="class-tag ${severity}">${esc(r.stressClass)}</span></td><td>${esc(r.ruleId)}</td><td>${esc(r.modelVersion)}</td><td>${esc(r.status)}</td>`;root.append(tr)})}
 function recordDecision(){if(!state.observation)return;const obs=state.observation;const note=$('decisionNote').value.trim();const records=readStored();records.unshift({id:'LOCAL-'+Date.now(),recordedAt:new Date().toISOString().slice(0,10),period:obs.period,region:obs.region,stressClass:obs.stressClass,ruleId:window.TERRA_MOCK.rules[obs.stressClass].id,modelVersion:window.TERRA_MOCK.modelVersion,status:'Registo local',note,indicators:{ndvi:obs.ndvi,rainfall:obs.rainfall,soilMoisture:obs.soilMoisture}});try{localStorage.setItem(keyHistory(),JSON.stringify(records.slice(0,100)));$('decisionNote').value='';toast('Análise guardada localmente. A persistência real será no backend ASP.NET.')}catch{toast('Não foi possível guardar no navegador.','danger')}}
 const csvEncode=rows=>rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const download=(content,name,mime='text/csv;charset=utf-8')=>{const blob=new Blob(['\ufeff',content],{type:mime});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 function exportObservations(){window.TERRA_API.timeSeries(state.region).then(rows=>download(csvEncode([['date','region','ndvi','ndviAnomaly','rainfall','rainAnomaly','soilMoisture','rainLag','soilLag','stressClass','source'],...rows.map(r=>[r.period,r.region,r.ndvi,r.ndviAnomaly,r.rainfall,r.rainAnomaly,r.soilMoisture,r.rainLag,r.soilLag,r.stressClass,r.source])]),`terra-sinal-${state.region.toLowerCase()}-observacoes-demo.csv`)).catch(e=>toast(e.message,'danger'))}
 function exportHistory(){download(csvEncode([['date','period','region','stressClass','ruleId','modelVersion','status','note'],...historyList().map(r=>[r.recordedAt,r.period,r.region,r.stressClass,r.ruleId,r.modelVersion,r.status,r.note||''])]),'terra-sinal-auditoria-demo.csv')}
 function updateAdminView(){const allowed=state.role==='Administrador';$('adminGate').hidden=allowed;$('adminContent').hidden=!allowed;$('roleLabel').textContent=state.role+' · Demo';$('roleAvatar').textContent=state.role==='Administrador'?'A':'I'}
 function csvRead(text){
  // Parser simples de CSV com suporte a campos delimitados por aspas e quebras de linha.
  const lines=[];let row=[],current='',inside=false;
  for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(inside&&text[i+1]==='"'){current+='"';i++}else inside=!inside;}else if(c===','&&!inside){row.push(current);current=''}else if((c==='\n'||c==='\r')&&!inside){if(c==='\r'&&text[i+1]==='\n')i++;row.push(current);if(row.some(x=>x.trim()!==''))lines.push(row);row=[];current=''}else current+=c}
  if(inside)throw new Error('CSV inválido: aspas não fechadas.');row.push(current);if(row.some(x=>x.trim()!==''))lines.push(row);if(!lines.length)return [];
  const headers=lines.shift().map(s=>s.trim());return lines.map((r,index)=>{const obj={_row:index+2};headers.forEach((h,i)=>{obj[h]=r[i]??''});return obj});
 }
 const requiredBySource={NDVI:['date','region','ndvi'],Sentinel1:['date','region','soilMoisture'],CHIRPS:['date','region','rainfall'],Integrado:['date','region','ndvi','rainfall','soilMoisture']};
 function validateRows(rows,source){const required=requiredBySource[source];const errors=[],warnings=[],keys=new Set();
  if(!Array.isArray(rows))return {valid:0,errors:['O ficheiro deve conter um array JSON ou uma tabela CSV.'],warnings:[]};
  if(rows.length>5000)return {valid:0,errors:['Limite de 5000 linhas na pré-validação do navegador.'],warnings:[]};
  for(let i=0;i<rows.length;i++){
   const row=rows[i],idx=row._row||i+1;
   if(!row||typeof row!=='object'||Array.isArray(row)){errors.push('Linha '+idx+': objecto inválido');continue}
   const missing=required.filter(k=>row[k]==null||String(row[k]).trim()==='');if(missing.length)errors.push(`Linha ${idx}: campos obrigatórios em falta (${missing.join(', ')})`);
   const date=String(row.date||'');if(date&&!/^\d{4}-(0[1-9]|1[0-2])(?:-([0-2]\d|3[01]))?$/.test(date))errors.push(`Linha ${idx}: data inválida, usar AAAA-MM ou AAAA-MM-DD`);
   const reg=String(row.region||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(reg&&!['buzi','muanza'].includes(reg))errors.push(`Linha ${idx}: região fora de Búzi/Muanza`);
   const coordinates=['latitude','longitude'];coordinates.forEach((k,j)=>{if(row[k]!=null&&String(row[k]).trim()!==''){const n=Number(row[k]);if(!Number.isFinite(n)||Math.abs(n)>(j===0?90:180))errors.push(`Linha ${idx}: ${k} fora do intervalo`)}});
   const limits={ndvi:[-1,1],ndviAnomaly:[-2,2],soilMoisture:[0,1],rainfall:[0,1500],rainLag:[0,1500],rainAnomaly:[-5,5]};Object.entries(limits).forEach(([k,[min,max]])=>{if(row[k]===undefined||String(row[k]).trim()==='')return;const n=Number(row[k]);if(!Number.isFinite(n)||n<min||n>max)errors.push(`Linha ${idx}: ${k} fora do intervalo de validação (${min} a ${max})`)});
   const key=[reg,date,row.latitude||'',row.longitude||''].join('|');if(keys.has(key))errors.push(`Linha ${idx}: duplicado de região/data/coordenadas`);keys.add(key);
   if(source==='NDVI'&&row.ndviAnomaly==null)warnings.push(`Linha ${idx}: sem anomalia NDVI; calcular no servidor com climatologia explícita`);
   if(source==='CHIRPS'&&row.rainAnomaly==null)warnings.push(`Linha ${idx}: sem anomalia de chuva; calcular no servidor com climatologia explícita`);
  }
  return {valid:rows.length,errors,warnings};
 }
 async function validateImport(){const file=$('datasetFile').files[0],source=$('datasetSource').value,box=$('validationResult');if(!file){toast('Seleccione primeiro um ficheiro.','warning');return}if(file.size>3*1024*1024){toast('Ficheiro superior a 3 MB no protótipo.','danger');return}if(!/\.(csv|json)$/i.test(file.name)){toast('Só são aceites ficheiros CSV ou JSON.','danger');return}
  try{const text=await file.text();let rows=/\.json$/i.test(file.name)?JSON.parse(text):csvRead(text);if(rows&&Array.isArray(rows.observations))rows=rows.observations;const result=validateRows(rows,source);box.replaceChildren();box.classList.remove('empty-validation');const message=document.createElement('div');message.className='validation-summary'+(result.errors.length?' validation-error':'');message.textContent=`${result.valid} linha(s) analisada(s) · ${result.errors.length} erro(s) · ${result.warnings.length} aviso(s). ${!result.errors.length?'Pré-validação concluída; nenhum dado foi importado.':'Corrigir os problemas antes da importação.'}`;box.append(message);const list=document.createElement('ul');list.className='validation-list';[...result.errors.slice(0,15).map(t=>'ERRO: '+t),...result.warnings.slice(0,8).map(t=>'AVISO: '+t)].forEach(message=>{const li=document.createElement('li');li.textContent=message;list.append(li)});box.append(list);if(result.errors.length>15||result.warnings.length>8){const more=document.createElement('p');more.className='small-footnote';more.textContent='A lista foi limitada na interface; reveja todo o ficheiro.';box.append(more)}if(!result.errors.length)toast('Pré-validação concluída. A importação persistente exige backend ASP.NET.');}
  catch(err){box.textContent='Erro: '+err.message;toast('Não foi possível interpretar o ficheiro.','danger')}
 }
 function sampleCsv(){const src=$('datasetSource').value;const sample={NDVI:[['date','region','ndvi','ndviAnomaly','latitude','longitude'],['2026-02','Buzi','0.41','-0.20','-19.89','34.59']],Sentinel1:[['date','region','soilMoisture','latitude','longitude'],['2026-02','Buzi','0.15','-19.89','34.59']],CHIRPS:[['date','region','rainfall','rainAnomaly','latitude','longitude'],['2026-02','Buzi','19','-0.31','-19.89','34.59']],Integrado:[['date','region','ndvi','ndviAnomaly','rainfall','rainAnomaly','soilMoisture','rainLag','latitude','longitude'],['2026-02','Buzi','0.41','-0.20','19','-0.31','0.15','38','-19.89','34.59']]};download(csvEncode(sample[src]),'terra-sinal-amostra-'+src.toLowerCase()+'.csv')}

 /* ========== Agente de IA Python (via ASP.NET) ========== */
 async function loadAiMetrics(){
  const pill=$('aiStatusPill'), agentPill=$('aiAgentPill');
  try{
   const health=await TERRA_API.aiHealth();
   if(health && (health.status==='ok'||health.modelLoaded)){
    if(pill){pill.textContent='ONLINE · '+ (health.version||'ok'); pill.className='pill pill-green';}
    if(agentPill){agentPill.textContent='AGENTE PYTHON ONLINE'; agentPill.className='pill pill-green';}
   }else{
    if(pill){pill.textContent='OFFLINE'; pill.className='pill pill-neutral';}
    if(agentPill){agentPill.textContent='AGENTE INDISPONÍVEL'; agentPill.className='pill pill-neutral';}
   }
  }catch(e){
   if(pill){pill.textContent='OFFLINE'; pill.className='pill pill-neutral';}
   if(agentPill){agentPill.textContent='AGENTE INDISPONÍVEL'; agentPill.className='pill pill-neutral';}
  }
  try{
   const m=await TERRA_API.modelMetrics();
   if(!m || m.demo) return;
   const fmt=v=> (typeof v==='number'? v.toFixed(3).replace('.',','): '—');
   if($('aiAcc')) $('aiAcc').textContent=fmt(m.accuracy);
   if($('aiPrec')) $('aiPrec').textContent=fmt(m.precision);
   if($('aiRec')) $('aiRec').textContent=fmt(m.recall);
   if($('aiF1')) $('aiF1').textContent=fmt(m.f1);
   if($('aiVer')) $('aiVer').textContent=m.version||'—';
   // Matriz de confusão
   const cm=m.confusionMatrix;
   if(cm && Array.isArray(cm) && cm.length===4){
    const tbody=$('aiConfusionTable') && $('aiConfusionTable').querySelector('tbody');
    if(tbody){
     tbody.innerHTML='';
     const labels=['Saud.','Lig.','Mod.','Sev.'];
     cm.forEach((row,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<th>${labels[i]}</th>`+row.map((v,j)=>`<td class="${i===j?'heat-high':''}">${v}</td>`).join('');
      tbody.append(tr);
     });
    }
   }
  }catch(e){ console.warn('Métricas do agente IA:', e.message); }
 }

 async function runAiVerify(){
  const resultEl=$('aiVerifyResult'), notesEl=$('aiNotesBox');
  if(!state.observation){ toast('Seleccione primeiro uma região e período no dashboard.','warning'); return; }
  const obs=state.observation;
  resultEl.textContent='A verificar…';
  if(notesEl) notesEl.style.display='none';
  try{
   const res=await TERRA_API.aiVerify({
    region: obs.region, period: obs.period,
    ndvi: obs.ndvi, ndviAnomaly: obs.ndviAnomaly,
    rainfall: obs.rainfall, rainAnomaly: obs.rainAnomaly,
    soilMoisture: obs.soilMoisture, rainLag: obs.rainLag, soilLag: obs.soilLag
   });
   const conf=(res.confidence*100).toFixed(1).replace('.',',');
   resultEl.innerHTML=`<strong>${esc(res.stressClass)}</strong> · confiança ${conf}% · modelo ${esc(res.modelVersion||'')}`;
   if(notesEl && res.verificationNotes && res.verificationNotes.length){
    notesEl.style.display='block';
    notesEl.innerHTML='<ul style="margin:.25rem 0 0 1.1rem;padding:0">'+
      res.verificationNotes.map(n=>`<li>${esc(n)}</li>`).join('')+'</ul>';
   }
   toast('Verificação meteorológica concluída pelo Agente de IA.');
  }catch(e){
   resultEl.textContent='Falha: '+e.message;
   toast('Não foi possível contactar o Agente de IA.','danger');
  }
 }

 async function init(){
  if(!$('regionSelect')||!$('sideNav'))return;
  state.sites=await window.TERRA_API.mapSites().catch(()=>[]);
  $('regionSelect').addEventListener('change',ev=>{state.region=ev.target.value;refresh()});$('periodSelect').addEventListener('change',ev=>{state.period=ev.target.value;refresh()});$('mapLayer').addEventListener('change',ev=>{state.mapLayer=ev.target.value;updateMap()});
  if(typeof bootstrap==='undefined'){$('accountBtn').addEventListener('click',()=>{$('accountModal').classList.add('show');$('accountModal').setAttribute('aria-hidden','false')});$('accountModal').querySelector('.btn-close').addEventListener('click',()=>{$('accountModal').classList.remove('show');$('accountModal').setAttribute('aria-hidden','true')});$('accountModal').addEventListener('click',ev=>{if(ev.target===$('accountModal')){$('accountModal').classList.remove('show');$('accountModal').setAttribute('aria-hidden','true')}})};
  $('menuBtn').addEventListener('click',()=>{$('sidebar').classList.toggle('is-open');$('mobileShade').classList.toggle('active')});$('mobileShade').addEventListener('click',()=>{$('sidebar').classList.remove('is-open');$('mobileShade').classList.remove('active')});
  document.querySelectorAll('[data-navigate]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.navigate)));
  window.addEventListener('hashchange',()=>showPage(location.hash.substring(1)));
  $('exportBtn').addEventListener('click',exportObservations);$('exportHistory').addEventListener('click',exportHistory);$('recordDecision').addEventListener('click',recordDecision);$('validateBtn').addEventListener('click',validateImport);$('sampleBtn').addEventListener('click',sampleCsv);
  $('goAdmin').addEventListener('click',()=>{if(window.bootstrap)bootstrap.Modal.getOrCreateInstance($('accountModal')).show();else $('accountBtn').click()});
  $('trainBtn').addEventListener('click',()=>toast('O treino real estará disponível apenas no backend ML.NET, com autorização de administrador.','warning'));
  if($('aiVerifyBtn')) $('aiVerifyBtn').addEventListener('click',runAiVerify);
  loadAiMetrics();
  document.querySelectorAll('[data-role]').forEach(btn=>btn.addEventListener('click',()=>{state.role=btn.dataset.role;updateAdminView();if(window.bootstrap)bootstrap.Modal.getOrCreateInstance($('accountModal')).hide();else {$('accountModal').classList.remove('show');$('accountModal').setAttribute('aria-hidden','true');}toast('Perfil de demonstração alterado para '+state.role+'. Não é autenticação real.')}));
  $('regionSelect').value=state.region;$('periodSelect').value=state.period;updateAdminView();await refresh();showPage(location.hash.slice(1)||'dashboard');
 }
 document.addEventListener('DOMContentLoaded',init);
})();
