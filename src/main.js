import {shell,$,bindZoom,reduced} from './exploration-shell.js';
import {createScene} from './scene.js';
import {oasisLayer,prepare,subsolar,KINDS} from './oasis-layer.js';
import './oasis.css';

const views=[
 {kicker:'01 / TORO OASIS',title:'The Oasis network,<br> hour by hour.',body:'Thirty days of the Oasis app, replayed across the globe. Every red pulse is someone checking on a yard, every blue dot is a zone watering, and every green arc is a new controller joining the network from Toro HQ.'},
 {kicker:'NORTH AMERICA',title:'Where Oasis<br> lives.',body:'Almost all Oasis activity is in the US and Canada. The day line follows the replay clock, so you can watch each evening wave roll west.',lat:41,lon:-97,zoom:.2},
 {kicker:'THE NORTHEAST',title:'The Philadelphia<br> corridor.',body:'The Philadelphia suburbs are one of the densest Oasis clusters. Select any city to see its thirty days.',lat:40.1,lon:-75.4,zoom:.86},
 {kicker:'THE SOUTHWEST',title:'Built for<br> the heat.',body:'Phoenix, Scottsdale, Mesa and Chandler. Irrigation matters most where water is scarce, and the activity shows it.',lat:33.5,lon:-112,zoom:.8},
 {kicker:'AUSTRALIA',title:'The other side<br> of the day.',body:'Adelaide and Brisbane come alive while North America sleeps.',lat:-30,lon:142,zoom:.42},
];
const liveView={kicker:'LIVE',title:'Oasis,<br> right now.',body:'Activity from the Oasis network as it happens. Select an event in the feed to fly to it.'};
const fmt=new Intl.NumberFormat('en-US');
const legend=KINDS.map(k=>`<button class="oasis-chip" data-kind="${k.id}" aria-pressed="true" style="--chip:${k.color}"><i></i>${k.label}<b>0</b></button>`).join('');
const ui=shell({id:'planet',...views[0],chapters:['Network','North America','Northeast','Southwest','Australia'],rangeLabel:'Replay',note:'Oasis app analytics · City-level locations · Drag to rotate · Scroll to zoom · Select a city',legend,
 sources:`<p>Activity comes from Toro's <strong>Oasis</strong> app analytics. Locations are the city associated with each phone's connection, never a street address. Places with little activity are shown at their state or region instead, and are drawn dimmer.</p><p>Red pulses are app opens, placed in the hour they happened. Green beams and arcs are controllers being added. Amber marks setup errors and grey marks setups the user cancelled; they are shown separately because most unfinished setups are cancellations, not failures. Blue dots are zones watering, started from the app: mostly test runs while a controller is being set up, plus manual runs. Scheduled watering runs on the controller itself and is not shown.</p><p><strong>Network cards.</strong> Users are people who have opened the app since analytics began in April 2026. Controllers are those seen in the app since tracking of controller IDs began, which is lower than the full fleet. Online share is each controller's most recent reported status.</p><p><strong>Live</strong> streams real activity from today and yesterday, sped up so the network is always moving. The data is refreshed every hour.</p><p>Internal test traffic is excluded. No names, e-mail addresses, or user, device or controller identifiers are published. Times are UTC, and the sun position is approximate.</p><p>Globe renderer adapted from <a href="https://github.com/ethanplusai/earth-moon-solar" target="_blank" rel="noopener">Earth, Moon &amp; Solar System</a> by Ethan Rogers (MIT). Earth imagery is NASA-derived, via WebGL Earth and three-globe. The star background uses the HYG catalog (CC BY-SA 4.0). Place names from GeoNames (CC BY 4.0).</p>`});

