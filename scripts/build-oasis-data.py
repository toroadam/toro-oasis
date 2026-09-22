#!/usr/bin/env python3
"""Build the globe dataset (public/data/oasis.json) from Mixpanel extracts.

Real mode reads four Mixpanel exports from the Oasis Mobile project (4009305):

  app_open_daily_city.json    Insights, app_open total, unit=day,  breakdown $region + $city
  app_open_hourly_region.json Insights, app_open total, unit=hour, breakdown $region
  controller_add_completed.json  Property values (expanded): time, country, $region, $city
  controller_add_failed.json     Property values (expanded): time, country, $region, $city, failure_category

and, for the four network cards:

  kpi_totals.json         Insights (bar), internal places excluded, all history: app_open unique users;
                          controllers_loaded distinct controller_id
  kpi_month.json          Insights (bar), internal places excluded, this month: controller_add_completed total
  controller_status_*.json  Property values (expanded) of ControllerStatus: time, ControllerStatus,
                          controller_id, $city. Chunk by date to stay under the 1,000-row cap.

Each city's daily app_open count is spread across that day's hours using its
region's hourly profile, so pulses follow real local rhythm without needing
a per-event export. Controller add outcomes keep their exact timestamps.

Only city-level aggregates leave this script: no user, device, controller or
e-mail identifiers are read or written. Timestamps are treated as UTC.

Synthetic mode (--synthetic) fabricates a plausible dataset from GeoNames
populations alone. It contains no Toro data and is what the repo ships with.

  python3 scripts/build-oasis-data.py --raw data/raw --geonames ~/geonames
  python3 scripts/build-oasis-data.py --synthetic --geonames ~/geonames
"""
import argparse, json, math, os, random, re, unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Internal test traffic, as "Region|City;Region|City" in OASIS_INTERNAL_PLACES (kept out of the repo).
_internal_raw = os.environ.get('OASIS_INTERNAL_PLACES', '')
KIND = {'added': 0, 'server_error': 1, 'cancelled': 2, 'watering': 3}


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = s.replace('saint ', 'st ').replace('st. ', 'st ').replace('city of ', '')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


REGION_NOISE = re.compile(r'\b(state of|province of|provincia de|region|county|department|parish|territory of|national capital territory of|city)\b')


def region_key(s):
    return re.sub(r'\s+', ' ', REGION_NOISE.sub('', norm(s))).strip()


INTERNAL = {tuple(norm(x) for x in p.split('|')) for p in _internal_raw.split(';') if '|' in p}


