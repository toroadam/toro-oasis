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
 sources:`<p>Activity comes from Toro's <strong>Oasis</strong> app analytics, from when tracking began in April 2026. Locations are the city associated with each phone's connection, never a street address. Places with little activity are shown at their state or region instead, and are drawn dimmer.</p><p>Red pulses are app opens, placed in the hour they happened. Green beams and arcs are controllers being added. Amber marks setup errors and grey marks setups the user cancelled; they are shown separately because most unfinished setups are cancellations, not failures. Blue dots are zones watering, started from the app: mostly test runs while a controller is being set up, plus manual runs. Scheduled watering runs on the controller itself and is not shown.</p><p><strong>In Replay</strong> the network builds up from April: controllers count up from the day each was first seen, each place appears the first time it is active, new customers (sign-ups) and new controllers flash white before settling to red, and the customer and controller cards count up to today's totals.</p><p><strong>Network cards and globe activity</strong> count production traffic from signed-in customers only, excluding Toro staff and test accounts. Customers are everyone who has signed in since analytics began in April 2026, excluding Toro and test accounts. Controllers are every distinct controller that has connected (added, registered, reporting status or used in the app) since analytics began; controllers set up before then, or through app versions that did not record controller IDs, are not included, so the fleet is larger. Online is the share of controllers that reported being online in the last 30 days.</p><p><strong>Live</strong> streams real activity from today and yesterday, sped up so the network is always moving. The data is refreshed every hour.</p><p>Internal test traffic is excluded. No names, e-mail addresses, or user, device or controller identifiers are published. Times are UTC, and the sun position is approximate.</p><p>Globe renderer adapted from <a href="https://github.com/ethanplusai/earth-moon-solar" target="_blank" rel="noopener">Earth, Moon &amp; Solar System</a> by Ethan Rogers (MIT). Earth imagery is NASA-derived, via WebGL Earth and three-globe. The star background uses the HYG catalog (CC BY-SA 4.0). Place names from GeoNames (CC BY 4.0).</p>`});

// Elements the mobile layout moves must exist before the first await.
const shellRoot=$('.world-shell');
const kpis=document.createElement('section');kpis.className='oasis-kpis';kpis.setAttribute('aria-label','Network summary');shellRoot.append(kpis);
const feed=document.createElement('ol');feed.className='oasis-feed';feed.setAttribute('aria-label','Latest controller events');shellRoot.append(feed);
// Zoom out rides on top of the dock, so it clears the controls however tall they wrap.
const zoomOut=document.createElement('button');zoomOut.className='oasis-zoomout';zoomOut.hidden=true;zoomOut.innerHTML='<span aria-hidden="true">−</span> Zoom out';$('.ex-dock').append(zoomOut);
$('.ex-dock-top').insertAdjacentHTML('afterbegin','<div class="oasis-mode" role="group" aria-label="Mode"><button data-mode="replay" aria-pressed="true">Replay</button><button data-mode="live" aria-pressed="false"><i></i>Live</button></div>');
$('.ex-range-row').insertAdjacentHTML('beforeend','<span class="oasis-live-status" hidden></span>');

