import {shell,$,bindZoom,reduced} from './exploration-shell.js';
import {createScene} from './scene.js';
import {oasisLayer,prepare,subsolar,KINDS} from './oasis-layer.js';
import './oasis.css';
import './oasis-mobile.css';

const views=[
 {kicker:'01 / TORO OASIS',title:'The Oasis network,<br> from day one.',body:'The Oasis app since launch in April, replayed across the globe. Every red pulse is someone checking on a yard, every blue dot is a zone watering, and every green arc is a new controller joining the network from Toro HQ.'},
 {kicker:'NORTH AMERICA',title:'Where Oasis<br> lives.',body:'Almost all Oasis activity is in the US and Canada. The day line follows the replay clock, so you can watch each evening wave roll west.',lat:41,lon:-97,zoom:.2},
 {kicker:'THE NORTHEAST',title:'The Philadelphia<br> corridor.',body:'The Philadelphia suburbs are one of the densest Oasis clusters. Select any city to see its history.',lat:40.1,lon:-75.4,zoom:.86},
 {kicker:'THE SOUTHWEST',title:'Built for<br> the heat.',body:'Phoenix, Scottsdale, Mesa and Chandler. Irrigation matters most where water is scarce, and the activity shows it.',lat:33.5,lon:-112,zoom:.8},
 {kicker:'AUSTRALIA',title:'The other side<br> of the day.',body:'Adelaide and Brisbane come alive while North America sleeps.',lat:-30,lon:142,zoom:.42},
 {kicker:'INDIA',title:'Early days<br> in India.',body:'A small group of Oasis users, around Delhi and Mumbai. Every pulse here is one of a few dozen app opens a month.',lat:22,lon:79,zoom:.42},
];
const liveView={kicker:'LIVE',title:'Oasis,<br> right now.',body:'Activity from the Oasis network as it happens. Select an event in the feed to fly to it.'};
const fmt=new Intl.NumberFormat('en-US');
const legend=KINDS.map(k=>`<button class="oasis-chip" data-kind="${k.id}" aria-pressed="true" style="--chip:${k.color}"><i></i>${k.label}<b>0</b></button>`).join('');
const ui=shell({id:'planet',...views[0],chapters:['Network','North America','Northeast','Southwest','Australia','India'],rangeLabel:'Replay',note:'Oasis app analytics · City-level locations · Drag to rotate · Scroll to zoom · Select a city',legend,
 sources:`<p>Activity comes from Toro's <strong>Oasis</strong> app analytics, from when tracking began in April 2026. Locations are the city associated with each phone's connection, never a street address. Places with little activity are shown at their state or region instead, and are drawn dimmer.</p><p>Red pulses are app opens, placed in the hour they happened. Green beams and arcs are controllers being added. Amber marks setup errors and grey marks setups the user cancelled; they are shown separately because most unfinished setups are cancellations, not failures. Blue dots are zones watering, started from the app: mostly test runs while a controller is being set up, plus manual runs. Scheduled watering runs on the controller itself and is not shown.</p><p><strong>In Replay</strong> the network builds up from April: users and users with a controller count up from the day each was first seen, each place appears the first time it is active, new users (sign-ups) and new controllers flash white before settling to red, and the cards count up to today's totals.</p><p><strong>Network cards and globe activity</strong> count signed-in users only, excluding Toro staff and test accounts. Users are counted from the first day they opened the app (analytics began in April 2026). "With a controller" counts users who have used a controller in the app; a controller can be shared (for example by a homeowner and their contractor), and the number of distinct controller IDs logged is shown beneath it. Controllers are every distinct controller that has connected (added, registered, reporting status or used in the app) since analytics began; controllers set up before then, or through app versions that did not record controller IDs, are not included, so the fleet is larger. Online is the share of controllers that reported being online in the last 30 days.</p><p><strong>Controller locations.</strong> Each controller is placed at the city where it was set up: setup is over Bluetooth, so the phone is next to the controller (344 of 416). The rest are placed where their owner uses the app. "Controllers" on the card counts accounts that use a controller; the number of controllers located from Mixpanel is shown beneath it.</p><p><strong>Live</strong> streams real activity from today and yesterday, sped up so the network is always moving. The data is refreshed every hour.</p><p>Internal test traffic is excluded. No names, e-mail addresses, or user, device or controller identifiers are published. Times are UTC, and the sun position is approximate.</p><p>Globe renderer adapted from <a href="https://github.com/ethanplusai/earth-moon-solar" target="_blank" rel="noopener">Earth, Moon &amp; Solar System</a> by Ethan Rogers (MIT). Earth imagery is NASA-derived, via WebGL Earth and three-globe. The star background uses the HYG catalog (CC BY-SA 4.0). Place names from GeoNames (CC BY 4.0).</p>`});