class Gazetteer:
    def __init__(self, folder):
        folder = Path(folder).expanduser()
        self.country = {}
        for line in open(folder / 'countryInfo.txt', encoding='utf8'):
            if line.startswith('#'): continue
            f = line.rstrip('\n').split('\t')
            self.country[norm(f[4])] = f[0]
        self.country.update({'united states': 'US', 'united kingdom': 'GB', 'russia': 'RU'})
        self.admin = defaultdict(set)  # region key -> {(cc, admin1)}
        for line in open(folder / 'admin1CodesASCII.txt', encoding='utf8'):
            code, name, ascii_name, _ = line.rstrip('\n').split('\t')
            cc, a1 = code.split('.')
            for n in (name, ascii_name):
                self.admin[region_key(n)].add((cc, a1))
        # Mixpanel/MaxMind region spellings that GeoNames names differently.
        for alias, target in {'england': ('GB', 'ENG'), 'north holland': ('NL', '07'), 'capital': ('DK', '17'),
                              'cuzco': ('PE', '08'), 'kyiv': ('UA', '12'), 'tel aviv': ('IL', '05'),
                              'split dalmatia': ('HR', '15'), 'silesia': ('PL', '83'), 'lucerne': ('CH', 'LU'),
                              'zurich': ('CH', 'ZH'), 'berlin': ('DE', '16'), 'baden wurttemberg': ('DE', '01'),
                              'bavaria': ('DE', '02'), 'st george': ('VC', '04'), 'san jose': ('CR', '08'),
                              'delhi': ('IN', '07')}.items():
            self.admin[alias].add(target)
        self.cities = defaultdict(list)  # (cc, name key) -> [(pop, lat, lon, admin1, name)]
        self.by_admin = defaultdict(list)
        for line in open(folder / 'cities1000.txt', encoding='utf8'):
            f = line.rstrip('\n').split('\t')
            row = (int(f[14] or 0), float(f[4]), float(f[5]), f[10], f[1])
            names = {norm(f[1]), norm(f[2])} | {norm(a) for a in f[3].split(',')[:40] if a}
            for n in names:
                if n: self.cities[(f[8], n)].append(row)
            self.by_admin[(f[8], f[10])].append(row)
        self.cache = {}

    def regions(self, region, cc=None):
        found = self.admin.get(region_key(region), set())
        return {r for r in found if cc is None or r[0] == cc}

    def locate(self, region, city, country=None):
        """Return (lat, lon, precise) or None. Falls back to the region's population centroid."""
        key = (region, city, country)
        if key in self.cache: return self.cache[key]
        cc = self.country.get(norm(country)) if country else None
        regions = self.regions(region, cc) if region and region != 'undefined' else set()
        if not regions and cc: regions = {(cc, None)}
        result = None
        if city and city != 'undefined':
            best = None
            for rcc, a1 in regions or {(cc, None)}:
                for row in self.cities.get((rcc, norm(city)), []):
                    score = (a1 is None or row[3] == a1, row[0])
                    if best is None or score > best[0]: best = (score, row)
            if best and best[0][0]: result = (best[1][1], best[1][2], True)
        if result is None and regions:
            # Same-named regions in several countries (Florida, US / UY): use the most populous one.
            groups = [self.by_admin.get((rcc, a1), []) for rcc, a1 in regions if a1]
            rows = max(groups, key=lambda g: sum(r[0] for r in g), default=[])
            weight = sum(r[0] + 1 for r in rows)
            if rows:
                result = (sum(r[1] * (r[0] + 1) for r in rows) / weight, sum(r[2] * (r[0] + 1) for r in rows) / weight, False)
        self.cache[key] = result
        return result


def insights_rows(path):
    data = json.load(open(path))
    series = next(iter(data['result']['results'].values()))
    return series['headers'], series['rows']


def spread(total, weights):
    """Split an integer across buckets by weight, preserving the total (largest remainder)."""
    s = sum(weights)
    if total <= 0: return [0] * len(weights)
    if s <= 0: weights, s = [1] * len(weights), len(weights)
    raw = [total * w / s for w in weights]
    out = [math.floor(x) for x in raw]
    for i in sorted(range(len(raw)), key=lambda i: out[i] - raw[i])[:total - sum(out)]: out[i] += 1
    return out


def metric(path, prefix):
    for name, series in json.load(open(path))['result']['results'].items():
        if name.startswith(prefix): return series['rows'][0][0]
    raise KeyError(f'{prefix} not in {path}')


def build_kpis(raw):
    """Network cards. Online share is each controller's most recent reported status."""
    latest = {}
    for f in sorted(raw.glob('controller_status_*.json')):
        for t, status, ids, city in json.load(open(f))['rows']:
            if not t or not status or not ids or any(norm(city) == c for _, c in INTERNAL): continue
            for c in json.loads(ids):
                if c not in latest or t > latest[c][0]: latest[c] = (t, status)
    online = sum(1 for _, s in latest.values() if s == 'Controller Online')
    month = json.load(open(raw / 'kpi_month.json'))['result']['dateRange']
    return {
        'users': metric(raw / 'kpi_totals.json', 'A.'), 'usersSince': 'Apr 2026',
        'controllers': metric(raw / 'kpi_totals.json', 'B.'), 'controllersSince': 'May 2026',
        'addedMonth': metric(raw / 'kpi_month.json', 'A.'),
        'month': datetime.fromisoformat(month['from']).strftime('%B'),
        'online': round(online / len(latest), 3) if latest else None, 'reporting': len(latest),
        'asOf': month['to'],
    }


MIN_PLACE_EVENTS = 10  # published data is public: sparse places are shown at their region instead