const scene=createScene($('#earth-canvas'),{exposure:1.22,daylight:[-.4,.32,1],homeView:[30,-96],homeOffset:.4,onInteract:()=>scene.setRotation(false)});
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
let liveKpis=null,kpiView='network',regionMetric='customers';
const METRICS={customers:{label:'Customers',key:'customers'},added:{label:'Controllers',key:'added'},opens:{label:'Activity',key:'opens'}};
const miniSpark=values=>{const max=Math.max(1,...values),w=54,h=16,step=w/(values.length-1);return `<svg class="oasis-mini" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${values.map((v,i)=>`${(i*step).toFixed(1)},${(h-1-(v/max)*(h-3)).toFixed(1)}`).join(' ')}" fill="none" stroke="#e11837" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>`;};
function renderRegions(){
 const m=METRICS[regionMetric],rows=[...(data.regions??[])].sort((a,b)=>b[m.key]-a[m.key]).slice(0,5),max=Math.max(1,rows[0]?.[m.key]??1);
 return `<div class="oasis-metrics" role="group" aria-label="Rank by">${Object.entries(METRICS).map(([id,x])=>`<button data-metric="${id}" aria-pressed="${id===regionMetric}">${x.label}</button>`).join('')}</div>
  <ol class="oasis-regions">${rows.map((r,i)=>`<li><button data-region="${data.regions.indexOf(r)}"><b>${i+1}</b><span>${r.region}</span>${miniSpark(r.daily)}<em>${fmt.format(r[m.key])}</em><i style="width:${(r[m.key]/max*100).toFixed(1)}%"></i></button></li>`).join('')}</ol>
  <p class="oasis-caption">${regionMetric==='customers'?'Signed-in customers':regionMetric==='added'?'Controllers added':'App opens'} by state or province, since April</p>`;
}
function renderKpis(){
 const k={...data.kpis,...(liveKpis??{})},pct=k.online==null?'—':`${(k.online*100).toFixed(1).replace(/\.0$/,'')}%`;
 const asOf=liveKpis?'<b class="oasis-live-dot"></b>Live':`As of ${new Date(k.asOf+'T12:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}`;
 kpis.classList.toggle('oasis-kpis-regions',kpiView==='regions');
 if($('.ex-detail').hidden)feed.hidden=kpiView==='regions'; // the leaderboard takes the feed's space
 kpis.innerHTML=`<header><div class="oasis-tabs" role="tablist"><button role="tab" data-view="network" aria-selected="${kpiView==='network'}">Network</button><button role="tab" data-view="regions" aria-selected="${kpiView==='regions'}">Top regions</button></div><span>${asOf}</span></header>
  ${kpiView==='regions'?renderRegions():`<div class="oasis-kpi"><span>Customers</span><strong data-kpi="users">${fmt.format(k.users)}</strong><small>${k.usersNote??`App users since ${k.usersSince}`}</small></div>
  <div class="oasis-kpi"><span>Controllers</span><strong data-kpi="controllers">${fmt.format(k.controllers)}</strong><small>${k.controllersNote??`Added through the app since ${k.controllersSince}`}</small></div>
  <div class="oasis-kpi"><span>New this month</span><strong style="color:#42ce11" data-kpi="month">${fmt.format(k.addedMonth)}</strong><small data-kpi="monthLabel">Controllers added in ${k.month}</small></div>
  <div class="oasis-kpi"><span>Online now</span><strong>${pct}</strong><i class="oasis-meter"><b style="width:${(k.online??0)*100}%"></b></i><small>${k.onlineNote?`Of ${fmt.format(k.reporting)} reporting, ${k.onlineNote.replace('seen online in the ','')}`:`Of ${fmt.format(k.reporting)} at last status report`}</small></div>`}`;
}
renderKpis();
kpis.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.view){kpiView=b.dataset.view;renderKpis();}
 else if(b.dataset.metric){regionMetric=b.dataset.metric;renderKpis();}
 else if(b.dataset.region)focusRegion(+b.dataset.region);
});

// Feed of controller outcomes. Each entry flies to its city.
const verb={added:'Controller added',error:'Setup error',cancelled:'Setup cancelled',signup:'New customer'};
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
 detail.innerHTML=`<button class="ex-close" aria-label="Close city">✕</button><span class="eyebrow">${precise?'CITY':'REGION'} · ${lat.toFixed(1)}°, ${lon.toFixed(1)}°</span><h2>${name}</h2><p class="oasis-region">${region&&region!==name?region:''}</p>${quiet?'<p class="oasis-caption">First seen in live mode. No activity in the replay window.</p>':`<dl class="oasis-stats"><div><dt>App opens</dt><dd>${fmt.format(t.opens)}</dd></div><div><dt>Added</dt><dd style="color:#42ce11">${t.added}</dd></div><div><dt>Errors</dt><dd style="color:#ffb020">${t.error}</dd></div><div><dt>Cancelled</dt><dd>${t.cancelled}</dd></div><div><dt>Watering</dt><dd style="color:#3079f0">${t.watering}</dd></div></dl>${spark(t.daily)}<p class="oasis-caption">Daily app opens since ${data.startDate.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</p>`}`;
 detail.querySelector('.ex-close').onclick=()=>{layer.select(-1);showCity(-1);};
}
function hover(c,x,y){if(c<0){hoverTip.hidden=true;return;}hoverTip.hidden=false;hoverTip.textContent=`${place(c)} · ${fmt.format(data.totals[c].opens)} opens`;hoverTip.style.transform=`translate(${x+14}px,${y-10}px)`;}

const layer=scene.attachLayer(oasisLayer(data,{onEvent:pushFeed,onPick:showCity,onHover:hover}));
function focusCity(c){const [lat,lon]=data.cities[c];ui.active(-1);scene.flyTo(lat,lon,.8,2400);scene.setRotation(false);layer.select(c);showCity(c);}
let shapes=null;
const loadShapes=()=>shapes??=fetch(import.meta.env.BASE_URL+'data/regions.geo.json').then(r=>r.ok?r.json():{}).catch(()=>({}));
function focusRegion(i){
 const r=data.regions[i];loadShapes().then(s=>{if(!detail.hidden&&detail.dataset.region===r.region)layer.highlight(s[r.region]);});ui.active(-1);scene.flyTo(r.lat,r.lon,.55,2400);scene.setRotation(false);layer.select(-1);
 detail.innerHTML=`<button class="ex-close" aria-label="Close region">✕</button><span class="eyebrow">REGION · ${r.lat.toFixed(1)}°, ${r.lon.toFixed(1)}°</span><h2>${r.region}</h2><p class="oasis-region">Since April 2026</p><dl class="oasis-stats"><div><dt>Customers</dt><dd>${fmt.format(r.customers)}</dd></div><div><dt>App opens</dt><dd>${fmt.format(r.opens)}</dd></div><div><dt>Added</dt><dd style="color:#42ce11">${r.added}</dd></div><div><dt>Errors</dt><dd style="color:#ffb020">${r.error}</dd></div><div><dt>Cancelled</dt><dd>${r.cancelled}</dd></div><div><dt>Watering</dt><dd style="color:#3079f0">${r.watering}</dd></div></dl>${spark(r.daily)}<p class="oasis-caption">Daily app opens since ${data.startDate.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</p>`;
 detail.dataset.region=r.region;detail.hidden=false;kpis.hidden=true;feed.hidden=true;detail.querySelector('.ex-close').onclick=()=>showCity(-1);
}
function goHome(){layer.highlight(null);ui.active(0);ui.copy(live?'live':'0',live?liveView:views[0]);scene.home();scene.setRotation(!reduced());}
zoomOut.onclick=goHome;