// Elements the mobile layout moves must exist before the first await.
const shellRoot=$('.world-shell');
const kpis=document.createElement('section');kpis.className='oasis-kpis';kpis.setAttribute('aria-label','Network summary');shellRoot.append(kpis);
const feed=document.createElement('ol');feed.className='oasis-feed';feed.setAttribute('aria-label','Latest controller events');shellRoot.append(feed);
// Zoom out rides on top of the dock, so it clears the controls however tall they wrap.
const zoomOut=document.createElement('button');zoomOut.className='oasis-zoomout';zoomOut.hidden=true;zoomOut.innerHTML='<span aria-hidden="true">−</span> Zoom out';$('.ex-dock').append(zoomOut);
$('.ex-dock-top').insertAdjacentHTML('afterbegin','<div class="oasis-mode" role="group" aria-label="Mode"><button data-mode="replay" aria-pressed="true">Replay</button><button data-mode="live" aria-pressed="false"><i></i>Live</button></div>');
$('.ex-range-row').insertAdjacentHTML('beforeend','<span class="oasis-live-status" hidden></span>');

const scene=createScene($('#earth-canvas'),{exposure:1.22,daylight:[-.4,.32,1],homeView:[30,-96],homeOffset:.4,onInteract:()=>{scene.setRotation(false);stopTour();}});
scene.setReduced(reduced());bindZoom(scene);scene.setCityLights(.2);

async function load(){
 for(const url of ['data/oasis.json','data/oasis.sample.json'].map(p=>import.meta.env.BASE_URL+p)){const r=await fetch(url).catch(()=>null);if(r?.ok&&r.headers.get('content-type')?.includes('json'))return r.json();}
 throw Error('No Oasis dataset found');
}
const data=prepare(await load());
document.querySelector('.creator-link').innerHTML=data.source!=='mixpanel'?'Synthetic sample · <strong>No Toro data</strong>':'Oasis analytics · <strong>Since April 2026</strong>';
if(data.source!=='mixpanel')document.querySelector('.wordmark').insertAdjacentHTML('beforeend','<span class="oasis-badge" title="Synthetic sample: run scripts/build-oasis-data.py to use real Mixpanel data">Sample data</span>');

const place=c=>{const [, , name,region]=data.cities[c];return region&&region!==name?`${name}, ${region}`:name;};
// Built from parts: Safari joins date and time with " at ", not ", ".
const hhmm=d=>d.toLocaleTimeString('en-US',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hour12:false});
const clock=d=>`${d.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'})}, ${hhmm(d)}`;