// Elements the mobile layout moves must exist before the first await.
const shellRoot=$('.world-shell');
const kpis=document.createElement('section');kpis.className='oasis-kpis';kpis.setAttribute('aria-label','Network summary');shellRoot.append(kpis);
const feed=document.createElement('ol');feed.className='oasis-feed';feed.setAttribute('aria-label','Latest controller events');shellRoot.append(feed);
const zoomOut=document.createElement('button');zoomOut.className='oasis-zoomout';zoomOut.hidden=true;zoomOut.innerHTML='<span aria-hidden="true">−</span> Zoom out';shellRoot.append(zoomOut);
$('.ex-dock-top').insertAdjacentHTML('afterbegin','<div class="oasis-mode" role="group" aria-label="Mode"><button data-mode="replay" aria-pressed="true">Replay</button><button data-mode="live" aria-pressed="false"><i></i>Live</button></div>');
$('.ex-range-row').insertAdjacentHTML('beforeend','<span class="oasis-live-status" hidden></span>');

const scene=createScene($('#earth-canvas'),{exposure:1.22,daylight:[-.4,.32,1],homeView:[30,-96],onInteract:()=>scene.setRotation(false)});
scene.setReduced(reduced());bindZoom(scene);scene.setCityLights(.2);

async function load(){
 for(const url of ['data/oasis.json','data/oasis.sample.json'].map(p=>import.meta.env.BASE_URL+p)){const r=await fetch(url).catch(()=>null);if(r?.ok&&r.headers.get('content-type')?.includes('json'))return r.json();}
 throw Error('No Oasis dataset found');
}
const data=prepare(await load());
document.querySelector('.creator-link').innerHTML=data.source!=='mixpanel'?'Synthetic sample · <strong>No Toro data</strong>':data.generated?'Oasis analytics · <strong>Updated hourly</strong>':'Oasis analytics · <strong>Last 30 days</strong>';
if(data.source!=='mixpanel')document.querySelector('.wordmark').insertAdjacentHTML('beforeend','<span class="oasis-badge" title="Synthetic sample: run scripts/build-oasis-data.py to use real Mixpanel data">Sample data</span>');

const place=c=>{const [, , name,region]=data.cities[c];return region&&region!==name?`${name}, ${region}`:name;};
const clock=d=>d.toLocaleString('en-US',{timeZone:'UTC',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});

// Network cards: the default right-hand panel whenever no city is selected.
let liveKpis=null;
function renderKpis(){
 const k={...data.kpis,...(liveKpis??{})},pct=k.online==null?'—':`${(k.online*100).toFixed(1).replace(/\.0$/,'')}%`;
 const asOf=liveKpis?'<b class="oasis-live-dot"></b>Live':`As of ${new Date(k.asOf+'T12:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}`;
 kpis.innerHTML=`<header><span class="eyebrow">NETWORK</span><span>${asOf}</span></header>
  <div class="oasis-kpi"><span>Total users</span><strong>${fmt.format(k.users)}</strong><small>App users since ${k.usersSince}</small></div>
  <div class="oasis-kpi"><span>Controllers</span><strong>${fmt.format(k.controllers)}</strong><small>Seen in the app since ${k.controllersSince}</small></div>
  <div class="oasis-kpi"><span>New this month</span><strong style="color:#42ce11">${fmt.format(k.addedMonth)}</strong><small>Controllers added in ${k.month}</small></div>
  <div class="oasis-kpi"><span>Online now</span><strong>${pct}</strong><i class="oasis-meter"><b style="width:${(k.online??0)*100}%"></b></i><small>Of ${fmt.format(k.reporting)} at last status report</small></div>`;
}
renderKpis();

// Feed of controller outcomes. Each entry flies to its city.
const verb={added:'Controller added',error:'Setup error',cancelled:'Setup cancelled'};
const chips=Object.fromEntries(KINDS.map(k=>[k.id,true]));
function pushFeed({kind,city,at}){
 if(!chips[kind]||kind==='activity'||kind==='watering')return; // the feed is for controller outcomes
 const item=document.createElement('li');item.style.setProperty('--chip',KINDS.find(k=>k.id===kind).color);
 item.innerHTML=`<button><i></i><span><strong>${verb[kind]}</strong><em>${place(city)}</em></span><time>${clock(new Date(data.startDate.getTime()+at*1000)).split(', ')[1]}</time></button>`;
 item.querySelector('button').onclick=()=>focusCity(city);
 feed.prepend(item);while(feed.children.length>5)feed.lastChild.remove();
}