def fold_sparse(activity, events, cities):
    """Move places with fewer than MIN_PLACE_EVENTS events to a region-level point (their
    region's precise places' centroid is not used; the region label and imprecise flag are)."""
    total = defaultdict(int)
    for (h, c), n in activity.items(): total[c] += n
    for _, c, _ in events: total[c] += 1
    by_region = defaultdict(list)
    for i, c in enumerate(cities): by_region[c[3]].append(i)
    target, out, index = {}, [], {}
    for i, c in enumerate(cities):
        if c[4] and total[i] >= MIN_PLACE_EVENTS: key, row = ('p', i), c
        else:
            members = by_region[c[3]]
            lat = sum(cities[j][0] for j in members) / len(members); lon = sum(cities[j][1] for j in members) / len(members)
            key, row = ('r', c[3]), [round(lat, 3), round(lon, 3), c[3], c[3], 0]
        if key not in index: index[key] = len(out); out.append(row)
        target[i] = index[key]
    folded = defaultdict(int)
    for (h, c), n in activity.items(): folded[(h, target[c])] += n
    return folded, [[s, target[c], k] for s, c, k in events], out


def build_regions(activity, events, cities, hours, customers_file):
    """Adoption by state/province for the leaderboard: customers (distinct signed-in users,
    from a filtered Insights export), controllers added, app opens and daily opens. Regions
    with fewer than MIN_PLACE_EVENTS events are left out, matching the privacy floor."""
    days = math.ceil(hours / 24)
    customers = dict(json.load(open(customers_file))['rows']) if customers_file.exists() else {}
    agg = {}
    def row(c):
        name = cities[c][3] or cities[c][2]
        return agg.setdefault(name, {'region': name, 'opens': 0, 'added': 0, 'error': 0, 'cancelled': 0, 'watering': 0,
                                     'daily': [0] * days, 'lat': 0.0, 'lon': 0.0, 'w': 0})
    for (h, c), n in activity.items():
        r = row(c); r['opens'] += n; r['daily'][h // 24] += n
        r['lat'] += cities[c][0] * n; r['lon'] += cities[c][1] * n; r['w'] += n
    for _, c, k in events:
        r = row(c); r[['added', 'error', 'cancelled', 'watering'][k]] += 1
        if not r['w']: r['lat'], r['lon'] = cities[c][0], cities[c][1]
    out = []
    for r in agg.values():
        if r['opens'] + r['added'] + r['error'] + r['cancelled'] + r['watering'] < MIN_PLACE_EVENTS: continue
        if r['w']: r['lat'], r['lon'] = r['lat'] / r['w'], r['lon'] / r['w']
        r['lat'], r['lon'] = round(r['lat'], 3), round(r['lon'], 3)
        r['customers'] = customers.get(r['region'], 0); del r['w']
        out.append(r)
    return sorted(out, key=lambda r: -r['opens'])


def build_real(raw, gaz):
    raw = Path(raw)
    hours, hourly = insights_rows(raw / 'app_open_hourly_region.json')
    stamps = [datetime.fromisoformat(h if 'T' in h else h + 'T00:00').replace(tzinfo=timezone.utc) for h in hours[1:]]
    start = stamps[0]
    profile = {r[0]: r[1:] for r in hourly if r[0] != '$overall'}
    days, daily = insights_rows(raw / 'app_open_daily_city.json')
    day_start = [datetime.fromisoformat(d).replace(tzinfo=timezone.utc) for d in days[1:]]

    cities, index, skipped = [], {}, defaultdict(int)

    def city_id(region, city, country=None):
        if (norm(region), norm(city)) in INTERNAL: skipped['internal'] += 1; return None
        spot = gaz.locate(region, city, country)
        if spot is None: skipped[f'{region} / {city}'] += 1; return None
        # Places resolved only to a region centroid share one point, so they are named for the region.
        label = city if spot[2] else region
        k = (round(spot[0], 3), round(spot[1], 3))
        if k not in index:
            index[k] = len(cities)
            cities.append([round(spot[0], 3), round(spot[1], 3), label, region, 1 if spot[2] else 0])
        return index[k]

    activity = defaultdict(int)
    for row in daily:
        name = row[0]
        if name.endswith(', $overall') or name == '$overall': continue
        region, city = name.split(', ', 1)
        cid = city_id(region, city)
        if cid is None: continue
        weights = profile.get(region)
        for d, count in zip(day_start, row[1:]):
            if not count: continue
            first = int((d - start).total_seconds() // 3600)
            span = list(range(max(first, 0), min(first + 24, len(stamps))))
            w = [weights[h] for h in span] if weights else [1] * len(span)
            for h, n in zip(span, spread(count, w)):
                if n: activity[(h, cid)] += n

    events = []
    # Preferred input: hourly per-city counts from Insights, filtered in Mixpanel to production,
    # signed-in, non-Toro users (outcomes_hourly_city.json, metrics A-E as documented above).
    # Each count becomes events spread deterministically through its hour.
    hourly_outcomes = raw / 'outcomes_hourly_city.json'
    if hourly_outcomes.exists():
        rng = random.Random(3)
        kinds = {'A.': KIND['added'], 'B.': KIND['server_error'], 'C.': KIND['cancelled'], 'D.': KIND['watering'], 'E.': KIND['watering']}
        for name, series in json.load(open(hourly_outcomes))['result']['results'].items():
            k = kinds[name[:2]]
            hours_h = [datetime.fromisoformat(h if 'T' in h else h + 'T00:00').replace(tzinfo=timezone.utc) for h in series['headers'][1:]]
            for row in series['rows']:
                if row[0] == '$overall' or row[0].endswith(', $overall'): continue
                region, city = row[0].split(', ', 1)
                cid = city_id(region, city)
                if cid is None: continue
                for t, n in zip(hours_h, row[1:]):
                    for _ in range(n or 0): events.append([int((t - start).total_seconds()) + rng.randrange(3600), cid, k])
    expanded = (('controller_add_completed.json', lambda r: 'added'),
                ('controller_add_failed.json', lambda r: 'server_error' if r[4] == 'server_error' else 'cancelled'))
    for name, kind_of in ([] if hourly_outcomes.exists() else expanded):
        data = json.load(open(raw / name))
        for r in data['rows']:
            if not r[0]: continue
            cid = city_id(r[2], r[3], r[1])
            if cid is None: continue
            t = datetime.fromisoformat(r[0]).replace(tzinfo=timezone.utc)
            events.append([int((t - start).total_seconds()), cid, KIND[kind_of(r)]])
    # Optional: zones watering from the app, as property-value exports (time, country, $region, $city).
    for f in ([] if hourly_outcomes.exists() else sorted(raw.glob('watering_*.json'))):
        for r in json.load(open(f))['rows']:
            if not r[0]: continue
            cid = city_id(r[2], r[3], r[1])
            if cid is None: continue
            t = datetime.fromisoformat(r[0]).replace(tzinfo=timezone.utc)
            events.append([int((t - start).total_seconds()), cid, KIND['watering']])
    events.sort()
    activity, events, cities = fold_sparse(activity, events, cities)
    regions = build_regions(activity, events, cities, len(stamps), raw / 'customers_by_region.json')
    return {
        'source': 'mixpanel', 'project': 'Oasis Mobile',
        'start': start.isoformat().replace('+00:00', 'Z'), 'hours': len(stamps),
        'cities': cities,
        'activity': sorted([h, c, n] for (h, c), n in activity.items()),
        'events': events,
        'regions': regions,
        'kpis': json.load(open(raw / 'kpis.json')) if (raw / 'kpis.json').exists() else build_kpis(raw),
        'skipped': dict(sorted(skipped.items(), key=lambda kv: -kv[1])),
    }


def build_synthetic(gaz, seed=11):
    rng = random.Random(seed)
    pool = []
    for (cc, a1), rows in gaz.by_admin.items():
        if cc in ('US', 'CA', 'AU'): pool += [(r, cc) for r in rows if r[0] > 40000]
    pool.sort(key=lambda x: -x[0][0])
    pool = pool[:420]
    cities = [[round(r[1], 3), round(r[2], 3), r[4], '', 1] for r, _ in pool]
    hours = 30 * 24
    start = (datetime.now(timezone.utc) - timedelta(days=30)).replace(minute=0, second=0, microsecond=0)
    activity, events = [], []
    for cid, ((pop, lat, lon, _, _), cc) in enumerate(pool):
        rate = 0.003 + math.sqrt(pop) / 9000
        for h in range(hours):
            local = ((start + timedelta(hours=h)).hour + lon / 15) % 24
            rhythm = max(0.05, math.sin(math.pi * (local - 6) / 16)) if 6 <= local <= 22 else 0.05
            n = sum(1 for _ in range(4) if rng.random() < rate * rhythm)
            if n: activity.append([h, cid, n])
            if rng.random() < rate * rhythm * .06: events.append([h * 3600 + rng.randrange(3600), cid, rng.choices((0, 1, 2), (4, 1, 6))[0]])
    events.sort()
    return {'source': 'synthetic', 'project': 'Synthetic sample (no Toro data)',
            'start': start.isoformat().replace('+00:00', 'Z'), 'hours': hours,
            'cities': cities, 'activity': activity, 'events': events, 'skipped': {},
            'kpis': {'users': 2400, 'usersSince': 'Apr 2026', 'controllers': 1850, 'controllersSince': 'May 2026',
                     'addedMonth': sum(1 for e in events if e[2] == 0), 'month': start.strftime('%B'),
                     'online': .9, 'reporting': 1850, 'asOf': start.date().isoformat()}}


def build_gazetteer(gaz, countries=('US', 'CA', 'AU', 'GB', 'NZ', 'DE', 'NL', 'IE')):
    """Compact lookup the live proxy uses to place cities it has not seen: region key -> country,
    admin1 and population centroid; 'cc|admin1|city key' -> coordinates of the most populous match."""
    regions, cities = defaultdict(list), {}
    for key, codes in gaz.admin.items():
        for cc, a1 in codes:
            rows = gaz.by_admin.get((cc, a1), [])
            if cc not in countries or not rows: continue
            w = sum(r[0] + 1 for r in rows)
            regions[key].append([cc, a1, round(sum(r[1] * (r[0] + 1) for r in rows) / w, 3), round(sum(r[2] * (r[0] + 1) for r in rows) / w, 3), sum(r[0] for r in rows)])
    for (cc, name), rows in gaz.cities.items():
        if cc not in countries: continue
        for r in rows:
            k = f'{cc}|{r[3]}|{name}'
            if k not in cities or r[0] > cities[k][2]: cities[k] = [round(r[1], 3), round(r[2], 3), r[0]]
    return {'regions': regions, 'cities': {k: v[:2] for k, v in cities.items()}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raw', help='folder with the four Mixpanel exports')
    ap.add_argument('--geonames', required=True, help='folder with cities1000.txt, admin1CodesASCII.txt, countryInfo.txt')
    ap.add_argument('--synthetic', action='store_true')
    ap.add_argument('--out', default=str(ROOT / 'public/data/oasis.json'))
    ap.add_argument('--gazetteer', help='also write the live-proxy lookup to this path (e.g. data/gazetteer.json)')
    ap.add_argument('--gazetteer-only', action='store_true', help='write the lookup and stop (used by the Pages workflow)')
    args = ap.parse_args()
    gaz = Gazetteer(args.geonames)
    if args.gazetteer:
        Path(args.gazetteer).parent.mkdir(parents=True, exist_ok=True)
        json.dump(build_gazetteer(gaz), open(args.gazetteer, 'w'), separators=(',', ':'))
        print(f'{args.gazetteer}: {Path(args.gazetteer).stat().st_size // 1024} KB')
        if args.gazetteer_only: return
    data = build_synthetic(gaz) if args.synthetic else build_real(args.raw, gaz)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump(data, open(args.out, 'w'), separators=(',', ':'))
    kinds = defaultdict(int)
    for e in data['events']: kinds[e[2]] += 1
    print(f"{args.out}: {len(data['cities'])} places, {sum(a[2] for a in data['activity'])} app opens, "
          f"events added={kinds[0]} server_error={kinds[1]} cancelled={kinds[2]}")
    if data['skipped']: print('skipped:', data['skipped'])
    del data['skipped']  # diagnostics only; not published
    json.dump(data, open(args.out, 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main()