// Network cards and the regional leaderboard share the right-hand panel whenever no city
// is selected; the header switches between them.
let liveKpis=null,kpiView='network',regionMetric='customers',onlineText='';
// Toro's regions, as in the Oasis W design file (Admin > regions map), with its colours.
const TORO_REGIONS=[
 {id:'pacific',name:'Pacific',abbr:'P',color:'#5c8d5b',states:['Washington','Oregon','California']},
 {id:'rocky',name:'Rocky Mountains',abbr:'RM',color:'#789399',states:['Idaho','Montana','Wyoming','Nevada','Utah','Colorado']},
 {id:'southwest',name:'Southwest',abbr:'SW',color:'#f8c391',states:['Arizona','New Mexico','Texas','Oklahoma']},
 {id:'midwest',name:'Midwest',abbr:'MW',color:'#c4a300',states:['North Dakota','South Dakota','Nebraska','Kansas','Minnesota','Iowa','Missouri','Wisconsin','Illinois','Michigan','Indiana','Ohio']},
 {id:'northeast',name:'Northeast',abbr:'NE',color:'#dfd6c7',states:['Pennsylvania','New York','New Jersey','Connecticut','Rhode Island','Massachusetts','Vermont','New Hampshire','Maine','Delaware','Maryland','District of Columbia']},
 {id:'southeast',name:'Southeast',abbr:'SE',color:'#2a5953',states:['West Virginia','Virginia','Kentucky','Tennessee','North Carolina','South Carolina','Georgia','Florida','Alabama','Mississippi','Arkansas','Louisiana']},
 {id:'noncontiguous',name:'Noncontiguous',abbr:'NC',color:'#905e42',states:['Alaska','Hawaii']},
 {id:'canada',name:'Canada',abbr:'CA',color:'#9aa6ab',states:['British Columbia','Alberta','Saskatchewan','Manitoba','Ontario','Quebec','New Brunswick','Nova Scotia','Prince Edward Island','Newfoundland and Labrador','Yukon','Northwest Territories','Nunavut']},
];
const TORO_BY_STATE=new Map(TORO_REGIONS.flatMap(g=>g.states.map(st=>[st,g.id])));
const toroRegions=(()=>{
 const byState=TORO_BY_STATE;
 const groups=[...TORO_REGIONS,{id:'intl',name:'International',abbr:'INT',color:'#646e73',states:[]}].map(g=>({...g,members:[],customers:0,added:0,controller:0,opens:0,error:0,cancelled:0,watering:0,signup:0,daily:null,lat:0,lon:0,w:0}));
 const find=id=>groups.find(g=>g.id===id);
 (data.regions??[]).forEach((r,i)=>{const g=find(byState.get(r.region)??'intl');g.members.push(i);
  for(const k of ['customers','added','opens','error','cancelled','watering','signup','controller'])g[k]+=r[k]??0;
  g.daily=g.daily?g.daily.map((v,j)=>v+(r.daily[j]??0)):[...r.daily];const w=r.opens+1;g.lat+=r.lat*w;g.lon+=r.lon*w;g.w+=w;});
 return groups.filter(g=>g.members.length).map(g=>({...g,lat:g.lat/g.w,lon:g.lon/g.w}));
})();
const METRICS={customers:{label:'Users',key:'customers'},added:{label:'Controllers',key:'controller'},opens:{label:'Activity',key:'opens'}};
const miniSpark=values=>{const max=Math.max(1,...values),w=54,h=16,step=w/(values.length-1);return `<svg class="oasis-mini" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${values.map((v,i)=>`${(i*step).toFixed(1)},${(h-1-(v/max)*(h-3)).toFixed(1)}`).join(' ')}" fill="none" stroke="#e11837" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>`;};
function renderRegions(){
 const m=METRICS[regionMetric],rows=[...toroRegions].sort((a,b)=>b[m.key]-a[m.key]).slice(0,6),max=Math.max(1,rows[0]?.[m.key]??1);
 return `<div class="oasis-metrics" role="group" aria-label="Rank by">${Object.entries(METRICS).map(([id,x])=>`<button data-metric="${id}" aria-pressed="${id===regionMetric}">${x.label}</button>`).join('')}</div>
  <ol class="oasis-regions">${rows.map((r,i)=>`<li><button data-toro="${r.id}" style="--swatch:${r.color}"><b>${i+1}</b><span><s></s>${r.name}</span>${miniSpark(r.daily)}<em>${fmt.format(r[m.key])}</em><i style="width:${(r[m.key]/max*100).toFixed(1)}%"></i></button></li>`).join('')}</ol>
  <p class="oasis-caption">${regionMetric==='customers'?'Signed-in users':regionMetric==='added'?'Controllers':'App opens'} by Toro region, since April</p>`;
}
function renderKpis(){
 const k={...data.kpis,...(liveKpis??{})},pct=k.online==null?'—':`${(k.online*100).toFixed(1).replace(/\.0$/,'')}%`;
 const asOf=liveKpis?'<b class="oasis-live-dot"></b>Live':`As of ${new Date(k.asOf+'T12:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}`;
 onlineText=k.onlineNote?`Of ${fmt.format(k.reporting)} reporting, ${k.onlineNote.replace('seen online in the ','')}`:`Of ${fmt.format(k.reporting)} at last status report`;
 kpis.classList.toggle('oasis-kpis-regions',kpiView==='regions');
 if($('.ex-detail').hidden)feed.hidden=kpiView==='regions'; // the leaderboard takes the feed's space
 kpis.innerHTML=`<header><div class="oasis-tabs" role="tablist"><button role="tab" data-view="network" aria-selected="${kpiView==='network'}">Network</button><button role="tab" data-view="regions" aria-selected="${kpiView==='regions'}">Top regions</button></div><span>${asOf}</span></header>
  ${kpiView==='regions'?renderRegions():`<div class="oasis-kpi"><span>Users</span><strong data-kpi="users">${fmt.format(k.users)}</strong><small>${k.usersNote??`App users since ${k.usersSince}`}</small></div>
  <div class="oasis-kpi"><span>Controllers</span><strong data-kpi="controllers">${fmt.format(k.controllerUsers??k.controllers)}</strong><small data-kpi="controllersNote">${k.controllerUsers?`Accounts with a controller · ${fmt.format(k.controllers)} located`:k.controllersNote??`Added through the app since ${k.controllersSince}`}</small></div>
  <div class="oasis-kpi"><span>New this month</span><strong style="color:#42ce11" data-kpi="month">${fmt.format(k.addedMonth)}</strong><small data-kpi="monthLabel">Controllers added in ${k.month}</small></div>
  <div class="oasis-kpi"><span>Online now</span><strong>${pct}</strong><i class="oasis-meter"><b style="width:${(k.online??0)*100}%"></b></i><small data-kpi="onlineLabel">${onlineText}</small></div>`}`;
}
renderKpis();
kpis.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.toro||b.dataset.region)stopTour();
 if(b.dataset.view){kpiView=b.dataset.view;renderKpis();}
 else if(b.dataset.metric){regionMetric=b.dataset.metric;renderKpis();}
 else if(b.dataset.toro)focusToroRegion(b.dataset.toro);
 else if(b.dataset.region)focusRegion(+b.dataset.region);
});

