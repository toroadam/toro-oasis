process.env.OASIS_INTERNAL_PLACES = 'Test Region|Testville';
import assert from 'node:assert/strict';
import {build, minimise} from '../scripts/build-from-export.mjs';

const now = Date.parse('2026-09-22T18:30:00Z'), H = 36e5;
const hash = v => 'h_' + v;
const places = {
 'Arizona|Phoenix':{lat:33.448, lon:-112.074, name:'Phoenix', region:'Arizona', precise:true},
 'British Columbia|Hornby Island':{lat:49.52, lon:-124.67, name:'Hornby Island', region:'British Columbia', precise:true},
 'British Columbia|':{lat:50.1, lon:-122.9, name:'British Columbia', region:'British Columbia', precise:false},
 'Arizona|':{lat:33.7, lon:-111.9, name:'Arizona', region:'Arizona', precise:false},
};
const place = (cc, region, city) => places[`${region}|${city}`] ?? null;
const ev = (hoursAgo, event, region, city, extra = {}) => minimise({event, properties:{time:(now - hoursAgo * H) / 1000, mp_country_code:'US', $region:region, $city:city, $user_id:'user-' + (extra.user ?? 1), $email:'person@example.com', ...extra}}, hash);

const rows = [
 ...Array.from({length:12}, (_, i) => ev(1 + i, 'app_open', 'Arizona', 'Phoenix', {user:i})),
 ev(3, 'app_open', 'British Columbia', 'Hornby Island', {user:99}),
 ev(2, 'controller_add_completed', 'British Columbia', 'Hornby Island'),
 ev(5, 'controller_add_failed', 'Arizona', 'Phoenix', {failure_category:'server_error'}),
 ev(6, 'controller_add_failed', 'Arizona', 'Phoenix', {failure_category:'user_cancellation'}),
 ev(2, 'app_open', 'Test Region', 'Testville', {user:500}),
 ev(0.2, 'app_open', 'Arizona', 'Phoenix', {user:3}),
 ev(24 * 40, 'app_open', 'Arizona', 'Phoenix', {user:77}),
 ev(10, 'controllers_loaded', 'Arizona', 'Phoenix', {controller_id:['C1', 'C2']}),
 ev(9, 'ControllerStatus', 'Arizona', 'Phoenix', {controller_id:['C1'], ControllerStatus:'Controller Offline'}),
 ev(4, 'ControllerStatus', 'Arizona', 'Phoenix', {controller_id:['C1'], ControllerStatus:'Controller Online'}),
 ev(4, 'ControllerStatus', 'Arizona', 'Phoenix', {controller_id:['C2'], ControllerStatus:'Controller Offline'}),
];
const data = build(rows, now, place), json = JSON.stringify(data);

for (const leak of ['h_', 'user-', 'person@example.com', 'C1', 'Testville', 'Hornby']) assert.ok(!json.includes(leak), `published data must not contain ${leak}`);
assert.deepEqual(data.cities.map(c => c[2]).sort(), ['British Columbia', 'Phoenix'], 'sparse town folded into its region');
assert.equal(data.cities.find(c => c[2] === 'British Columbia')[4], 0, 'folded place is marked imprecise');
assert.equal(data.activity.reduce((s, a) => s + a[2], 0), 13, 'replay: in-window full hours only, Testville and 40-day-old events excluded');
assert.deepEqual(data.events.map(e => e[2]).sort(), [0, 1, 2], 'added, server error, cancellation');
assert.equal(data.recent.events.length, 17, 'recent: 48 h up to now, including the current partial hour');
assert.ok(data.recent.events.every(e => e[0] >= data.recent.start && e[0] <= data.recent.end));
assert.equal(data.kpis.users, 14, 'distinct users since tracking start, internal excluded');
assert.equal(data.kpis.controllers, 2);
assert.equal(data.kpis.addedMonth, 1);
assert.equal(data.kpis.online, .5, 'latest status per controller');
console.log('PASS: export build publishes no identifiers, folds sparse places, excludes internal traffic, and computes replay, recent and cards.');
