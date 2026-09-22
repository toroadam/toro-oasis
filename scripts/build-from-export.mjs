#!/usr/bin/env node
// Builds public/data/oasis.json straight from the Mixpanel Export API. The Pages
// workflow runs this hourly; nothing it produces is committed to git.
//
//   MIXPANEL_SERVICE_ACCOUNT=… MIXPANEL_SERVICE_SECRET=… node scripts/build-from-export.mjs
//
// Raw events are reduced on arrival to one small row each, with user and controller
// IDs replaced by keyed hashes, and cached per UTC day in data/cache/. Past days never
// change, so after the first run each build re-downloads only yesterday and today
// (one Export API request).
//
// The published file is public. It holds only places, hourly counts and event times:
//  - places with fewer than MIN_PLACE_EVENTS events in the window are folded into their
//    region, so a single install in a small town is not pinpointed;
//  - internal test traffic is excluded;
//  - no user, device or controller identifiers, hashed or otherwise, are written.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {createPlaces, norm, internalPlaces} from '../server/live.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const {MIXPANEL_SERVICE_ACCOUNT:account, MIXPANEL_SERVICE_SECRET:secret} = process.env;
const project = process.env.MIXPANEL_PROJECT_ID || '4009305';
const TRACKING_START = '2026-04-01', WINDOW_DAYS = 30, RECENT_HOURS = 48, MIN_PLACE_EVENTS = 10;
// Indices 5+ are zones watering started from the app (mostly test runs during setup).
const EVENTS = ['app_open', 'controller_add_completed', 'controller_add_failed', 'ControllerStatus', 'controllers_loaded',
 'ZonePlayPauseButton_clicked', 'TestZone_action', 'TestAll_Button_clicked', 'manual_run_requested_success'];
const CACHE = process.env.OASIS_CACHE_DIR || path.join(ROOT, 'data/cache');
const DAY = 864e5, HOUR = 36e5;
const iso = ms => new Date(ms).toISOString().slice(0, 10);

export function minimise({event, properties:p}, hash) {
 // [time ms, event index, country, region, city, server_error?, status (0 none, 1 online, 2 offline), controller hashes, user hash]
 const status = p.ControllerStatus === 'Controller Online' ? 1 : p.ControllerStatus === 'Controller Offline' ? 2 : 0;
 return [Math.round(p.time * 1000), EVENTS.indexOf(event), p.mp_country_code ?? '', p.$region ?? '', p.$city ?? '',
  p.failure_category === 'server_error' ? 1 : 0, status, [].concat(p.controller_id ?? []).map(hash), p.$user_id ? hash(p.$user_id) : ''];
}

async function* exportLines(from, to) {
 const url = `https://data.mixpanel.com/api/2.0/export?project_id=${project}&from_date=${from}&to_date=${to}&event=${encodeURIComponent(JSON.stringify(EVENTS))}`;
 const r = await fetch(url, {headers:{authorization:'Basic ' + Buffer.from(`${account}:${secret}`).toString('base64')}});
 if (!r.ok) throw Error(`Mixpanel export ${r.status}: ${(await r.text()).slice(0, 200)}`);
 const decoder = new TextDecoder(); let buffer = '';
 for await (const chunk of r.body) {
  buffer += decoder.decode(chunk, {stream:true});
  let i; while ((i = buffer.indexOf('\n')) >= 0) {const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); if (line) yield JSON.parse(line);}
 }
 if (buffer.trim()) yield JSON.parse(buffer);
}

// Shards are encrypted: on a public repo, fork pull requests can read the Actions cache
// but never receive the secret the key is derived from.
const shardPath = day => path.join(CACHE, `${day}.bin`);
let shardKey;
function writeShard(day, rows) {
 const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', shardKey, iv);
 const body = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(rows))), c.final()]);
 fs.writeFileSync(shardPath(day), Buffer.concat([iv, c.getAuthTag(), body]));
}
function readShard(day) {
 const buf = fs.readFileSync(shardPath(day)), d = crypto.createDecipheriv('aes-256-gcm', shardKey, buf.subarray(0, 12));
 d.setAuthTag(buf.subarray(12, 28));
 return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(28)), d.final()])));
}

async function syncShards(now, hash) {
 fs.mkdirSync(CACHE, {recursive:true});
 const today = iso(now), yesterday = iso(now - DAY), days = [];
 for (let t = Date.parse(TRACKING_START); t <= now; t += DAY) days.push(iso(t));
 const stale = days.filter(d => d >= yesterday || !fs.existsSync(shardPath(d)));
 if (!stale.length) return days;
 const byDay = new Map(stale.map(d => [d, []])); let n = 0;
 for await (const e of exportLines(stale[0], today)) {const row = minimise(e, hash), d = iso(row[0]); if (byDay.has(d)) byDay.get(d).push(row); n++;}
 for (const [d, rows] of byDay) writeShard(d, rows);
 console.log(`exported ${n} events for ${stale[0]} … ${today} (${stale.length} day shards refreshed)`);
 return days;
}