// Feed of controller outcomes. Each entry flies to its city.
const verb={added:'Controller added',error:'Setup error',cancelled:'Setup cancelled',signup:'New user'};
const chips=Object.fromEntries(KINDS.map(k=>[k.id,true]));
function pushFeed({kind,city,at}){
 if(!chips[kind]||kind==='activity'||kind==='watering')return; // the feed is for controller outcomes
 const item=document.createElement('li');item.style.setProperty('--chip',KINDS.find(k=>k.id===kind)?.color??'#ffffff');
 item.innerHTML=`<button><i></i><span><strong>${verb[kind]}</strong><em>${place(city)}</em></span><time>${hhmm(new Date(data.startDate.getTime()+at*1000))}</time></button>`;
 item.querySelector('button').onclick=()=>focusCity(city);
 feed.prepend(item);while(feed.children.length>5)feed.lastChild.remove();
}

// City detail replaces the cards; closing it brings them back.
const detail=$('.ex-detail'),hoverTip=document.createElement('div');hoverTip.className='oasis-tip';hoverTip.hidden=true;shellRoot.append(hoverTip);
function spark(values){const max=Math.max(1,...values),w=240,h=64,step=w/(values.length-1);const pts=values.map((v,i)=>`${(i*step).toFixed(1)},${(h-4-(v/max)*(h-10)).toFixed(1)}`).join(' ');return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${h} ${pts} ${w},${h}" fill="#e1183722" stroke="none"/><polyline points="${pts}" fill="none" stroke="#e11837" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;}
function showCity(c){
 layer?.highlight(null);delete detail.dataset.region;
 const open=c>=0;detail.hidden=!open;kpis.hidden=open;feed.hidden=open||kpiView==='regions'; // the leaderboard takes the feed's space
 if(!open)return;
 const t=data.totals[c],[lat,lon,name,region,precise]=data.cities[c],quiet=!t.opens&&!t.added&&!t.error&&!t.cancelled&&!t.watering;
 detail.innerHTML=`<button class="ex-close" aria-label="Close city">✕</button><span class="eyebrow">${precise?'CITY':'REGION'} · ${lat.toFixed(1)}°, ${lon.toFixed(1)}°</span><h2>${name}</h2><p class="oasis-region">${region&&region!==name?region:''}</p>${quiet?'<p class="oasis-caption">First seen in live mode. No activity in the replay window.</p>':`<dl class="oasis-stats"><div><dt>Controllers</dt><dd style="color:#42ce11">${fmt.format(t.controller??0)}</dd></div><div><dt>App opens</dt><dd>${fmt.format(t.opens)}</dd></div><div><dt>Added</dt><dd style="color:#42ce11">${t.added}</dd></div><div><dt>Errors</dt><dd style="color:#ffb020">${t.error}</dd></div><div><dt>Cancelled</dt><dd>${t.cancelled}</dd></div><div><dt>Watering</dt><dd style="color:#3079f0">${t.watering}</dd></div></dl>${spark(t.daily)}<p class="oasis-caption">Daily app opens since ${data.startDate.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</p>`}`;
 detail.querySelector('.ex-close').onclick=()=>{layer.select(-1);showCity(-1);};
}
function hover(c,x,y){if(c<0){hoverTip.hidden=true;return;}hoverTip.hidden=false;hoverTip.textContent=`${place(c)} · ${fmt.format(data.totals[c].opens)} opens`;hoverTip.style.transform=`translate(${x+14}px,${y-10}px)`;}

const layer=scene.attachLayer(oasisLayer(data,{onEvent:pushFeed,onPick:showCity,onHover:hover}));
function focusCity(c){stopTour();const [lat,lon]=data.cities[c];ui.active(-1);scene.flyTo(lat,lon,.8,2400);scene.setRotation(false);layer.select(c);showCity(c);}
let shapes=null;
const loadShapes=()=>shapes??=fetch(import.meta.env.BASE_URL+'data/regions.geo.json').then(r=>r.ok?r.json():{}).catch(()=>({}));
function focusRegion(i){
 const r=data.regions[i];loadShapes().then(s=>{if(!detail.hidden&&detail.dataset.region===r.region)layer.highlight(s[r.region]);});ui.active(-1);scene.flyTo(r.lat,r.lon,.55,2400);scene.setRotation(false);layer.select(-1);
 detail.innerHTML=`<button class="ex-close" aria-label="Close region">✕</button><span class="eyebrow">REGION · ${r.lat.toFixed(1)}°, ${r.lon.toFixed(1)}°</span><h2>${r.region}</h2><p class="oasis-region">Since April 2026</p><dl class="oasis-stats"><div><dt>Users</dt><dd>${fmt.format(r.customers)}</dd></div><div><dt>Controllers</dt><dd style="color:#42ce11">${fmt.format(r.controller??0)}</dd></div><div><dt>App opens</dt><dd>${fmt.format(r.opens)}</dd></div><div><dt>Added</dt><dd>${r.added}</dd></div><div><dt>Errors</dt><dd style="color:#ffb020">${r.error}</dd></div><div><dt>Cancelled</dt><dd>${r.cancelled}</dd></div><div><dt>Watering</dt><dd style="color:#3079f0">${r.watering}</dd></div></dl>${spark(r.daily)}<p class="oasis-caption">Daily app opens since ${data.startDate.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</p>`;
 detail.dataset.region=r.region;detail.hidden=false;kpis.hidden=true;feed.hidden=true;detail.querySelector('.ex-close').onclick=()=>showCity(-1);
}
function focusToroRegion(id){
 const g=toroRegions.find(x=>x.id===id),m=METRICS[regionMetric];if(!g)return;
 const spread=Math.max(...g.members.map(i=>Math.abs(data.regions[i].lon-g.lon)),5);
 ui.active(-1);scene.flyTo(g.lat,g.lon,spread>25?.2:spread>12?.36:.5,2400);scene.setRotation(false);layer.select(-1);
 const states=g.members.map(i=>[i,data.regions[i]]).sort((a,b)=>b[1][m.key]-a[1][m.key]);
 detail.innerHTML=`<button class="ex-close" aria-label="Close region">✕</button><span class="eyebrow" style="color:${g.color==='#dfd6c7'?'#dfd6c7':g.color}">TORO REGION · ${g.abbr}</span><h2>${g.name}</h2><p class="oasis-region">${g.members.length} ${g.id==='canada'?'provinces':g.id==='intl'?'places':'states'} with activity · since April 2026</p><dl class="oasis-stats"><div><dt>Users</dt><dd>${fmt.format(g.customers)}</dd></div><div><dt>Controllers</dt><dd style="color:#42ce11">${fmt.format(g.controller)}</dd></div><div><dt>App opens</dt><dd>${fmt.format(g.opens)}</dd></div><div><dt>Watering</dt><dd style="color:#3079f0">${g.watering}</dd></div></dl>${spark(g.daily)}<p class="oasis-caption">Daily app opens since ${data.startDate.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</p><ol class="oasis-regions oasis-states">${states.slice(0,8).map(([i,r])=>`<li><button data-region="${i}"><b></b><span>${r.region}</span><em>${fmt.format(r[m.key])}</em></button></li>`).join('')}</ol>`;
 detail.dataset.region=g.name;detail.hidden=false;kpis.hidden=true;feed.hidden=true;
 detail.querySelector('.ex-close').onclick=()=>showCity(-1);
 detail.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>focusRegion(+b.dataset.region));
 loadShapes().then(s=>{if(!detail.hidden&&detail.dataset.region===g.name)layer.highlight(g.members.flatMap(i=>s[data.regions[i].region]??[]),g.color);});
}
function goHome(){layer.highlight(null);ui.active(0);ui.copy(live?'live':'0',live?liveView:views[0]);scene.home();scene.setRotation(!reduced());}
zoomOut.onclick=goHome;

// Replay controls.
const range=$('#ex-range'),play=$('.ex-play'),liveStatus=$('.oasis-live-status');
function setPlaying(on){layer.setPlaying(on);play.setAttribute('aria-pressed',String(on));play.textContent=on?'Ⅱ Pause replay':'▶ Play replay';}
play.onclick=()=>setPlaying(!layer.playing);
range.oninput=e=>{layer.seek(+e.target.value*data.duration);feed.replaceChildren();};
const speed=document.createElement('button');speed.className='oasis-speed';speed.title='Replay speed';
// Six months of data: default to 6 hours per second (about twelve minutes end to end).
const speeds=[[3600,'1 hr/s'],[6*3600,'6 hr/s'],[12*3600,'12 hr/s'],[24*3600,'1 day/s']];let speedIndex=1; // 6 hr/s: about 12 minutes for the six monthsspeed.textContent=speeds[speedIndex][1];layer.setSpeed(speeds[speedIndex][0]);
speed.onclick=()=>{speedIndex=(speedIndex+1)%speeds.length;layer.setSpeed(speeds[speedIndex][0]);speed.textContent=speeds[speedIndex][1];};
play.before(speed);
document.querySelectorAll('.oasis-chip').forEach(b=>{b.onclick=()=>{const on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));chips[b.dataset.kind]=on;layer.setVisible(b.dataset.kind,on);};});
// Chapters and the automatic tour. By default the globe tours the chapters, then each Toro
// region, then starts again. Picking a chapter pill (or dragging, zooming, selecting a place)
// stops the tour and stays put; the Network pill starts it again.
const CHAPTER_AREA={1:r=>!!TORO_BY_STATE.get(r.region),2:r=>TORO_BY_STATE.get(r.region)==='northeast',3:r=>TORO_BY_STATE.get(r.region)==='southwest',
 4:r=>r.lat<-10&&r.lon>110,5:r=>r.lat>6&&r.lat<36&&r.lon>68&&r.lon<98};
