process.env.OASIS_INTERNAL_PLACES = 'Test Region|Testville';
import assert from 'node:assert/strict';
import {createLive} from '../server/live.js';

// Hermetic: a fixed place lookup, so the test never depends on local data files.
const spots = {Phoenix:[33.448, -112.074], Dallas:[32.783, -96.8], Mesa:[33.415, -111.831]};
const place = (cc, region, city) => spots[city] ? {lat:spots[city][0], lon:spots[city][1], name:city, region, precise:true} : null;

const now = Date.now(), s = ms => (now - ms) / 1000, min = 60_000;
const rows = {
 app_open: [
  {event:'app_open', properties:{time:s(20 * min), $insert_id:'a1', $city:'Phoenix', $region:'Arizona', mp_country_code:'US', $user_id:'secret-user', $email:'x@y.z', controller_id:['00AA']}},
  {event:'app_open', properties:{time:s(2 * min), $insert_id:'a2', $city:'Phoenix', $region:'Arizona', mp_country_code:'US'}},
  {event:'app_open', properties:{time:s(20 * min), $insert_id:'a3', $city:'Testville', $region:'Test Region', mp_country_code:'IN'}},
  {event:'controller_add_failed', properties:{time:s(30 * min), $insert_id:'f1', $city:'Dallas', $region:'Texas', mp_country_code:'US', failure_category:'server_error'}},
  {event:'controller_add_failed', properties:{time:s(31 * min), $insert_id:'f2', $city:'Dallas', $region:'Texas', mp_country_code:'US', failure_category:'user_cancellation'}},
  {event:'ZonePlayPauseButton_clicked', properties:{time:s(40 * min), $insert_id:'w1', $city:'Mesa', $region:'Arizona', mp_country_code:'US'}},
 ],
 month: [{event:'controller_add_completed', properties:{time:s(3600e3), $city:'Mesa', $region:'Arizona'}}, {event:'controller_add_completed', properties:{time:s(3600e3), $city:'Testville', $region:'Test Region'}}],
 status: [
  {event:'ControllerStatus', properties:{time:s(90 * min), controller_id:['C1'], ControllerStatus:'Controller Offline', $city:'Mesa', $region:'Arizona'}},
  {event:'ControllerStatus', properties:{time:s(10 * min), controller_id:['C1'], ControllerStatus:'Controller Online', $city:'Mesa', $region:'Arizona'}},
  {event:'ControllerStatus', properties:{time:s(10 * min), controller_id:['C2'], ControllerStatus:'Controller Offline', $city:'Mesa', $region:'Arizona'}},
 ],
};
const calls = [];
const fetchImpl = async url => {
 calls.push(url); const names = JSON.parse(decodeURIComponent(new URL(url).searchParams.get('event')));
 const body = names.length === 1 && names[0] === 'ControllerStatus' ? rows.status : names.length === 1 ? rows.month : rows.app_open;
 return {ok:true, text:async () => body.map(r => JSON.stringify(r)).join('\n')};
};

const unconfigured = createLive({root:process.cwd(), fetchImpl, place});
assert.deepEqual(await unconfigured.snapshot(0), {configured:false}, 'no credentials: no Mixpanel calls');
assert.equal(calls.length, 0);

const live = createLive({account:'sa', secret:'pw', project:'4009305', root:process.cwd(), fetchImpl, place});
const snap = await live.snapshot(0);
const json = JSON.stringify(snap);
for (const leak of ['secret-user', 'x@y.z', '00AA', '$insert_id', 'Testville']) assert.ok(!json.includes(leak), `must not leak ${leak}`);
assert.equal(snap.events.length, 4, 'Testville excluded; the 2-minute-old event is held back by the lag');
assert.deepEqual(snap.events.map(e => e.kind), ['watering', 'cancelled', 'error', 'activity']);
assert.ok(snap.events.every(e => Number.isFinite(e.lat) && Number.isFinite(e.lon)), 'every event is placed');
assert.deepEqual(Object.keys(snap.events[0]).sort(), ['kind', 'lat', 'lon', 'name', 'precise', 'region', 't']);
assert.equal(snap.kpis.addedMonth, 1, 'month adds exclude internal traffic');
assert.equal(snap.kpis.online, .5, 'online share uses each controller\'s latest status');
assert.equal(snap.kpis.reporting, 2);
assert.equal(calls.length, 3, 'one fast export plus two slow ones');
await live.snapshot(snap.events.at(-1).t);
assert.equal(calls.length, 3, 'polls inside the interval reuse the cache (Export API rate limit)');
console.log('PASS: live proxy strips identifiers, excludes internal traffic, honours the lag, caches, and computes online share.');