export function build(rows, now, place) {
 const end = Math.floor(now / HOUR) * HOUR, start = end - WINDOW_DAYS * DAY, recentStart = now - RECENT_HOURS * HOUR;
 const INTERNAL = internalPlaces(), customer = rows.filter(r => !INTERNAL.has(`${norm(r[3])}|${norm(r[4])}`));
 const inWindow = customer.filter(r => r[0] >= start && r[0] <= now && (r[1] <= 2 || r[1] >= 5));

 // Two passes: count events per exact place, then fold sparse places into their region.
 const exact = r => place(r[2], r[3], r[4]), counts = new Map();
 for (const r of inWindow) {const p = exact(r); if (p) {const k = `${p.lat},${p.lon}`; counts.set(k, (counts.get(k) ?? 0) + 1);}}
 const cities = [], index = new Map();
 function cityOf(r) {
  let p = exact(r); if (!p) return -1;
  if (p.precise && (counts.get(`${p.lat},${p.lon}`) ?? 0) < MIN_PLACE_EVENTS) p = place(r[2], r[3], '') ?? p;
  const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
  if (!index.has(k)) {index.set(k, cities.length); cities.push([+p.lat.toFixed(3), +p.lon.toFixed(3), p.precise ? p.name : p.region, p.region, p.precise ? 1 : 0]);}
  return index.get(k);
 }

 const activity = new Map(), events = [], recent = [];
 for (const r of inWindow) {
  const c = cityOf(r); if (c < 0) continue;
  const kind = r[1] === 0 ? 0 : r[1] === 1 ? 1 : r[1] >= 5 ? 4 : r[5] ? 2 : 3; // activity, added, error, cancelled, watering
  if (r[0] < end) {
   if (kind === 0) {const k = `${Math.floor((r[0] - start) / HOUR)},${c}`; activity.set(k, (activity.get(k) ?? 0) + 1);}
   else events.push([Math.round((r[0] - start) / 1000), c, kind - 1]);
  }
  if (r[0] >= recentStart) recent.push([Math.round((r[0] - start) / 1000), c, kind]);
 }

 // Network cards.
 const users = new Set(), controllers = new Set(), latest = new Map(); let firstController = null;
 const monthStart = Date.parse(iso(now).slice(0, 8) + '01'); let addedMonth = 0;
 for (const r of customer) {
  if (r[1] === 0 && r[8]) users.add(r[8]);
  if (r[1] === 4 && r[7].length) {r[7].forEach(c => controllers.add(c)); firstController ??= r[0];}
  if (r[1] === 1 && r[0] >= monthStart) addedMonth++;
  if (r[1] === 3 && r[6] && r[0] >= now - WINDOW_DAYS * DAY) for (const c of r[7]) if (!latest.has(c) || latest.get(c)[0] < r[0]) latest.set(c, [r[0], r[6] === 1]);
 }
 const online = [...latest.values()].filter(v => v[1]).length, monthYear = ms => new Date(ms).toLocaleString('en-US', {month:'short', year:'numeric', timeZone:'UTC'});
 return {
  source:'mixpanel', project:'Oasis Mobile', generated:new Date(now).toISOString(),
  start:new Date(start).toISOString(), hours:WINDOW_DAYS * 24, cities,
  activity:[...activity].map(([k, n]) => [...k.split(',').map(Number), n]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  events:events.sort((a, b) => a[0] - b[0]),
  recent:{start:Math.round((recentStart - start) / 1000), end:Math.round((now - start) / 1000), events:recent.sort((a, b) => a[0] - b[0])},
  kpis:{users:users.size, usersSince:monthYear(Date.parse(TRACKING_START)), controllers:controllers.size, controllersSince:firstController ? monthYear(firstController) : '—',
   addedMonth, month:new Date(now).toLocaleString('en-US', {month:'long', timeZone:'UTC'}),
   online:latest.size ? +(online / latest.size).toFixed(3) : null, reporting:latest.size, asOf:iso(now)},
 };
}

export async function main() {
 if (!account || !secret) {console.log('No Mixpanel service account configured; the site will use the synthetic sample.'); return;}
 const now = Date.now(), key = crypto.createHash('sha256').update(`oasis-globe:${secret}`).digest();
 shardKey = crypto.createHash('sha256').update(`oasis-globe-shards:${secret}`).digest();
 const hash = v => crypto.createHmac('sha256', key).update(String(v)).digest('base64url').slice(0, 16);
 const days = await syncShards(now, hash), rows = days.flatMap(readShard);
 const data = build(rows, now, createPlaces(ROOT, {useDataset:false}));
 const out = process.env.OASIS_DATA_OUT || path.join(ROOT, 'public/data/oasis.json');
 fs.writeFileSync(out, JSON.stringify(data));
 console.log(`${out}: ${data.cities.length} places, ${data.activity.reduce((s, a) => s + a[2], 0)} app opens, ${data.events.length} controller outcomes, ${data.recent.events.length} recent events`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