// Area figures for the headline, as of the replay clock so they agree with the cards.
function areaStats(test){
 const t=layer.time,inArea=new Set((data.regions??[]).filter(test).map(r=>r.region));if(!inArea.size)return '';
 const cityIn=c=>inArea.has(data.cities[c][3]||data.cities[c][2]),byState=new Map();let opens=0,controllers=0;
 for(const [h,c,n] of data.activity)if(h*3600<=t&&cityIn(c))opens+=n;
 for(const [at,c,k] of data.events)if(k===5&&at<=t&&cityIn(c)){controllers++;const st=data.cities[c][3];byState.set(st,(byState.get(st)??0)+1);}
 const top=[...byState].sort((a,b)=>b[1]-a[1])[0],when=new Date(data.startDate.getTime()+t*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
 return `By ${when}: ${fmt.format(controllers)} ${controllers===1?'controller':'controllers'} located and ${fmt.format(opens)} app opens${top&&top[1]>1?`, most in ${top[0]}`:''}.`;
}
function applyChapter(i){
 showCity(-1);
 if(i===0){goHome();return;}
 const v=views[i],stats=CHAPTER_AREA[i]?areaStats(CHAPTER_AREA[i]):'';
 ui.active(i);ui.copy('chapter-'+i,{...v,body:stats?`${v.body} ${stats}`:v.body});
 scene.flyTo(v.lat,v.lon,v.zoom,3000);scene.setRotation(false);
  // Chapters show the globe as is; only the Toro regional breakdown paints regions.
}
function applyToroStop(id){
 const g=toroRegions.find(x=>x.id===id);if(!g)return;
 focusToroRegion(id);
 const states=new Set(g.members.map(i=>data.regions[i].region));
 ui.copy('toro-'+id,{kicker:`TORO REGION · ${g.abbr}`,title:`${g.name}.`,body:`${g.members.length} ${g.members.length===1?'state':'states'} in Toro's ${g.name} region. ${areaStats(r=>states.has(r.region))}`});
}
const TOUR=[{chapter:0,s:10},{chapter:1,s:10},{chapter:2,s:10},{chapter:3,s:10},{chapter:4,s:8},{chapter:5,s:8},{chapter:1,s:6},
 ...['pacific','rocky','southwest','midwest','northeast','southeast'].map(id=>({toro:id,s:7}))];
const tour={on:!reduced(),i:0,until:0,step:null};
function runTourStep(){
 const st=tour.step=TOUR[tour.i];tour.until=performance.now()+st.s*1000;
 if('chapter' in st)applyChapter(st.chapter);else applyToroStop(st.toro);
 if(st.chapter===0)scene.setRotation(!reduced());
}
function startTour(){tour.on=!reduced();tour.i=0;if(tour.on)runTourStep();else applyChapter(0);}
function stopTour(){tour.on=false;}
function tickTour(now){if(tour.on&&now>=tour.until){tour.i=(tour.i+1)%TOUR.length;runTourStep();}}
document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>{const i=+b.dataset.chapter;if(i===0)return startTour();stopTour();applyChapter(i);});