// City detail replaces the cards; closing it brings them back.
const detail=$('.ex-detail'),hoverTip=document.createElement('div');hoverTip.className='oasis-tip';hoverTip.hidden=true;shellRoot.append(hoverTip);
function spark(values){const max=Math.max(1,...values),w=240,h=64,step=w/(values.length-1);const pts=values.map((v,i)=>`${(i*step).toFixed(1)},${(h-4-(v/max)*(h-10)).toFixed(1)}`).join(' ');return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${h} ${pts} ${w},${h}" fill="#e1183722" stroke="none"/><polyline points="${pts}" fill="none" stroke="#e11837" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;}
function showCity(c){
 const open=c>=0;detail.hidden=!open;kpis.hidden=open;feed.hidden=open;
 if(!open)return;
 const t=data.totals[c],[lat,lon,name,region,precise]=data.cities[c],quiet=!t.opens&&!t.added&&!t.error&&!t.cancelled&&!t.watering;
 detail.innerHTML=`<button class="ex-close" aria-label="Close city">✕</button><span class="eyebrow">${precise?'CITY':'REGION'} · ${lat.toFixed(1)}°, ${lon.toFixed(1)}°</span><h2>${name}</h2><p class="oasis-region">${region&&region!==name?region:''}</p>${quiet?'<p class="oasis-caption">First seen in live mode. No activity in the thirty-day window.</p>':`<dl class="oasis-stats"><div><dt>App opens</dt><dd>${fmt.format(t.opens)}</dd></div><div><dt>Added</dt><dd style="color:#42ce11">${t.added}</dd></div><div><dt>Errors</dt><dd style="color:#ffb020">${t.error}</dd></div><div><dt>Cancelled</dt><dd>${t.cancelled}</dd></div><div><dt>Watering</dt><dd style="color:#3079f0">${t.watering}</dd></div></dl>${spark(t.daily)}<p class="oasis-caption">Daily app opens, last ${t.daily.length} days</p>`}`;
 detail.querySelector('.ex-close').onclick=()=>{layer.select(-1);showCity(-1);};
}
function hover(c,x,y){if(c<0){hoverTip.hidden=true;return;}hoverTip.hidden=false;hoverTip.textContent=`${place(c)} · ${fmt.format(data.totals[c].opens)} opens`;hoverTip.style.transform=`translate(${x+14}px,${y-10}px)`;}

const layer=scene.attachLayer(oasisLayer(data,{onEvent:pushFeed,onPick:showCity,onHover:hover}));
function focusCity(c){const [lat,lon]=data.cities[c];ui.active(-1);scene.flyTo(lat,lon,.8,2400);scene.setRotation(false);layer.select(c);showCity(c);}
function goHome(){ui.active(0);ui.copy(live?'live':'0',live?liveView:views[0]);scene.home();scene.setRotation(!reduced());}
zoomOut.onclick=goHome;

// Replay controls.
const range=$('#ex-range'),play=$('.ex-play'),liveStatus=$('.oasis-live-status');
function setPlaying(on){layer.setPlaying(on);play.setAttribute('aria-pressed',String(on));play.textContent=on?'Ⅱ Pause replay':'▶ Play replay';}
play.onclick=()=>setPlaying(!layer.playing);
range.oninput=e=>{layer.seek(+e.target.value*data.duration);feed.replaceChildren();};
const speed=document.createElement('button');speed.className='oasis-speed';speed.textContent='1 hr/s';speed.title='Replay speed';
const speeds=[[3600,'1 hr/s'],[3*3600,'3 hr/s'],[900,'15 min/s']];let speedIndex=0;
speed.onclick=()=>{speedIndex=(speedIndex+1)%speeds.length;layer.setSpeed(speeds[speedIndex][0]);speed.textContent=speeds[speedIndex][1];};
play.before(speed);
document.querySelectorAll('.oasis-chip').forEach(b=>{b.onclick=()=>{const on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));chips[b.dataset.kind]=on;layer.setVisible(b.dataset.kind,on);};});
document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>{const i=+b.dataset.chapter;if(i===0)return goHome();ui.active(i);ui.copy(String(i),views[i]);scene.flyTo(views[i].lat,views[i].lon,views[i].zoom,3000);scene.setRotation(false);});

