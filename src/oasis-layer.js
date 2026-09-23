import * as THREE from 'three';

// Oasis activity drawn on the globe: surface ripples for app activity, beams for
// controller outcomes, blue dots for zones watering, and arcs from Toro HQ for every
// controller that joins.
// Time is simulation seconds from the start of the dataset; every effect ages in
// simulation time so pausing freezes the moment instead of letting it drain away.

export const KINDS = [
 {id:'activity',label:'App activity',color:'#e11837'},
 {id:'added',label:'Controller added',color:'#42ce11'},
 {id:'error',label:'Setup error',color:'#ffb020'},
 {id:'cancelled',label:'Setup cancelled',color:'#9aa6ab'},
 {id:'watering',label:'Watering',color:'#3079f0'},
];
const OUTCOMES = ['added', 'error', 'cancelled', 'watering', 'signup']; // replay event kinds 0-4 (signup: new customer)
const HQ = {lat:44.8408, lon:-93.2983}; // The Toro Company, Bloomington, Minnesota
const RIPPLES = 2048, BEAMS = 192, ARCS = 18, ARC_POINTS = 72;
const colors = KINDS.map(k => new THREE.Color(k.color));

export function subsolar(date) {
 const start = Date.UTC(date.getUTCFullYear(), 0, 0), doy = (date - start) / 864e5;
 const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
 return {lat: -23.44 * Math.cos(2 * Math.PI / 365 * (doy + 10)), lon: (12 - hours) * 15};
}

export function prepare(data) {
 const hours = data.hours, buckets = Array.from({length:hours}, () => []), prefix = new Float64Array(hours + 1);
 const days = Math.ceil(hours / 24), totals = data.cities.map(() => ({opens:0, added:0, error:0, cancelled:0, watering:0, signup:0, daily:new Array(days).fill(0)}));
 // When each city first shows activity; in Replay its marker appears (with a flash) at that moment.
 const born = new Float64Array(data.cities.length).fill(Infinity);
 for (const [h, c, n] of data.activity) {buckets[h]?.push([c, n]); totals[c].opens += n; totals[c].daily[Math.floor(h / 24)] += n; born[c] = Math.min(born[c], h * 3600);}
 for (let h = 0; h < hours; h++) prefix[h + 1] = prefix[h] + buckets[h].reduce((s, [, n]) => s + n, 0);
 for (const [at, c, k] of data.events) {totals[c][OUTCOMES[k]]++; born[c] = Math.min(born[c], at);}
 return {...data, startDate:new Date(data.start), buckets, prefix, totals, born, duration:hours * 3600};
}

function oriented(normal) {return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);}

