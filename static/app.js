const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('pt-BR');
const partyOrientation={PT:'Esquerda',PCDOB:'Esquerda',PSOL:'Esquerda',PCB:'Esquerda',PCO:'Esquerda',PSTU:'Esquerda',UP:'Esquerda',PSB:'Centro-esquerda',PDT:'Centro-esquerda',REDE:'Centro-esquerda',PV:'Centro-esquerda',CIDADANIA:'Centro',MDB:'Centro',PSD:'Centro',PSDB:'Centro-direita',PODE:'Centro-direita',PODEMOS:'Centro-direita',SOLIDARIEDADE:'Centro',AVANTE:'Centro',PRD:'Direita',PP:'Direita',PL:'Direita',REPUBLICANOS:'Direita',NOVO:'Direita',UNIAO:'Direita',DC:'Direita',AGIR:'Centro-direita',MOBILIZA:'Direita',PRTB:'Direita'};
function orientation(party){return partyOrientation[String(party||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/gi,'').toUpperCase()]||'Não classificado';}

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
 const proportional=result.proportional;
 if(proportional){
 const box=node('div',undefined,'proportional');box.append(node('strong',proportional.official?'Quem foi eleito · estado inteiro':'Quem passa agora · estado inteiro'),node('p',proportional.message));
 if(proportional.warning)box.append(node('p',proportional.warning+' Classificação com os últimos dados estaduais recebidos.','warning'));
 if(proportional.available){box.append(node('p',fmt.format(proportional.seats)+' vagas'+(proportional.qe?' · Quociente eleitoral: '+fmt.format(proportional.qe):'')));
 for(const g of proportional.groups||[])box.append(node('p',g.name+': '+fmt.format(g.seats)+' vagas · '+fmt.format(g.votes)+' votos válidos'));
 if(proportional.updated)box.append(node('p','Classificação estadual atualizada: '+proportional.updated,'timestamp'));
 }
 const a=node('a','Como as vagas são distribuídas ↗');a.href='https://www.tse.jus.br/legislacao/compilada/res/2021/resolucao-no-23-677-de-16-de-dezembro-de-2021';a.target='_blank';a.rel='noopener';box.append(a);root.append(box);
 }
 const seatView=target==='regional'&&['5','6','7','8'].includes(role);
 const senate=seatView&&role==='5'?data?.state_senate:null;
 const senatePartial=senate?.available&&senate.status==='Resultado parcial';
 const senateRanked=senatePartial?[...senate.candidates].filter(c=>c.destination==='Válido'&&c.votes>0).sort((a,b)=>b.votes-a.votes):[];
 const senateLeaders=new Set(senateRanked.filter((c,i)=>i<2&&(!senateRanked[2]||c.votes>senateRanked[2].votes)).map(c=>String(c.number)));

 if(seatView){const legend=node('p',undefined,'seat-legend');legend.append(node('span',senatePartial?'Verde: liderança parcial nas duas vagas do Senado':proportional?.available&&!proportional.official?'Verde: dentro das vagas na projeção provisória':'Verde: eleito segundo o TSE','legend-inside'),node('span','Sem destaque: demais candidatos'));root.append(legend,node('p','Posição por votos apurados'+($('municipality').value?' no município selecionado':' no estado')+'. '+(proportional?'A classificação das vagas considera o estado inteiro.':'O destaque do Senado considera o estado inteiro; liderança parcial pode mudar. Empates no corte aguardam definição.'),'sectioncount'));}
 const list=node('div',undefined,'candidate-list');const q=query.toLocaleLowerCase('pt-BR');const ranked=[...result.candidates].sort((a,b)=>b.votes-a.votes);const positions=new Map(ranked.map((c,i)=>[c,i+1]));const candidates=ranked.filter(c=>(c.name+' '+c.party+' '+c.number).toLocaleLowerCase('pt-BR').includes(q));
 for(const c of candidates){const row=node('div',undefined,'candidate'), main=node('div',undefined,'candidate-main'), info=node('div',undefined,'candidate-info'), votes=node('div',undefined,'votes');
 if(seatView)main.append(node('span',positions.get(c)+'º','candidate-rank'));
 if(c.photo){const img=node('img',undefined,'avatar');img.src=c.photo;img.alt='';img.loading='lazy';img.addEventListener('error',()=>img.remove(),{once:true});main.append(img);}
 info.append(node('div',c.name,'candidate-name'),node('div',[c.party,c.number,c.status,c.destination].filter(Boolean).join(' · '),'candidate-meta'),node('span',orientation(c.party),'party-orientation'));
 const classification=senateLeaders.has(String(c.number))?{label:'Nas duas primeiras posições · parcial no estado',inside:true}:proportional?.available?proportional.candidates?.[String(c.number)]:seatView&&role==='5'&&(c.elected||/^eleito(?:\s|$)/i.test(c.status||''))?{label:'Eleito segundo o TSE',inside:true}:null;
 if(classification){info.append(node('div',classification.label,'seat-status '+(classification.inside?'inside':'outside')));row.classList.add(classification.inside?'seat-inside':'seat-outside');}
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
(async()=>{try{states=await json('/api/states');$('state').replaceChildren(...Object.entries(states).map(([code,name])=>new Option(name,code)));$('state').value='ac';$('map-location').replaceChildren(new Option('Brasil',''),...Object.entries(states).map(([code,name])=>new Option(name,code)));await changeState();initMap();}catch(e){$('notice').hidden=false;$('notice').textContent=e.message;}})();

function showMapLevel(municipal){
 $('state-map').hidden=municipal;
 $('municipal-view').hidden=!municipal;
 $('map-back').hidden=!municipal;
 $('map-location').value=municipal?$('state').value:'';
 $('map-tooltip').hidden=true;
 $('map-title').textContent=municipal?'Mapa de '+(states[$('state').value]||$('state').value):'Mapa do Brasil';
 $('map-status').textContent=municipal?'Brasil › '+(states[$('state').value]||$('state').value)+' · Escolha um município para consultar sua apuração.':'Clique em um estado para abrir o mapa dos municípios.';
}
$('map-back').addEventListener('click',()=>{
 showMapLevel(false);
 $('map-location').focus();
});
function syncMap(){
 syncMunicipalMap();
 document.querySelectorAll('#state-map [data-uf]').forEach(p=>{const selected=p.dataset.uf===$('state').value;p.classList.toggle('selected',selected);p.setAttribute('aria-pressed',String(selected));const r=mapResults[p.dataset.uf];p.style.fill=mapColor(r,false);const label=states[p.dataset.uf]+': '+areaDescription(r);p.setAttribute('aria-label',label);p.querySelector('title').textContent=label;});
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
 bindMapTooltip(path,()=>states[uf],()=>mapResults[uf],false);
 path.dataset.uf=uf;path.setAttribute('tabindex','0');path.setAttribute('role','button');path.setAttribute('aria-label',states[uf]);
 const title=document.createElementNS(ns,'title');title.textContent=states[uf]+' ('+uf.toUpperCase()+')';path.append(title);
 const choose=()=>{showMapLevel(true);if($('state').value!==uf){$('state').value=uf;changeState();}else{syncMap();} $('map-back').focus();};path.addEventListener('click',choose);path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});svg.append(path);
 }
 $('state-map').replaceChildren(svg);syncMap();renderLegislatureMaps();
 }catch(e){$('map-status').textContent='Não foi possível carregar o mapa. Selecione o estado no campo acima.';}
}