// Live mode, two sources. With a server that has Mixpanel credentials (local dev), the
// proxy streams events five minutes behind real time. On GitHub Pages there is no
// server, so Live streams the real last 48 hours from the hourly build at STREAM× speed.
const POLL=30000,STREAM=120;let live=false,liveKind=null,liveTimer=0,since=0,skew=0,lag=300000,liveToday=null,liveUpdated=0,liveError='';
const liveClock=()=>Date.now()+skew-lag-POLL;
const liveButton=document.querySelector('[data-mode="live"]');
const base=data.startDate.getTime();
// Without a separate recent window (the published snapshot), Live replays the last 48 hours of
// the replay data: controller events at their real times, each hour's app opens spread across it.
data.recent??=(()=>{const from=(data.hours-48)*3600,end=data.hours*3600,ev=[];let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(const [h,c,n] of data.activity)if(h*3600>=from)for(let i=0;i<n;i++)ev.push([h*3600+Math.floor(rnd()*3600),c,0]);
 for(const [s,c,k] of data.events)if(s>=from)ev.push([s,c,k+1]);
 return {start:from,end,events:ev.sort((a,b)=>a[0]-b[0])};})();
const recent=data.recent.events.map(([s,city,k])=>({t:base+s*1000,city,kind:KINDS[k]?.id??(k===6?'controller':'signup')}));
const stream={t0:0,from:base+data.recent.start*1000,to:base+data.recent.end*1000,next:0,counts:null,todayOpens:0};
const streamClock=()=>stream.from+(performance.now()-stream.t0)*STREAM;
const endDay=new Date(stream.to).toISOString().slice(0,10);
function startStream(){stream.t0=performance.now();stream.next=0;stream.counts=Object.fromEntries(KINDS.map(k=>[k.id,0]));stream.todayOpens=0;feed.replaceChildren();layer.setLive(streamClock,STREAM);layer.pushLive(recent);}
function advanceStream(){
 const t=streamClock();if(t>stream.to){startStream();return;}
 while(stream.next<recent.length&&recent[stream.next].t<=t){const e=recent[stream.next++];stream.counts[e.kind]++;if(e.kind==='activity'&&new Date(e.t).toISOString().slice(0,10)===endDay)stream.todayOpens++;}
}
fetch(import.meta.env.BASE_URL+'api/live?probe=1').then(r=>r.ok?r.json():{configured:false}).catch(()=>({configured:false})).then(({configured})=>{
 liveKind=configured?'proxy':recent.length?'stream':null;
 liveButton.disabled=!liveKind;liveButton.title=liveKind?'Live events':'Live needs recent data. See README.';
 if(liveKind&&new URLSearchParams(location.search).has('live'))setMode('live'); // ?live opens straight into Live for demos
});
async function poll(first=false){
 try{
  const j=await(await fetch(`${import.meta.env.BASE_URL}api/live?since=${since}`)).json();
  if(!j.configured){setMode('replay');return;}
  skew=j.now-Date.now();lag=j.lag;liveToday=j.today;liveUpdated=j.updated;liveError=j.error||'';
  if(j.kpis){liveKpis=j.kpis;renderKpis();}
  const shaped=j.events.map(e=>({...e,city:layer.addCity(e.lat,e.lon,e.name,e.region,e.precise)})).filter(e=>e.city>=0);
  if(first){
   // Today's backlog: show the latest outcomes in the feed, animate only the last minute.
   const toSec=e=>(e.t-data.startDate.getTime())/1000,recentCut=liveClock()-60000;
   shaped.filter(e=>e.kind!=='activity'&&e.t<=recentCut).slice(-5).forEach(e=>pushFeed({kind:e.kind,city:e.city,at:toSec(e)}));
   layer.pushLive(shaped.filter(e=>e.t>recentCut));
  }else layer.pushLive(shaped);
  if(j.events.length)since=j.events.at(-1).t;
 }catch(e){liveError='Live data unavailable';console.error(e);}
}
function setMode(mode){
 const on=mode==='live'&&!!liveKind;if(on===live)return;live=on;
 document.querySelectorAll('.oasis-mode button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===(on?'live':'replay'))));
 shellRoot.classList.toggle('oasis-is-live',on);$('.ex-range-row').hidden=on; // Live has no timeline row
 feed.replaceChildren();clearInterval(liveTimer);
 if(on&&liveKind==='proxy'){since=0;liveToday=null;layer.setLive(liveClock);poll(true);liveTimer=setInterval(poll,POLL);}
 else if(on)startStream();
 else{layer.setLive(null);liveKpis=null;renderKpis();}
 startTour();
}
document.querySelectorAll('.oasis-mode button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));

const ago=ms=>{const m=Math.max(0,Math.round(ms/60000));return m<1?'just now':m<60?`${m} min ago`:`${Math.round(m/60)} h ago`;};
// Replay: the cards count up. Totals are as of the snapshot's end, so at replay time t each
// card is its total minus what arrives after t. "New this month" counts adds in t's month so far.
const sortedAt=k=>data.events.filter(e=>e[2]===k).map(e=>e[0]).sort((a,b)=>a-b);
const signupAt=sortedAt(4),addedAt=sortedAt(0);
const cumulative=d=>d?.reduce((a,n)=>(a.push((a.at(-1)??0)+n),a),[]);
const controllerCum=cumulative(data.kpis.controllerDaily),customerCum=cumulative(data.kpis.customerDaily),controllerUserCum=cumulative(data.kpis.controllerUserDaily);
// Controller IDs were rarely logged before June 2026, so early controller counts are understated.
const controllerTrackedFrom=(Date.UTC(2026,5,1)-data.startDate.getTime())/1000;
const countUpTo=(arr,t)=>{let lo=0,hi=arr.length;while(lo<hi){const m=(lo+hi)>>1;if(arr[m]<=t)lo=m+1;else hi=m;}return lo;};
function growKpis(){
 if(kpiView!=='network'||kpis.hidden)return;
 const t=layer.time,k=data.kpis,set=(id,v)=>{const el=kpis.querySelector(`[data-kpi="${id}"]`);if(el&&el.textContent!==v)el.textContent=v;};
 if(live){set('users',fmt.format(k.users));set('controllers',fmt.format(k.controllerUsers??k.controllers));set('controllersNote',k.controllerUsers?`Accounts with a controller · ${fmt.format(k.controllers)} located`:k.controllersNote??'Connected, all time');set('onlineLabel',onlineText);set('controllers',fmt.format(k.controllers));set('month',fmt.format(liveKpis?.addedMonth??k.addedMonth));set('monthLabel',`Controllers added in ${liveKpis?.month??k.month}`);return;}
 const day=Math.max(0,Math.floor(t/86400));
 set('users',fmt.format(customerCum?customerCum[Math.min(customerCum.length-1,day)]:k.users-(signupAt.length-countUpTo(signupAt,t))));
 const ids=controllerCum?controllerCum[Math.min(controllerCum.length-1,day)]:k.controllers;
 set('controllersNote',controllerUserCum?`Accounts with a controller · ${fmt.format(ids)} located${t<controllerTrackedFrom?' (IDs partly logged before June)':''}`:t<controllerTrackedFrom?'Seen in the app. IDs were only partly logged before June':(k.controllersNote??'Connected, all time'));
 // Controllers follow the real first-seen curve when the build provides it.
 set('controllers',fmt.format(controllerUserCum?controllerUserCum[Math.min(controllerUserCum.length-1,day)]:controllerCum?ids:k.controllers-(addedAt.length-countUpTo(addedAt,t))));
 const d=new Date(data.startDate.getTime()+t*1000),monthStart=Math.max(0,(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)-data.startDate.getTime())/1000);
 const month=d.toLocaleString('en-US',{month:'long',timeZone:'UTC'}),partial=monthStart===0&&data.startDate.getUTCDate()>1;

 set('monthLabel',t<controllerTrackedFrom?'Setup tracking began in June 2026':`Controllers added in ${month}${partial?` (from ${data.startDate.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})})`:''}`);
 set('month',t<controllerTrackedFrom?'—':fmt.format(countUpTo(addedAt,t)-countUpTo(addedAt,monthStart-1)));
 set('onlineLabel','Today · '+onlineText);
}
let lastUi=0;
function frame(t){
 requestAnimationFrame(frame);tickTour(t);
 const date=layer.date(),sun=subsolar(date);scene.setSunGeo(sun.lat,sun.lon);
 if(t-lastUi<100)return;lastUi=t;
 zoomOut.hidden=scene.getState().zoom<.3;
 const hour=Math.floor(layer.time/3600);
 if(live&&liveKind==='stream'){
  advanceStream();const t=new Date(streamClock()),day=t.toISOString().slice(0,10)===endDay?'Today':'Yesterday';
  ui.readout(`${day}, ${t.toLocaleTimeString('en-US',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hour12:false})} UTC`,`LIVE · ${fmt.format(stream.todayOpens)} OPENS TODAY`);
  liveStatus.textContent=data.generated?`Today and yesterday · updated ${ago(Date.now()-Date.parse(data.generated))}`:'Today and yesterday';
 }else if(live){
  ui.readout(clock(date)+' UTC',`LIVE · 5 MIN BEHIND · ${fmt.format(liveToday?.activity??0)} OPENS TODAY`);
  const age=liveUpdated?Math.max(0,Math.round((Date.now()+skew-liveUpdated)/1000)):null;
  liveStatus.textContent=liveError?`Live paused · ${liveError}`:age===null?'Connecting to Mixpanel…':`Five minutes behind real time · updated ${age<60?age+' s':Math.round(age/60)+' min'} ago`;
 }else{
  ui.readout(clock(date)+' UTC',`${data.project.toUpperCase()} · ${fmt.format(Math.round(data.prefix[Math.min(data.hours,hour+1)]-data.prefix[Math.max(0,hour-23)]))} OPENS IN THE LAST 24 H`);
  if(document.activeElement!==range)range.value=layer.time/data.duration;range.style.setProperty('--p',(layer.time/data.duration*100).toFixed(2)+'%');
 }
 growKpis();
 const counts=live?(liveKind==='stream'?stream.counts:liveToday)??{}:layer.counts;
 for(const k of KINDS)document.querySelector(`.oasis-chip[data-kind="${k.id}"] b`).textContent=fmt.format(Math.round(counts[k.id]??0));
}
requestAnimationFrame(frame);
setPlaying(!reduced());scene.setRotation(!reduced());if(!new URLSearchParams(location.search).has('live'))startTour();
try{await scene.whenReady;if($('#earth-canvas').dataset.assetError)throw Error('Earth texture unavailable');ui.ready();}catch(e){ui.status('Some Earth imagery could not load. Reload to try again.');console.error(e);}
