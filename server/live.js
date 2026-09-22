// Live Oasis events for the globe, read from the Mixpanel Export API on the server.
//
// The browser never sees credentials or identifiers: each event leaves here as
// {t, kind, lat, lon, name, region, precise}. Events are held back LAG_MS so that
// Mixpanel ingestion has settled. The Export API allows 60 requests an hour, so one
// shared poller serves every client: today's events every 90 s, plus the month's
// controller adds and 30 days of controller status every 15 min (about 48 an hour).

import fs from 'node:fs';
import path from 'node:path';

const LAG_MS = 5 * 60_000, POLL_MS = 90_000, SLOW_MS = 15 * 60_000, KEEP_MS = 26 * 3600_000;
const EVENTS = ['app_open', 'controller_add_completed', 'controller_add_failed', 'ControllerStatus'];
// Internal test traffic, as "Region|City;Region|City" in OASIS_INTERNAL_PLACES (kept out of the repo).
export const internalPlaces = () => new Set((process.env.OASIS_INTERNAL_PLACES ?? '').split(';').filter(Boolean).map(p => p.split('|').map(norm).join('|')));

export function norm(s) {
 s = String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
 s = s.replace(/saint /g, 'st ').replace(/st\. /g, 'st ').replace(/city of /g, '');
 return s.replace(/[^a-z0-9]+/g, ' ').trim();
}
const NOISE = /\b(state of|province of|provincia de|region|county|department|parish|territory of|national capital territory of|city)\b/g;
export const regionKey = s => norm(s).replace(NOISE, '').replace(/\s+/g, ' ').trim();
const day = ms => new Date(ms).toISOString().slice(0, 10);

export function createPlaces(root, {useDataset = true} = {}) {
 const read = f => {try {return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));} catch {return null;}};
 const known = new Map(), dataset = useDataset ? read('public/data/oasis.json') ?? read('public/data/oasis.sample.json') : null;
 for (const [lat, lon, name, region, precise] of dataset?.cities ?? []) known.set(`${norm(region)}|${norm(precise ? name : '')}`, {lat, lon, name, region, precise:!!precise});
 const gaz = read('data/gazetteer.json');
 return (cc, region, city) => {
  const k = `${norm(region)}|${norm(city)}`, hit = known.get(k);
  if (hit) return hit;
  const regions = (gaz?.regions[regionKey(region)] ?? []).filter(r => !cc || r[0] === cc).sort((a, b) => b[4] - a[4]);
  if (city && regions.length) for (const [c, a1] of regions) {const p = gaz.cities[`${c}|${a1}|${norm(city)}`]; if (p) return {lat:p[0], lon:p[1], name:city, region, precise:true};}
  if (regions[0]) return {lat:regions[0][2], lon:regions[0][3], name:region, region, precise:false};
  return known.get(`${norm(region)}|`) ?? null;
 };
}

export function createLive({account, secret, project, root, fetchImpl = fetch}) {
 const INTERNAL = internalPlaces();
 const configured = !!(account && secret && project), place = createPlaces(root);
 const auth = 'Basic ' + Buffer.from(`${account}:${secret}`).toString('base64');
 const seen = new Set(); let events = [], kpis = null, lastFast = 0, lastSlow = 0, error = null, busy = null;

 async function exportRange(from, to, names) {
  const url = `https://data.mixpanel.com/api/2.0/export?project_id=${project}&from_date=${from}&to_date=${to}&event=${encodeURIComponent(JSON.stringify(names))}`;
  const r = await fetchImpl(url, {headers:{authorization:auth, accept:'application/json'}});
  if (!r.ok) throw Error(`Mixpanel export ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.text()).split('\n').filter(Boolean).map(line => JSON.parse(line));
 }
 const internal = p => INTERNAL.has(`${norm(p.$region)}|${norm(p.$city)}`);
 function shape({event, properties:p}) {
  const kind = event === 'app_open' ? 'activity' : event === 'controller_add_completed' ? 'added' : event === 'controller_add_failed' ? (p.failure_category === 'server_error' ? 'error' : 'cancelled') : null;
  if (!kind || internal(p)) return null;
  const spot = place(p.mp_country_code, p.$region, p.$city);
  return spot && {t:Math.round(p.time * 1000), kind, ...spot};
 }

 async function refresh() {
  const now = Date.now();
  if (now - lastFast >= POLL_MS) {
   lastFast = now;
   const from = day(now - LAG_MS - KEEP_MS + 2 * 3600_000), fresh = await exportRange(from, day(now), EVENTS.slice(0, 3));
   for (const e of fresh) {const id = e.properties.$insert_id; if (id && seen.has(id)) continue; if (id) seen.add(id); const s = shape(e); if (s) events.push(s);}
   events = events.filter(e => e.t > now - KEEP_MS).sort((a, b) => a.t - b.t);
   if (seen.size > 200_000) seen.clear();
  }
  if (now - lastSlow >= SLOW_MS) {
   lastSlow = now;
   const month = day(now).slice(0, 8) + '01';
   const adds = (await exportRange(month, day(now), ['controller_add_completed'])).filter(e => !internal(e.properties));
   const latest = new Map();
   for (const {properties:p} of await exportRange(day(now - 30 * 864e5), day(now), ['ControllerStatus'])) {
    if (internal(p) || !p.ControllerStatus) continue;
    for (const id of [].concat(p.controller_id ?? [])) {const prev = latest.get(id); if (!prev || p.time > prev.time) latest.set(id, {time:p.time, online:p.ControllerStatus === 'Controller Online'});}
   }
   const online = [...latest.values()].filter(v => v.online).length;
   kpis = {addedMonth:adds.length, month:new Date(now).toLocaleString('en-US', {month:'long', timeZone:'UTC'}), online:latest.size ? online / latest.size : null, reporting:latest.size};
  }
  error = null;
 }

 async function snapshot(since) {
  if (!configured) return {configured:false};
  try {busy ??= refresh().finally(() => busy = null); await busy;} catch (e) {error = e.message; console.error('[oasis-live]', e.message);}
  const now = Date.now(), cutoff = now - LAG_MS, midnight = Date.parse(day(cutoff));
  const today = {activity:0, added:0, error:0, cancelled:0};
  for (const e of events) if (e.t >= midnight && e.t <= cutoff) today[e.kind]++;
  return {configured:true, now, lag:LAG_MS, updated:lastFast, error, kpis, today,
   events:events.filter(e => e.t > since && e.t <= cutoff)};
 }
 return {configured, snapshot};
}

// Vite plugin: serves /api/live from both `vite` and `vite preview`.
export function oasisLive(env, root) {
 const live = createLive({account:env.MIXPANEL_SERVICE_ACCOUNT, secret:env.MIXPANEL_SERVICE_SECRET, project:env.MIXPANEL_PROJECT_ID || '4009305', root});
 const handler = async (req, res, next) => {
  if (!req.url.startsWith('/api/live')) return next();
  const query = new URL(req.url, 'http://x').searchParams;
  // ?probe=1 answers from config alone so page load never spends an Export API request.
  const body = query.has('probe') ? {configured:live.configured} : await live.snapshot(Number(query.get('since')) || 0);
  res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
 };
 return {name:'oasis-live', configureServer(s) {s.middlewares.use(handler);}, configurePreviewServer(s) {s.middlewares.use(handler);}};
}