const colorRegistry=new Map();
function candidateColor(c){
 const name=(c.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(name.includes('flavio')&&name.includes('bolsonaro'))return '#190577';
 if(name.includes('lula')||name.includes('luiz inacio'))return '#d7192d';
 if(name.includes('cury'))return '#fb7821';
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
 refreshLegislature();
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
 path.style.fill=mapColor(city);path.classList.toggle('selected',selected);path.setAttribute('aria-pressed',String(selected));
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
 bindMapTooltip(path,()=>name,()=>municipalResult(name),true);
 const title=document.createElementNS(ns,'title');path.append(title);path.addEventListener('click',()=>chooseMunicipalArea(name));path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseMunicipalArea(name);}});svg.append(path);
 }
 $('municipal-map').replaceChildren(svg);syncMunicipalMap();$('municipal-map-status').textContent='Clique em um município para ver sua apuração. Passe sobre as áreas para ver os nomes e a liderança parcial.';
 }catch(e){if(request===municipalMapRequest)$('municipal-map-status').textContent='Não foi possível carregar o mapa municipal. Use a lista de cidades ou o seletor de município.';}
}

function mapColor(result,municipal=true){
 if(!result?.leader)return '#d8d8df';
 const color=candidateColor(result.leader);
 // Misture a cor do candidato com branco conforme a vantagem eleitoral.
 const strength=municipal&&Number(result.leader.percent)>=60?1:.72;
 return `color-mix(in srgb, ${color} ${strength*100}%, white)`;
}
$('map-location').addEventListener('change',()=>{
 const uf=$('map-location').value;
 if(!uf){showMapLevel(false);return;}
 showMapLevel(true);
 if($('state').value!==uf){$('state').value=uf;changeState();}
});
function bindMapTooltip(path,getName,getResult,municipal){
 const show=()=>{
 const root=$('map-tooltip'), result=getResult();root.replaceChildren(node('strong',getName().toLocaleUpperCase('pt-BR'),'map-tooltip-title'));
 if(!result?.available){root.append(node('p','Aguardando dados oficiais.','tooltip-empty'));}
 else{
 const progress=node('div',undefined,'tooltip-progress');progress.append(node('span',municipal?'APURAÇÃO POR MUNICÍPIO':'APURAÇÃO POR ESTADO'),node('strong',pct(result.progress)));root.append(progress);
 for(const c of (result.candidates||[result.leader].filter(Boolean)).slice(0,3)){
 const row=node('div',undefined,'tooltip-candidate'),head=node('div',undefined,'tooltip-candidate-head'),name=node('span',c.name),dot=node('i');dot.style.background=candidateColor(c);name.prepend(dot);head.append(name,node('strong',pct(c.percent)));const bar=track(c.percent);bar.firstChild.style.background=candidateColor(c);row.append(head,bar,node('div',fmt.format(c.votes)+' votos','tooltip-votes'));root.append(row);
 }
 if(result.warning)root.append(node('p','Últimos dados recebidos · '+result.warning,'tooltip-empty'));
 root.append(node('p','Atualizado às '+(result.updated?.split(' ').at(-1)||'—'),'tooltip-updated'));
 }
 root.hidden=false;
 };
 path.addEventListener('pointerenter',show);path.addEventListener('focus',show);
 path.addEventListener('pointerleave',()=>{$('map-tooltip').hidden=true;});path.addEventListener('blur',()=>{$('map-tooltip').hidden=true;});
 path.addEventListener('keydown',e=>{if(e.key==='Escape')$('map-tooltip').hidden=true;});
 path.addEventListener('click',()=>{if(municipal)show();});
}