// Live mode, two sources. With a server that has Mixpanel credentials (local dev), the
// proxy streams events five minutes behind real time. On GitHub Pages there is no
// server, so Live streams the real last 48 hours from the hourly build at STREAM× speed.
const POLL=30000,STREAM=120;let live=false,liveKind=null,liveTimer=0,since=0,skew=0,lag=300000,liveToday=null,liveUpdated=0,liveError='';
const liveClock=()=>Date.now()+skew-lag-POLL;
const liveButton=document.querySelector('[data-mode="live"]');
const base=data.startDate.getTime(),recent=(data.recent?.events??[]).map(([s,city,k])=>({t:base+s*1000,city,kind:KINDS[k].id}));
const stream={t0:0,from:base+(data.recent?.start??0)*1000,to:base+(data.recent?.end??0)*1000,next:0,counts:null,todayOpens:0};
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
 shellRoot.classList.toggle('oasis-is-live',on);range.hidden=on;liveStatus.hidden=!on;$('.ex-range-row label').textContent=on?'Live':'Replay';
 feed.replaceChildren();clearInterval(liveTimer);
 if(on&&liveKind==='proxy'){since=0;liveToday=null;layer.setLive(liveClock);poll(true);liveTimer=setInterval(poll,POLL);}
 else if(on)startStream();
 else{layer.setLive(null);liveKpis=null;renderKpis();}
 ui.active(0);ui.copy(on?'live':'0',on?liveView:views[0]);scene.home();scene.setRotation(!reduced());
}
document.querySelectorAll('.oasis-mode button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));

const ago=ms=>{const m=Math.max(0,Math.round(ms/60000));return m<1?'just now':m<60?`${m} min ago`:`${Math.round(m/60)} h ago`;};
let lastUi=0;
function frame(t){
 requestAnimationFrame(frame);
 const date=layer.date(),sun=subsolar(date);scene.setSunGeo(sun.lat,sun.lon);
 if(t-lastUi<100)return;lastUi=t;
 zoomOut.hidden=scene.getState().zoom<.3;
 const hour=Math.floor(layer.time/3600);
 if(live&&liveKind==='stream'){
  advanceStream();const t=new Date(streamClock()),day=t.toISOString().slice(0,10)===endDay?'Today':'Yesterday';
  ui.readout(`${day}, ${t.toLocaleTimeString('en-US',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hour12:false})} UTC`,`LIVE · ${fmt.format(stream.todayOpens)} OPENS TODAY`);
  liveStatus.textContent=`Today and yesterday · updated ${ago(Date.now()-Date.parse(data.generated))}`;
 }else if(live){
  ui.readout(clock(date)+' UTC',`LIVE · 5 MIN BEHIND · ${fmt.format(liveToday?.activity??0)} OPENS TODAY`);
  const age=liveUpdated?Math.max(0,Math.round((Date.now()+skew-liveUpdated)/1000)):null;
  liveStatus.textContent=liveError?`Live paused · ${liveError}`:age===null?'Connecting to Mixpanel…':`Five minutes behind real time · updated ${age<60?age+' s':Math.round(age/60)+' min'} ago`;
 }else{
  ui.readout(clock(date)+' UTC',`${data.project.toUpperCase()} · ${fmt.format(Math.round(data.prefix[Math.min(data.hours,hour+1)]-data.prefix[Math.max(0,hour-23)]))} OPENS IN THE LAST 24 H`);
  if(document.activeElement!==range)range.value=layer.time/data.duration;range.style.setProperty('--p',(layer.time/data.duration*100).toFixed(2)+'%');
 }
 const counts=live?(liveKind==='stream'?stream.counts:liveToday)??{}:layer.counts;
 for(const k of KINDS)document.querySelector(`.oasis-chip[data-kind="${k.id}"] b`).textContent=fmt.format(Math.round(counts[k.id]??0));
}
requestAnimationFrame(frame);
setPlaying(!reduced());scene.setRotation(!reduced());
try{await scene.whenReady;if($('#earth-canvas').dataset.assetError)throw Error('Earth texture unavailable');ui.ready();}catch(e){ui.status('Some Earth imagery could not load. Reload to try again.');console.error(e);}
