const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('pt-BR');
const pct=n=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
let mapResults={}, cityResults=[], mapPending=false, cityPending=null;
let states={}, data=null, role='3', pending=false, version=0, seconds=30;
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function track(value){const e=node('div',undefined,'track'), fill=node('div',undefined,'fill');fill.style.width=Math.max(0,Math.min(100,value))+'%';e.append(fill);return e;}
function render(target,result,query=''){
 const root=$(target);root.replaceChildren();
 if(!result){root.append(node('p','Consultando os dados do TSE…','empty'));return;}
 if(result.warning)root.append(node('p',result.warning+(result.available?' Exibindo os últimos dados recebidos.':''),'warning'));
 if(!result.available){root.append(node('p','Aguardando dados oficiais para esta disputa.','empty'));return;}
 const line=node('div',undefined,'statusline');line.append(node('span',result.status,'badge'));
 if(result.source){const a=node('a','JSON do TSE ↗');a.href=result.source;a.target='_blank';a.rel='noopener';line.append(a);}root.append(line);
 const head=node('div',undefined,'progresshead');head.append(node('span','Urnas apuradas (seções totalizadas)'),node('strong',pct(result.progress)));root.append(head,track(result.progress),node('p',fmt.format(result.sections)+' de '+fmt.format(result.total_sections)+' seções','sectioncount'));
 const list=node('div',undefined,'candidate-list');const q=query.toLocaleLowerCase('pt-BR');const candidates=result.candidates.filter(c=>(c.name+' '+c.party+' '+c.number).toLocaleLowerCase('pt-BR').includes(q));
 for(const c of candidates){const row=node('div',undefined,'candidate'), main=node('div',undefined,'candidate-main'), info=node('div',undefined,'candidate-info'), votes=node('div',undefined,'votes');
 if(c.photo){const img=node('img',undefined,'avatar');img.src=c.photo;img.alt='';img.loading='lazy';img.addEventListener('error',()=>img.remove(),{once:true});main.append(img);}
 info.append(node('div',c.name,'candidate-name'),node('div',[c.party,c.number,c.status,c.destination].filter(Boolean).join(' · '),'candidate-meta'));
 votes.append(node('strong',pct(c.percent)),node('span',fmt.format(c.votes)+' votos'));main.append(info,votes);row.append(main,track(c.percent));if(['president','state-president','local-president'].includes(target)){row.style.setProperty('--candidate-color',candidateColor(c));row.classList.add('presidential-candidate');}list.append(row);}
 if(!candidates.length)list.append(node('p',q?'Nenhum candidato encontrado.':'Candidatos ainda não publicados.','empty'));root.append(list);
 const summary=node('div',undefined,'summary');for(const [label,key] of [['Válidos','valid'],['Brancos','blank'],['Nulos','null']]){const item=node('div');item.append(node('span',label),node('strong',fmt.format(result[key])));summary.append(item);}root.append(summary);
 root.append(node('p','Arquivo gerado: '+result.updated+(result.totalized?' · Totalização: '+result.totalized:''),'timestamp'));
}
function renderProgress(target,label,result){
 const root=$(target);root.replaceChildren(node('span',label,'eyebrow'));
 if(!result?.available){root.append(node('p',result?.warning||'Consultando apuração…','sectioncount'));return;}
 const head=node('div',undefined,'progresshead');head.append(node('span','Urnas apuradas'),node('strong',pct(result.progress)));root.append(head,track(result.progress),node('p',fmt.format(result.sections)+' de '+fmt.format(result.total_sections)+' seções totalizadas','sectioncount'));
 if(result.warning)root.append(node('p',result.warning+' Exibindo os últimos dados recebidos.','warning'));
}
function renderScopeProgress(){
 renderProgress('state-progress','ESTADO · '+(states[$('state').value]||$('state').value),data?.state_president);
 $('city-progress').hidden=!$('municipality').value;
 if($('municipality').value)renderProgress('city-progress','CIDADE · '+$('municipality').selectedOptions[0].textContent,data?.local_president);
}
function renderRegional(){render('regional',data?.regional[role],$('search').value);}
async function json(url){const r=await fetch(url);if(!r.ok)throw Error('Falha na consulta. Tente atualizar novamente.');return r.json();}
async function refresh(){
 if(pending)return;pending=true;$('refresh').disabled=true;const current=version;
 $('connection').textContent='Consultando fonte oficial';
 try{const params=new URLSearchParams({uf:$('state').value,municipality:$('municipality').value});const fresh=await json('/api/results?'+params);
 if(current!==version)return;data=fresh;render('president',data.president);render('state-president',data.state_president);renderScopeProgress();renderRegional();refreshColors();$('local').hidden=!data.local_president;if(data.local_president)render('local-president',data.local_president);
 const results=[data.president,...Object.values(data.regional),data.state_president,data.local_president].filter(Boolean);$('connection').textContent=results.some(r=>r.warning)?'Fonte com pendências':'Dados oficiais consultados';seconds=30;
 }catch(e){if(current===version){$('notice').hidden=false;$('notice').textContent=e.message+' Os dados anteriores, quando disponíveis, foram mantidos.';$('connection').textContent='Falha na atualização';}}
 finally{pending=false;$('refresh').disabled=false;if(current!==version)refresh();}
}
function scope(){const state=states[$('state').value]||'Acre';const municipal=$('municipality').selectedOptions[0]?.textContent||'Todo o estado';$('state-title').textContent=state;$('state-president-label').textContent=state.toUpperCase()+' · TODO O ESTADO';$('region-label').textContent=state.toUpperCase()+' · '+municipal.toUpperCase();$('local-label').textContent=municipal.toUpperCase();$('scope').replaceChildren(node('span','Presidente: Brasil inteiro'),document.createElement('br'),node('span','Presidente no estado: '+state),document.createElement('br'),node('span','Disputas estaduais: '+municipal+' / '+$('state').value.toUpperCase()));document.title='Apuração 2026 | Brasil e '+state;syncMap();}
async function changeState(){showMapLevel(Boolean($('state-map').querySelector('svg')));version++;const current=version;data=null;role='3';$('search').value='';$('municipality').replaceChildren(new Option('Todo o estado',''));$('municipality').disabled=true;$('notice').hidden=true;$('local').hidden=true;
 const df=$('state').value==='df';$('deputy-tab').dataset.role=df?'8':'7';$('deputy-tab').textContent=df?'Dep. distrital':'Dep. estadual';cityResults=[];$('city-search').value='';renderCities();loadMunicipalMap();refreshCities();selectTab('3');render('president',null);render('state-president',null);renderRegional();scope();renderScopeProgress();refresh();
 try{const result=await json('/api/municipalities/'+$('state').value);if(current!==version)return;for(const m of result.items)$('municipality').add(new Option(m.name,m.code));if(result.warning){$('notice').hidden=false;$('notice').textContent='Municípios: '+result.warning;}}
 catch(e){if(current===version){$('notice').hidden=false;$('notice').textContent=e.message;}}finally{if(current===version)$('municipality').disabled=false;}
}
function selectTab(value){role=value;document.querySelectorAll('[role=tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.role===role)));renderRegional();}
document.querySelectorAll('[role=tab]').forEach(b=>{b.addEventListener('click',()=>selectTab(b.dataset.role));b.addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('[role=tab]')];if(['ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();const next=tabs[(tabs.indexOf(b)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];next.focus();selectTab(next.dataset.role);}});});
$('state').addEventListener('change',changeState);$('municipality').addEventListener('change',()=>{version++;data=null;$('notice').hidden=true;scope();render('state-president',null);renderScopeProgress();renderRegional();refreshColors();$('local').hidden=true;refresh();});$('search').addEventListener('input',renderRegional);$('refresh').addEventListener('click',refresh);
setInterval(()=>{if(document.hidden||pending)return;seconds--;if(seconds<=0)refresh();$('countdown').textContent='Atualização automática · '+Math.max(0,seconds)+' s';},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
(async()=>{try{states=await json('/api/states');$('state').replaceChildren(...Object.entries(states).map(([code,name])=>new Option(name,code)));$('state').value='ac';await changeState();initMap();}catch(e){$('notice').hidden=false;$('notice').textContent=e.message;}})();

function showMapLevel(municipal){
 $('state-map').hidden=municipal;
 $('municipal-view').hidden=!municipal;
 $('map-back').hidden=!municipal;
 $('map-title').textContent=municipal?'Mapa de '+(states[$('state').value]||$('state').value):'Mapa do Brasil';
 $('map-status').textContent=municipal?'Brasil › '+(states[$('state').value]||$('state').value)+' · Escolha um município para consultar sua apuração.':'Clique em um estado para abrir o mapa dos municípios.';
}
$('map-back').addEventListener('click',()=>{
 showMapLevel(false);
 document.querySelector('#state-map [data-uf="'+$('state').value+'"]')?.focus();
});
function syncMap(){
 syncMunicipalMap();
 document.querySelectorAll('#state-map [data-uf]').forEach(p=>{const selected=p.dataset.uf===$('state').value;p.classList.toggle('selected',selected);p.setAttribute('aria-pressed',String(selected));const r=mapResults[p.dataset.uf];p.style.fill=r?.leader?candidateColor(r.leader):'#cbd2d8';const label=states[p.dataset.uf]+': '+areaDescription(r);p.setAttribute('aria-label',label);p.querySelector('title').textContent=label;});
 showMapLevel(!$('municipal-view').hidden);
}
async function initMap(){
 try{
 const geo=await json('/static/brazil-states.geojson'), ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 620');svg.setAttribute('aria-label','Mapa interativo dos estados brasileiros');
 const project=([lon,lat])=>[(lon+74)*14+20,(-lat+6)*14+20];
 for(const f of geo.features){
 const uf=f.properties.sigla.toLowerCase();if(!states[uf])continue;
 const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
 const path=document.createElementNS(ns,'path');path.setAttribute('d',polygons.map(poly=>poly.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).map(n=>n.toFixed(2)).join(',')).join(' ')+' Z').join(' ')).join(' '));
 path.dataset.uf=uf;path.setAttribute('tabindex','0');path.setAttribute('role','button');path.setAttribute('aria-label',states[uf]);
 const title=document.createElementNS(ns,'title');title.textContent=states[uf]+' ('+uf.toUpperCase()+')';path.append(title);
 const choose=()=>{showMapLevel(true);if($('state').value!==uf){$('state').value=uf;changeState();}else{syncMap();} $('map-back').focus();};path.addEventListener('click',choose);path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});svg.append(path);
 }
 $('state-map').replaceChildren(svg);syncMap();
 }catch(e){$('map-status').textContent='Não foi possível carregar o mapa. Selecione o estado no campo acima.';}
}

const colorRegistry=new Map();
function candidateColor(c){
 const name=(c.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(name.includes('flavio')&&name.includes('bolsonaro'))return '#2563eb';
 if(name.includes('lula')||name.includes('luiz inacio'))return '#dc2626';
 if(name.includes('renan'))return '#eab308';
 const key=String(c.number||name);
 if(!colorRegistry.has(key)){const i=colorRegistry.size;colorRegistry.set(key,`hsl(${(145+i*137.508)%360} 58% 40%)`);}
 return colorRegistry.get(key);
}
function areaDescription(r){
 if(!r?.available)return 'Sem dados oficiais disponíveis';
 const text=r.tied?'Empate':r.leader?r.leader.name+' · '+fmt.format(r.leader.votes)+' votos · '+pct(r.leader.percent):'Sem votos apurados';
 return text+' · Urnas apuradas: '+pct(r.progress)+(r.updated?' · Atualização: '+r.updated:'')+(r.warning?' · Dados anteriores: '+r.warning:'');
}
function renderLegend(){
 const candidates=new Map();
 for(const c of data?.president?.candidates||[])candidates.set(String(c.number),c);
 for(const r of [...Object.values(mapResults),...cityResults])if(r.leader)candidates.set(String(r.leader.number),r.leader);
 const root=$('map-legend');root.replaceChildren();
 for(const c of candidates.values()){const item=node('span',c.name,'legend-item');item.style.setProperty('--candidate-color',candidateColor(c));root.append(item);}
 const neutral=node('span','Sem votos, sem dados ou empate','legend-item');neutral.style.setProperty('--candidate-color','#cbd2d8');root.append(neutral);
}
async function refreshColors(){
 if(!mapPending){mapPending=true;$('map-update').textContent='Atualizando cores dos estados…';
 try{mapResults=await json('/api/president-map');syncMap();renderLegend();$('map-update').textContent=Object.values(mapResults).some(r=>r.warning)?'Alguns estados têm dados indisponíveis ou anteriores. Consulte os detalhes no mapa.':'Cores atualizadas com os últimos resultados recebidos.';}
 catch(e){$('map-update').textContent='Falha ao atualizar cores. As últimas cores recebidas foram mantidas.';}
 finally{mapPending=false;}}
 refreshCities();
}
async function refreshCities(){
 const uf=$('state').value;if(cityPending===uf)return;cityPending=uf;$('cities-status').textContent='Consultando votos das cidades de '+(states[uf]||uf)+'…';
 try{const fresh=await json('/api/president-cities/'+uf);if($('state').value!==uf)return;cityResults=fresh.items;renderCities();renderLegend();$('cities-status').textContent=fresh.warning||cityResults.length+' cidades · Clique para ver todos os candidatos. As cores representam a liderança parcial.';}
 catch(e){if($('state').value===uf)$('cities-status').textContent='Não foi possível atualizar as cidades. Os dados anteriores, quando disponíveis, foram mantidos.';}
 finally{if(cityPending===uf)cityPending=null;}
}
function renderCities(){
 syncMunicipalMap();
 const root=$('city-colors');root.replaceChildren();const query=$('city-search').value.toLocaleLowerCase('pt-BR');
 for(const city of cityResults.filter(c=>c.name.toLocaleLowerCase('pt-BR').includes(query))){
 const button=node('button',undefined,'city-card');button.style.setProperty('--candidate-color',city.leader?candidateColor(city.leader):'#cbd2d8');button.append(node('strong',city.name),node('span',areaDescription(city)));button.addEventListener('click',()=>{const select=$('municipality');if(![...select.options].some(o=>o.value===city.code))select.add(new Option(city.name,city.code));select.value=city.code;select.dispatchEvent(new Event('change'));});root.append(button);
 }
}
$('city-search').addEventListener('input',renderCities);

function normalizedCity(name){return (name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g,'');}
function municipalResult(name){return cityResults.find(c=>normalizedCity(c.name)===normalizedCity(name));}
function syncMunicipalMap(){
 document.querySelectorAll('#municipal-map path').forEach(path=>{
 const city=municipalResult(path.dataset.name), selected=Boolean(city&&city.code===$('municipality').value);
 path.style.fill=city?.leader?candidateColor(city.leader):'#cbd2d8';path.classList.toggle('selected',selected);path.setAttribute('aria-pressed',String(selected));
 const label=path.dataset.name+': '+areaDescription(city);path.setAttribute('aria-label',label);path.querySelector('title').textContent=label;
 });
}
async function chooseMunicipalArea(name){
 const uf=$('state').value;
 let city=municipalResult(name);
 if(!city){
 try{const result=await json('/api/municipalities/'+uf);if(uf!==$('state').value)return;city=result.items.find(c=>normalizedCity(c.name)===normalizedCity(name));}
 catch(e){$('municipal-map-status').textContent='Não foi possível consultar este município. Tente novamente.';return;}
 }
 if(!city){$('municipal-map-status').textContent=name+': município ainda não disponível na lista do TSE.';return;}
 const select=$('municipality');if(![...select.options].some(o=>o.value===city.code))select.add(new Option(city.name,city.code));select.value=city.code;select.dispatchEvent(new Event('change'));
 $('municipal-map-status').textContent='Município selecionado: '+city.name+'. Os resultados aparecem abaixo.';
}
let municipalMapRequest=0;
async function loadMunicipalMap(){
 const request=++municipalMapRequest, uf=$('state').value;
 $('municipal-map').replaceChildren();$('municipal-map-title').textContent='Municípios de '+(states[uf]||uf);$('municipal-map-status').textContent='Carregando contornos municipais…';
 try{
 const result=await json('/api/municipality-map/'+uf);if(request!==municipalMapRequest)return;
 const features=result.geo.features||[], ns='http://www.w3.org/2000/svg';
 const polygons=f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const f of features)for(const poly of polygons(f))for(const ring of poly)for(const [x,y] of ring){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 if(!features.length)throw Error('Sem contornos');
 const latitude=(minY+maxY)/2*Math.PI/180, correction=Math.cos(latitude);
 const scale=Math.min(600/Math.max((maxX-minX)*correction,.001),440/Math.max(maxY-minY,.001));
 const width=(maxX-minX)*correction*scale+40,height=(maxY-minY)*scale+40;
 const project=([x,y])=>[20+(x-minX)*correction*scale,20+(maxY-y)*scale];
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label','Mapa dos municípios de '+states[uf]);
 for(const f of features){
 const code=String(f.properties.codarea||f.id), name=result.names[code]||f.properties.nome||code;
 const path=document.createElementNS(ns,'path');path.dataset.name=name;path.setAttribute('d',polygons(f).map(poly=>poly.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).map(n=>n.toFixed(2)).join(',')).join(' ')+' Z').join(' ')).join(' '));path.setAttribute('fill-rule','evenodd');path.setAttribute('tabindex','0');path.setAttribute('role','button');
 const title=document.createElementNS(ns,'title');path.append(title);path.addEventListener('click',()=>chooseMunicipalArea(name));path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseMunicipalArea(name);}});svg.append(path);
 }
 $('municipal-map').replaceChildren(svg);syncMunicipalMap();$('municipal-map-status').textContent='Clique em um município para ver sua apuração. Passe sobre as áreas para ver os nomes e a liderança parcial.';
 }catch(e){if(request===municipalMapRequest)$('municipal-map-status').textContent='Não foi possível carregar o mapa municipal. Use a lista de cidades ou o seletor de município.';}
}