$('party-guide').textContent=Object.entries(partyOrientation).filter(([party])=>party!=='PODEMOS').map(([party,label])=>party+': '+label).join(' · ');
$('load-seats').addEventListener('click',async()=>{
 const button=$('load-seats');button.disabled=true;$('seats-status').textContent='Consultando vagas e eleitos nos 27 estados e no Distrito Federal…'.replace('27 estados','26 estados');
 try{
 const result=await json('/api/seats');const table=node('table'),caption=node('caption','Deputados federais e estaduais (distritais no DF)'),thead=node('thead'),header=node('tr');
 for(const label of ['Estado','Vagas federais','Eleitos federais','Vagas estaduais / distritais','Eleitos estaduais / distritais']){const th=node('th',label);th.scope='col';header.append(th);}thead.append(header);table.append(caption,thead);const body=node('tbody');
 for(const item of result.items){const row=node('tr'),name=node('th',item.name+' ('+item.uf.toUpperCase()+')');name.scope='row';row.append(name);for(const result of [item.federal,item.regional]){for(const key of ['seats','elected']){const cell=node('td',result[key]===null?'—':fmt.format(result[key]));if(result.warning){cell.title=result.warning;cell.append(node('span',' *'));}row.append(cell);}}body.append(row);}table.append(body);$('seats-table').replaceChildren(table);
 $('seats-status').textContent='Eleitos: apenas os marcados como eleitos pelo TSE; zero pode indicar classificação ainda não publicada. — indica dados indisponíveis. * indica pendência na fonte; podem ser os últimos dados recebidos.';
 button.textContent='Atualizar quantidades';
 }catch(e){$('seats-status').textContent=e.message;}finally{button.disabled=false;}
});