// Replay controls.
const range=$('#ex-range'),play=$('.ex-play'),liveStatus=$('.oasis-live-status');
function setPlaying(on){layer.setPlaying(on);play.setAttribute('aria-pressed',String(on));play.textContent=on?'Ⅱ Pause replay':'▶ Play replay';}
play.onclick=()=>setPlaying(!layer.playing);
range.oninput=e=>{layer.seek(+e.target.value*data.duration);feed.replaceChildren();};
const speed=document.createElement('button');speed.className='oasis-speed';speed.title='Replay speed';
// Six months of data: default to half a day per second (about six minutes end to end).
const speeds=[[12*3600,'12 hr/s'],[24*3600,'1 day/s'],[3600,'1 hr/s']];let speedIndex=0;speed.textContent=speeds[0][1];layer.setSpeed(speeds[0][0]);
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
const base=data.startDate.getTime();
// Without a separate recent window (the published snapshot), Live replays the last 48 hours of
// the replay data: controller events at their real times, each hour's app opens spread across it.
data.recent??=(()=>{const from=(data.hours-48)*3600,end=data.hours*3600,ev=[];let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(const [h,c,n] of data.activity)if(h*3600>=from)for(let i=0;i<n;i++)ev.push([h*3600+Math.floor(rnd()*3600),c,0]);
 for(const [s,c,k] of data.events)if(s>=from)ev.push([s,c,k+1]);
 return {start:from,end,events:ev.sort((a,b)=>a[0]-b[0])};})();
const recent=data.recent.events.map(([s,city,k])=>({t:base+s*1000,city,kind:KINDS[k]?.id??'signup'}));
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
 ui.active(0);ui.copy(on?'live':'0',on?liveView:views[0]);scene.home();scene.setRotation(!reduced());
}
document.querySelectorAll('.oasis-mode button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));

const ago=ms=>{const m=Math.max(0,Math.round(ms/60000));return m<1?'just now':m<60?`${m} min ago`:`${Math.round(m/60)} h ago`;};
// Replay: the cards count up. Totals are as of the snapshot's end, so at replay time t each
// card is its total minus what arrives after t. "New this month" counts adds in t's month so far.
const sortedAt=k=>data.events.filter(e=>e[2]===k).map(e=>e[0]).sort((a,b)=>a-b);
const signupAt=sortedAt(4),addedAt=sortedAt(0);
const controllerCum=data.kpis.controllerDaily?.reduce((a,n)=>(a.push((a.at(-1)??0)+n),a),[]);
const countUpTo=(arr,t)=>{let lo=0,hi=arr.length;while(lo<hi){const m=(lo+hi)>>1;if(arr[m]<=t)lo=m+1;else hi=m;}return lo;};
function growKpis(){
 if(kpiView!=='network'||kpis.hidden)return;
 const t=layer.time,k=data.kpis,set=(id,v)=>{const el=kpis.querySelector(`[data-kpi="${id}"]`);if(el&&el.textContent!==v)el.textContent=v;};
 if(live){set('users',fmt.format(k.users));set('controllers',fmt.format(k.controllers));set('month',fmt.format(liveKpis?.addedMonth??k.addedMonth));set('monthLabel',`Controllers added in ${liveKpis?.month??k.month}`);return;}
 set('users',fmt.format(k.users-(signupAt.length-countUpTo(signupAt,t))));
 // Controllers follow the real first-seen curve when the build provides it.
 set('controllers',fmt.format(controllerCum?controllerCum[Math.min(controllerCum.length-1,Math.max(0,Math.floor(t/86400)))]:k.controllers-(addedAt.length-countUpTo(addedAt,t))));
 const d=new Date(data.startDate.getTime()+t*1000),monthStart=Math.max(0,(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)-data.startDate.getTime())/1000);
 const month=d.toLocaleString('en-US',{month:'long',timeZone:'UTC'}),partial=monthStart===0&&data.startDate.getUTCDate()>1;
 set('month',fmt.format(countUpTo(addedAt,t)-countUpTo(addedAt,monthStart-1)));
 set('monthLabel',`Controllers added in ${month}${partial?` (from ${data.startDate.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})})`:''}`);
}
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
setPlaying(!reduced());scene.setRotation(!reduced());
try{await scene.whenReady;if($('#earth-canvas').dataset.assetError)throw Error('Earth texture unavailable');ui.ready();}catch(e){ui.status('Some Earth imagery could not load. Reload to try again.');console.error(e);}