export function oasisLayer(data, {onEvent, onPick, onHover} = {}) {
 return ({group, camera, renderer, radius, geographic}) => {
  const canvas = renderer.domElement, lift = radius + .017;
  const normals = data.cities.map(([lat, lon]) => geographic(lat, lon, 1).normalize());
  const positions = normals.map(n => n.clone().multiplyScalar(lift));
  const hq = geographic(HQ.lat, HQ.lon, 1).normalize();
  const time = {value:0}, visible = {value:KINDS.map(() => 1)};
  const palette = {value:colors};

  // Ripples: a flat quad per pulse, tangent to the surface, expanding with age.
  const rippleGeometry = new THREE.PlaneGeometry(1, 1);
  const birth = new THREE.InstancedBufferAttribute(new Float32Array(RIPPLES).fill(-1e9), 1).setUsage(THREE.DynamicDrawUsage);
  const kind = new THREE.InstancedBufferAttribute(new Float32Array(RIPPLES), 1).setUsage(THREE.DynamicDrawUsage);
  const strength = new THREE.InstancedBufferAttribute(new Float32Array(RIPPLES), 1).setUsage(THREE.DynamicDrawUsage);
  const life = new THREE.InstancedBufferAttribute(new Float32Array(RIPPLES).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
  rippleGeometry.setAttribute('aBirth', birth); rippleGeometry.setAttribute('aKind', kind); rippleGeometry.setAttribute('aStrength', strength); rippleGeometry.setAttribute('aLife', life);
  const rippleMaterial = new THREE.ShaderMaterial({
   uniforms:{uTime:time, uVisible:visible, uColors:palette},
   vertexShader:`attribute float aBirth,aKind,aStrength,aLife;uniform float uTime;varying vec2 vUv;varying float vAge,vKind,vStrength;
    void main(){float age=(uTime-aBirth)/aLife;vAge=age;vUv=uv*2.-1.;vKind=aKind;vStrength=aStrength;
     float size=(aKind<.5?.1:aKind>3.5?.13:.19)*(.18+.82*sqrt(clamp(age,0.,1.)))*(.55+.45*aStrength);
     if(age<0.||age>1.)size=0.;
     gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position*size,1.);}`,
   fragmentShader:`uniform vec3 uColors[5];uniform float uVisible[5];varying vec2 vUv;varying float vAge,vKind,vStrength;
    void main(){float r=length(vUv);if(r>1.)discard;float fade=pow(1.-vAge,1.6);
     float ring=smoothstep(.12,0.,abs(r-.8))*fade;float core=exp(-r*r*14.)*smoothstep(.35,0.,vAge);
     int k=int(vKind+.5);float on=uVisible[k];
     float a=(ring*1.25+core*.9)*(.5+.5*vStrength)*on;gl_FragColor=vec4(uColors[k]*a,a);}`,
   transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  });
  const ripples = new THREE.InstancedMesh(rippleGeometry, rippleMaterial, RIPPLES);
  ripples.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ripples.frustumCulled = false; ripples.renderOrder = 5; group.add(ripples);

  // Beams: thin columns that rise from the surface for controller outcomes.
  const beamBase = new THREE.CylinderGeometry(.0042, .0042, 1, 8, 1, true); beamBase.translate(0, .5, 0); beamBase.rotateX(Math.PI / 2);
  const beamGeometry = beamBase;
  const beamBirth = new THREE.InstancedBufferAttribute(new Float32Array(BEAMS).fill(-1e9), 1).setUsage(THREE.DynamicDrawUsage);
  const beamKind = new THREE.InstancedBufferAttribute(new Float32Array(BEAMS), 1).setUsage(THREE.DynamicDrawUsage);
  const beamLife = new THREE.InstancedBufferAttribute(new Float32Array(BEAMS).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
  beamGeometry.setAttribute('aBirth', beamBirth); beamGeometry.setAttribute('aKind', beamKind); beamGeometry.setAttribute('aLife', beamLife);
  const beams = new THREE.InstancedMesh(beamGeometry, new THREE.ShaderMaterial({
   uniforms:{uTime:time, uVisible:visible, uColors:palette},
   vertexShader:`attribute float aBirth,aKind,aLife;uniform float uTime;varying float vAge,vKind,vH;
    void main(){float age=(uTime-aBirth)/aLife;vAge=age;vKind=aKind;vH=position.z;
     float h=(aKind<1.5?.42:.26)*smoothstep(0.,.18,age);vec3 p=position;p.z*=h;if(age<0.||age>1.)p*=0.;
     gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);}`,
   fragmentShader:`uniform vec3 uColors[5];uniform float uVisible[5];varying float vAge,vKind,vH;
    void main(){int k=int(vKind+.5);float on=uVisible[k];
     float a=pow(1.-vH,1.5)*smoothstep(1.,.45,vAge)*on*.95;gl_FragColor=vec4(uColors[k]*a*1.4,a);}`,
   transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
  }), BEAMS);
  beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage); beams.frustumCulled = false; beams.renderOrder = 6; group.add(beams);

  // Arcs: a great-circle path from Toro HQ, drawn head-first then fading.
  const arcs = Array.from({length:ARCS}, () => {
   const geometry = new THREE.BufferGeometry();
   geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
   geometry.setAttribute('aT', new THREE.Float32BufferAttribute(Float32Array.from({length:ARC_POINTS}, (_, i) => i / (ARC_POINTS - 1)), 1));
   const material = new THREE.ShaderMaterial({
    uniforms:{uTime:time, uBirth:{value:-1e9}, uLife:{value:1}, uVisible:visible, uColor:{value:colors[1]}},
    vertexShader:`attribute float aT;varying float vT;void main(){vT=aT;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float uTime,uBirth,uLife;uniform float uVisible[5];uniform vec3 uColor;varying float vT;
     void main(){float age=(uTime-uBirth)/uLife;if(age<0.||age>1.)discard;float head=smoothstep(0.,.55,age);
      float trail=smoothstep(head-.45,head,vT)*step(vT,head);float fade=smoothstep(1.,.6,age);
      float a=(trail*.85+step(vT,head)*.18)*fade*uVisible[1];gl_FragColor=vec4(uColor*a*1.3,a);}`,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
   });
   const line = new THREE.Line(geometry, material); line.frustumCulled = false; line.renderOrder = 7; group.add(line); return line;
  });

  // City markers: soft dots that brighten when their city is active. Capacity leaves
  // room for places that first appear in live mode.
  const capacity = positions.length + 1024, markerGeometry = new THREE.BufferGeometry();
  const markerPosition = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3), heat = new Float32Array(capacity);
  const heatAttribute = new THREE.BufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage);
  const sizeAttribute = new THREE.BufferAttribute(new Float32Array(capacity), 1), preciseAttribute = new THREE.BufferAttribute(new Float32Array(capacity), 1);
  const bornAttribute = new THREE.BufferAttribute(new Float32Array(capacity).fill(-1e9), 1), flashAttribute = new THREE.BufferAttribute(new Float32Array(capacity).fill(-1e9), 1).setUsage(THREE.DynamicDrawUsage);
  const flashLength = {value:3600}, grow = {value:1};
  const sizeFor = t => 2.2 + Math.log10(1 + t.opens) * 1.7;
  positions.forEach((p, i) => {markerPosition.setXYZ(i, p.x, p.y, p.z); sizeAttribute.array[i] = sizeFor(data.totals[i]); preciseAttribute.array[i] = data.cities[i][4];
   bornAttribute.array[i] = Number.isFinite(data.born[i]) ? data.born[i] : -1e9; flashAttribute.array[i] = bornAttribute.array[i];});
  markerGeometry.setAttribute('position', markerPosition); markerGeometry.setAttribute('aHeat', heatAttribute);
  markerGeometry.setAttribute('aSize', sizeAttribute); markerGeometry.setAttribute('aPrecise', preciseAttribute);
  markerGeometry.setAttribute('aBorn', bornAttribute); markerGeometry.setAttribute('aFlash', flashAttribute);
  markerGeometry.setDrawRange(0, positions.length);
  const byCoordinate = new Map(data.cities.map((c, i) => [`${c[0].toFixed(2)}|${c[1].toFixed(2)}`, i]));
  function addCity(lat, lon, name, region, precise) {
   const key = `${lat.toFixed(2)}|${lon.toFixed(2)}`;
   if (byCoordinate.has(key)) return byCoordinate.get(key);
   const i = positions.length; if (i >= capacity) return -1;
   const n = geographic(lat, lon, 1).normalize(); normals.push(n); positions.push(n.clone().multiplyScalar(lift));
   data.cities.push([lat, lon, name, region, precise ? 1 : 0]);
   data.totals.push({opens:0, added:0, error:0, cancelled:0, daily:new Array(data.totals[0]?.daily.length ?? 30).fill(0)});
   markerPosition.setXYZ(i, positions[i].x, positions[i].y, positions[i].z); sizeAttribute.array[i] = 2.2; preciseAttribute.array[i] = precise ? 1 : 0;
   bornAttribute.array[i] = flashAttribute.array[i] = -1e9;
   markerPosition.needsUpdate = sizeAttribute.needsUpdate = preciseAttribute.needsUpdate = bornAttribute.needsUpdate = flashAttribute.needsUpdate = true;
   markerGeometry.setDrawRange(0, i + 1); byCoordinate.set(key, i); return i;
  }
  const pixel = {value:Math.min(devicePixelRatio, 1.75)}, center = {value:new THREE.Vector3()}, selected = {value:-1};
  const markerMaterial = new THREE.ShaderMaterial({
   uniforms:{uPixel:pixel, uCenter:center, uSelected:selected, uOn:{value:1}, uTime:time, uFlashLength:flashLength, uGrow:grow},
   vertexShader:`attribute float aHeat,aSize,aPrecise,aBorn,aFlash;uniform float uPixel,uSelected,uTime,uFlashLength,uGrow;uniform vec3 uCenter;varying float vHeat,vFade,vPrecise,vSel,vFlash;
    void main(){vec4 w=modelMatrix*vec4(position,1.);vec3 n=normalize(w.xyz-uCenter);vFade=smoothstep(.02,.28,dot(n,normalize(cameraPosition-w.xyz)));
     vHeat=aHeat;vPrecise=aPrecise;vSel=float(gl_VertexID)==uSelected?1.:0.;
     float since=uTime-aFlash;vFlash=since>=0.?exp(-since/uFlashLength):0.;
     if(uGrow>.5&&uTime<aBorn)vFade=0.;
     gl_PointSize=(aSize*(.8+.4*aPrecise)+aHeat*7.+vSel*9.+vFlash*12.)*uPixel*(10.5/max(length(cameraPosition-uCenter),3.));
     gl_Position=projectionMatrix*viewMatrix*w;}`,
   fragmentShader:`uniform float uOn;varying float vHeat,vFade,vPrecise,vSel,vFlash;
    void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float glow=pow(1.-d,2.2);float core=smoothstep(.42,.2,d);
     vec3 base=mix(vec3(1.,.1,.25),vec3(1.,.85,.85),clamp(vHeat*.7,0.,1.));base=mix(base,vec3(1.),max(vSel,vFlash));
     float a=(glow*(.45+.55*vPrecise)+core*(.95+vHeat*.5)+vFlash*glow*1.2)*vFade*uOn;gl_FragColor=vec4(base*a,a);}`,
   transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  });
  const markers = new THREE.Points(markerGeometry, markerMaterial); markers.frustumCulled = false; markers.renderOrder = 4; group.add(markers);

  // Region highlight: the selected state/province painted translucent white onto an
  // equirectangular canvas wrapped on a sphere just above the surface.
  const shade = document.createElement('canvas'); shade.width = 4096; shade.height = 2048;
  const shadeCtx = shade.getContext('2d'), shadeTexture = new THREE.CanvasTexture(shade);
  shadeTexture.colorSpace = THREE.SRGBColorSpace; shadeTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const shadeMaterial = new THREE.MeshBasicMaterial({map:shadeTexture, transparent:true, opacity:0, depthWrite:false});
  const shadeMesh = new THREE.Mesh(new THREE.SphereGeometry(radius + .015, 160, 100), shadeMaterial);
  shadeMesh.renderOrder = 3; shadeMesh.visible = false; group.add(shadeMesh);
  let shadeTarget = 0;
  function highlight(rings, color = '#ffffff') {
   if (!rings?.length) {shadeTarget = 0; return;}
   const W = shade.width, H = shade.height, x = lon => (lon + 180) / 360 * W, y = lat => (90 - lat) / 180 * H;
   shadeCtx.clearRect(0, 0, W, H); shadeCtx.lineJoin = 'round';
   for (const ring of rings) {
    shadeCtx.beginPath();
    for (let i = 0; i < ring.length; i += 2) (i ? shadeCtx.lineTo : shadeCtx.moveTo).call(shadeCtx, x(ring[i]), y(ring[i + 1]));
    shadeCtx.closePath(); shadeCtx.globalAlpha = color === '#ffffff' ? .4 : .55; shadeCtx.fillStyle = color; shadeCtx.fill();
    shadeCtx.globalAlpha = .85; shadeCtx.strokeStyle = '#ffffff'; shadeCtx.lineWidth = 2; shadeCtx.stroke(); shadeCtx.globalAlpha = 1;
   }
   shadeTexture.needsUpdate = true; shadeMesh.visible = true; shadeTarget = 1;
  }

  let rippleCursor = 0, beamCursor = 0, arcCursor = 0;
  const matrix = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1);
  function ripple(c, k, at, s, lifeSeconds) {
   const i = rippleCursor = (rippleCursor + 1) % RIPPLES;
   matrix.compose(positions[c], oriented(normals[c]), unit); ripples.setMatrixAt(i, matrix);
   birth.array[i] = at; kind.array[i] = k; strength.array[i] = s; life.array[i] = lifeSeconds;
   dirty.ripples = true;
  }
  function beam(c, k, at, lifeSeconds) {
   const i = beamCursor = (beamCursor + 1) % BEAMS;
   matrix.compose(normals[c].clone().multiplyScalar(radius + .004), oriented(normals[c]), unit); beams.setMatrixAt(i, matrix);
   beamBirth.array[i] = at; beamKind.array[i] = k; beamLife.array[i] = lifeSeconds; dirty.beams = true;
  }
  function arc(c, at, lifeSeconds) {
   const line = arcs[arcCursor = (arcCursor + 1) % ARCS], to = normals[c], angle = hq.angleTo(to);
   const attribute = line.geometry.attributes.position, height = .06 + angle * .32, v = new THREE.Vector3();
   for (let i = 0; i < ARC_POINTS; i++) {const t = i / (ARC_POINTS - 1); v.copy(hq).lerp(to, t).normalize().multiplyScalar(lift + Math.sin(Math.PI * t) * height); attribute.setXYZ(i, v.x, v.y, v.z);}
   attribute.needsUpdate = true; line.material.uniforms.uBirth.value = at; line.material.uniforms.uLife.value = lifeSeconds;
  }
  const dirty = {ripples:false, beams:false};

  // Simulation clock. In live mode the clock is wall time (minus the lag) and effects
  // come from a queue fed by the live poller instead of the replay dataset.
  let now = 0, playing = true, speed = 3600, nextHour = 0, nextEvent = 0, live = null, liveSpeed = 1, replayAt = 0, queue = [];
  const counts = Object.fromEntries(KINDS.map(k => [k.id, 0]));
  function flash(c, at) {flashAttribute.array[c] = at; flashAttribute.needsUpdate = true;}
  function clear() {flashAttribute.array.set(bornAttribute.array); flashAttribute.needsUpdate = true;birth.array.fill(-1e9); beamBirth.array.fill(-1e9); arcs.forEach(a => a.material.uniforms.uBirth.value = -1e9); heat.fill(0); dirty.ripples = dirty.beams = true;}
  function seek(seconds) {
   now = THREE.MathUtils.clamp(seconds, 0, data.duration - 1);
   clear();
   nextHour = Math.floor(now / 3600); counts.activity = data.prefix[nextHour];
   nextEvent = 0; for (const k of OUTCOMES) counts[k] = 0;
   while (nextEvent < data.events.length && data.events[nextEvent][0] < now) {counts[OUTCOMES[data.events[nextEvent][2]]]++; nextEvent++;}
  }
  function spawnUntil(limit) {
   const pulse = 1.9 * speed, burst = 3.2 * speed;
   while (nextHour < data.buckets.length && nextHour * 3600 <= limit) {
    for (const [c, n] of data.buckets[nextHour]) {
     // At fast speeds one ripple per city-hour keeps the globe readable (and the pool from churning).
     const k = speed > 7200 ? 1 : Math.min(n, 4), s = THREE.MathUtils.clamp(n / 4, .35, 1);
     for (let j = 0; j < k; j++) ripple(c, 0, nextHour * 3600 + Math.random() * 3600, s, pulse);
     counts.activity += n;
    }
    nextHour++;
   }
   while (nextEvent < data.events.length && data.events[nextEvent][0] <= limit) {
    const [at, c, k] = data.events[nextEvent++], type = k + 1;
    if (type === 5) {flash(c, at); counts.signup = (counts.signup ?? 0) + 1; onEvent?.({kind:'signup', city:c, at}); continue;}
    if (type === 4) {ripple(c, 4, at, 1, pulse * 1.6); counts.watering++; onEvent?.({kind:'watering', city:c, at}); continue;}
    if (type === 1) flash(c, at);
    ripple(c, type, at, 1, burst); if (type < 3) beam(c, type, at, burst * 1.3); if (type === 1) arc(c, at, burst * 1.6);
    heat[c] = Math.min(2, heat[c] + (type === 1 ? 1.4 : .8));
    counts[KINDS[type].id]++; onEvent?.({kind:KINDS[type].id, city:c, at});
   }
  }
  function spawnLive() {
   while (queue.length && queue[0].at <= now) {
    const {at, city:c, kind:id} = queue.shift(), type = KINDS.findIndex(k => k.id === id); // signup: -1 (no legend kind)
    // Lifetimes are in simulation seconds, so they scale with the stream speed.
    const k = liveSpeed > 1 ? liveSpeed : 2; // true live: events are sparse, let them linger
    if (type === 0) {ripple(c, 0, at, .8, 3.5 * k); heat[c] = Math.min(2, heat[c] + .35); continue;}
    if (type === 4) {ripple(c, 4, at, 1, 5 * k); onEvent?.({kind:id, city:c, at}); continue;}
    if (type < 0) {flash(c, at); onEvent?.({kind:id, city:c, at}); continue;}
    if (type === 1) flash(c, at);
    ripple(c, type, at, 1, 7 * k); if (type < 3) beam(c, type, at, 10 * k); if (type === 1) arc(c, at, 12 * k);
    heat[c] = Math.min(2, heat[c] + (type === 1 ? 1.4 : .8));
    onEvent?.({kind:id, city:c, at});
   }
  }
  seek(0);

  // Picking: nearest visible marker to the pointer, in screen space.
  const world = new THREE.Vector3(), toCamera = new THREE.Vector3(), mid = new THREE.Vector3();
  function pick(x, y, within = 22) {
   const rect = canvas.getBoundingClientRect(); let best = -1, bestDistance = within * within;
   group.getWorldPosition(mid);
   positions.forEach((p, i) => {
    world.copy(p).applyMatrix4(group.matrixWorld);
    if (world.clone().sub(mid).normalize().dot(toCamera.copy(camera.position).sub(world).normalize()) < .12) return;
    world.project(camera); const sx = (world.x + 1) / 2 * rect.width + rect.left, sy = (1 - world.y) / 2 * rect.height + rect.top;
    const d = (sx - x) ** 2 + (sy - y) ** 2; if (d < bestDistance) {bestDistance = d; best = i;}
   });
   return best;
  }
  let press = null, hoverFrame = 0;
  canvas.addEventListener('pointerdown', e => press = {x:e.clientX, y:e.clientY});
  canvas.addEventListener('pointerup', e => {if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) {const c = pick(e.clientX, e.clientY); selected.value = c; onPick?.(c);} press = null;});
  canvas.addEventListener('pointermove', e => {if (e.buttons || hoverFrame) return; hoverFrame = requestAnimationFrame(() => {hoverFrame = 0; const c = pick(e.clientX, e.clientY, 14); canvas.style.cursor = c >= 0 ? 'pointer' : ''; onHover?.(c, e.clientX, e.clientY);});});

  return {
   update(t, dt) {
    if (live) {now = (live() - data.startDate.getTime()) / 1000; spawnLive();}
    else {if (playing) {now += dt * speed; if (now >= data.duration) seek(0);} spawnUntil(now + (playing ? speed * .05 : 0));}
    time.value = now;
    const decay = Math.exp(-dt * (live ? .5 : playing ? 1.1 : 0));
    for (let i = 0; i < positions.length; i++) heat[i] *= decay;
    heatAttribute.needsUpdate = true;
    if (dirty.ripples) {ripples.instanceMatrix.needsUpdate = birth.needsUpdate = kind.needsUpdate = strength.needsUpdate = life.needsUpdate = true; dirty.ripples = false;}
    if (dirty.beams) {beams.instanceMatrix.needsUpdate = beamBirth.needsUpdate = beamKind.needsUpdate = beamLife.needsUpdate = true; dirty.beams = false;}
    group.getWorldPosition(center.value);
    flashLength.value = 1.4 * (live ? Math.max(liveSpeed, 2) : speed); grow.value = live ? 0 : 1;
    shadeMaterial.opacity += (shadeTarget - shadeMaterial.opacity) * (1 - Math.exp(-dt * 4));
    if (shadeTarget === 0 && shadeMaterial.opacity < .01) shadeMesh.visible = false;
   },
   highlight,
   get time() {return now;}, get playing() {return playing;}, counts,
   date() {return new Date(data.startDate.getTime() + now * 1000);},
   seek, setPlaying(v) {playing = v;}, setSpeed(v) {speed = v;}, get speed() {return speed;},
   setVisible(id, on) {const i = KINDS.findIndex(k => k.id === id); visible.value[i] = on ? 1 : 0; if (i === 0) markerMaterial.uniforms.uOn.value = on ? 1 : .35;},
   select(c) {selected.value = c;},
   addCity, get live() {return !!live;},
   // clock: () => epoch ms for "now" in live mode, or null to return to the replay where it was.
   // speed: simulation seconds per real second (1 for true live, higher for a stream).
   setLive(clock, speed = 1) {if (clock && !live) replayAt = now; live = clock; liveSpeed = speed; queue = []; clear(); if (!clock) seek(replayAt);},
   pushLive(items) {for (const e of items) queue.push({at:(e.t - data.startDate.getTime()) / 1000, city:e.city, kind:e.kind}); queue.sort((a, b) => a.at - b.at);},
  };
 };
}