let legislatureResults={}, legislaturePending=false;
const legislatureSelection={senate:'ac',federal:'ac',ideology:'ac'};
const ideologyColors={'Direita':'#2563eb','Centro':'#e6a11a','Esquerda':'#dc3545','Não classificado':'#737d89'};
function politicalBloc(party){const value=orientation(party);return value.includes('direita')||value==='Direita'?'Direita':value.includes('esquerda')||value==='Esquerda'?'Esquerda':value;}
function partyColor(party){let hash=0;for(const char of party)hash=(hash*31+char.charCodeAt(0))>>>0;return `hsl(${hash%360} 65% 40%)`;}
function legislatureCounts(result,ideology){
 if(!ideology)return result?.parties||{};
 const counts={};for(const [party,seats] of Object.entries(result?.parties||{})){const bloc=politicalBloc(party);counts[bloc]=(counts[bloc]||0)+seats;}return counts;
}
function largestGroup(counts){const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);return entries.length&&(!entries[1]||entries[0][1]>entries[1][1])?entries[0][0]:null;}
function legislatureData(kind,uf){return legislatureResults[uf]?.[kind==='ideology'?$('ideology-role').value:kind];}
function legislatureDescription(kind,uf){
 const result=legislatureData(kind,uf), counts=legislatureCounts(result,kind==='ideology');
 return states[uf]+': '+(!result?.available?'Aguardando dados oficiais':result.mode+' · '+(Object.entries(counts).map(([name,seats])=>name+': '+seats+' vaga(s)').join(' · ')||'Sem vagas classificadas'));
}
function showLegislatureDetail(kind,uf){
 legislatureSelection[kind]=uf;const root=$(kind+'-detail'),result=legislatureData(kind,uf);root.replaceChildren(node('strong',states[uf]+' ('+uf.toUpperCase()+')'));
 if(!result?.available){root.append(node('p','Aguardando dados oficiais.'));if(result?.warning)root.append(node('p',result.warning,'warning'));return;}
 root.append(node('p',result.mode+' · Urnas apuradas: '+pct(result.progress)));
 const counts=legislatureCounts(result,kind==='ideology');
 for(const [label,seats] of Object.entries(counts).sort((a,b)=>b[1]-a[1]))root.append(node('p',label+': '+fmt.format(seats)+' vaga(s)'));
 if(!Object.keys(counts).length)root.append(node('p','Ainda não há vagas classificadas. Empates no corte do Senado aguardam definição.'));
 for(const c of result.selected||[])root.append(node('p',c.name+' · '+c.party+' · '+politicalBloc(c.party)+' · '+fmt.format(c.votes)+' votos','legislature-candidate'));
 if(result.warning)root.append(node('p',result.warning+' Exibindo os últimos dados recebidos.','warning'));
 if(result.updated)root.append(node('p','Atualização: '+result.updated,'timestamp'));
 if(result.source){const link=node('a','Consultar dados do TSE ↗');link.href=result.source;link.target='_blank';link.rel='noopener';root.append(link);}
}
function renderLegislatureMaps(){
 renderNationalChambers();
 const template=$('state-map').querySelector('svg');if(!template)return;
 for(const kind of ['senate','federal','ideology']){
 const svg=template.cloneNode(true),ideology=kind==='ideology',labels=new Set();svg.setAttribute('aria-label',kind==='senate'?'Partidos nas vagas do Senado':kind==='federal'?'Partidos nas vagas da Câmara':'Orientação política por estado');
 for(const path of svg.querySelectorAll('[data-uf]')){
 const uf=path.dataset.uf,result=legislatureData(kind,uf),counts=legislatureCounts(result,ideology),winner=largestGroup(counts);
 Object.keys(counts).forEach(label=>labels.add(label));path.style.fill=winner?(ideology?ideologyColors[winner]:partyColor(winner)):'#d8d8df';path.classList.toggle('selected',legislatureSelection[kind]===uf);path.setAttribute('aria-pressed',String(legislatureSelection[kind]===uf));
 const description=legislatureDescription(kind,uf);path.setAttribute('aria-label',description);path.querySelector('title').textContent=description;
 const select=()=>{showLegislatureDetail(kind,uf);svg.querySelectorAll('[data-uf]').forEach(p=>{p.classList.toggle('selected',p===path);p.setAttribute('aria-pressed',String(p===path));});};
 path.addEventListener('click',select);path.addEventListener('focus',()=>showLegislatureDetail(kind,uf));path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
 }
 $(kind+'-map').replaceChildren(svg);const legend=$(kind+'-legend');legend.replaceChildren();
 for(const label of (ideology?Object.keys(ideologyColors):[...labels].sort())){const item=node('span',label,'legend-item');item.style.setProperty('--candidate-color',ideology?ideologyColors[label]:partyColor(label));legend.append(item);}
 const neutral=node('span','Empate ou sem vagas classificadas','legend-item');neutral.style.setProperty('--candidate-color','#d8d8df');legend.append(neutral);showLegislatureDetail(kind,legislatureSelection[kind]);
 }
}
async function refreshLegislature(){
 if(legislaturePending)return;legislaturePending=true;$('legislature-status').textContent='Atualizando Senado e Câmara nos 26 estados e no Distrito Federal…';
 try{legislatureResults=await json('/api/legislature-map');renderLegislatureMaps();$('legislature-status').textContent=Object.values(legislatureResults).some(r=>r.senate.warning||r.federal.warning)?'Há estados com dados indisponíveis ou anteriores. Selecione o estado para ver os detalhes.':'Mapas atualizados. Consulte em cada estado se as vagas são confirmadas ou provisórias.';}
 catch(e){$('legislature-status').textContent='Não foi possível atualizar os mapas. Os últimos dados recebidos foram mantidos.';}
 finally{legislaturePending=false;}
}
$('ideology-role').addEventListener('change',renderLegislatureMaps);

function chamberPositions(total){
 const rows=total>100?9:4, positions=[];
 const weights=Array.from({length:rows},(_,i)=>150+i*27);
 const counts=weights.map(r=>Math.floor(total*r/weights.reduce((a,b)=>a+b,0)));
 for(let i=0;counts.reduce((a,b)=>a+b,0)<total;i++)counts[rows-1-i%rows]++;
 counts.forEach((count,row)=>{for(let i=0;i<count;i++){
 const angle=Math.PI-i*Math.PI/(count-1),radius=weights[row];
 positions.push({x:350+radius*Math.cos(angle),y:350-radius*Math.sin(angle),angle,row});
 }});
 return positions.sort((a,b)=>b.angle-a.angle||a.row-b.row);
}
function renderNationalChambers(){
 const root=$('national-chambers');root.replaceChildren();
 const ns='http://www.w3.org/2000/svg';
 for(const kind of ['federal','senate'])for(const ideology of [false,true]){
 const total=kind==='federal'?513:54, counts={};let confirmed=0,classified=0,available=0;
 for(const state of Object.values(legislatureResults)){
 const result=state[kind];if(result?.available)available++;
 for(const [label,n] of Object.entries(legislatureCounts(result,ideology)))counts[label]=(counts[label]||0)+n;
 const n=Object.values(result?.parties||{}).reduce((a,b)=>a+b,0);classified+=n;
 if(result?.mode==='Eleitos pelo TSE')confirmed+=n;
 }
 const card=node('section',undefined,'chamber-card');
 card.append(node('h3',kind==='federal'?'CÂMARA DOS DEPUTADOS':'SENADO'),node('p','Todos os estados · '+(ideology?'orientação política':'por partido'),'chamber-subtitle'));
 const entries=Object.entries(counts).sort((a,b)=>ideology?Object.keys(ideologyColors).indexOf(a[0])-Object.keys(ideologyColors).indexOf(b[0]):b[1]-a[1]||a[0].localeCompare(b[0]));
 const seats=entries.flatMap(([label,n])=>Array(n).fill(label));
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 700 390');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${kind==='federal'?'Câmara':'Senado'}: ${classified} de ${total} vagas classificadas. ${entries.map(([label,n])=>label+': '+n).join(', ')}`);
 chamberPositions(total).forEach((position,i)=>{
 const label=seats[i],circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',position.x);circle.setAttribute('cy',position.y);circle.setAttribute('r',total>100?8:18);
 circle.setAttribute('fill',label?(ideology?ideologyColors[label]:partyColor(label)):'#fff');circle.setAttribute('stroke',label?'#fff':'#cdd2d0');circle.setAttribute('stroke-width','1.5');
 const title=document.createElementNS(ns,'title');title.textContent=label?label+' · '+counts[label]+' vaga(s)':'Vaga ainda sem classificação';circle.append(title);svg.append(circle);
 });
 for(const [y,text,size,weight] of [[300,String(classified),54,750],[328,'VAGAS CLASSIFICADAS',16,500],[352,'DE '+total+' EM DISPUTA',16,700]]){
 const t=document.createElementNS(ns,'text');t.setAttribute('x','350');t.setAttribute('y',String(y));t.setAttribute('text-anchor','middle');t.setAttribute('font-size',size);t.setAttribute('font-weight',weight);t.textContent=text;svg.append(t);
 }
 card.append(svg);const legend=node('div',undefined,'chamber-legend');
 for(const [label,n] of [...entries,...(classified<total?[['Aguardando classificação',total-classified]]:[])]){
 const item=node('span',undefined,'legend-item');item.style.setProperty('--candidate-color',label==='Aguardando classificação'?'#e8ecea':ideology?ideologyColors[label]:partyColor(label));item.append(node('span',label),node('strong',fmt.format(n)));legend.append(item);
 }
 card.append(legend,node('p',`${confirmed} eleitos confirmados pelo TSE · ${classified-confirmed} vagas provisórias · dados disponíveis em ${available}/27 UFs.`,'chamber-note'));
 if(ideology)card.append(node('p','Classificação editorial por partido: centro-direita em Direita e centro-esquerda em Esquerda. Não classificado aparece separado.','chamber-note'));
 root.append(card);
 }
}
renderNationalChambers();
