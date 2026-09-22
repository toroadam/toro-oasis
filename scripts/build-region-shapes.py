#!/usr/bin/env python3
"""Outlines for the regions in public/data/oasis.json, used to highlight a region on the globe.

Source: Natural Earth 1:50m admin-1 states and provinces (public domain), which covers the
US, Canada, Australia, India and a few others:
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson

  python3 scripts/build-region-shapes.py --ne ne_50m_admin_1_states_provinces.geojson

Writes public/data/regions.geo.json: {region name: [ring, ...]}, each ring a flat list
[lon, lat, lon, lat, ...] rounded to 0.01 degrees, with points closer than 0.03 degrees dropped.
"""
import argparse, json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def key(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\b(state of|province of|national capital territory of|provincia de)\b', '', s)
    return re.sub(r'[^a-z]+', ' ', s).strip()


def simplify(ring, step=.03):
    out = []
    for lon, lat in ring:
        if not out or abs(lon - out[-2]) + abs(lat - out[-1]) >= step: out += [round(lon, 2), round(lat, 2)]
    return out if len(out) >= 8 else []


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--ne', required=True)
    ap.add_argument('--data', default=str(ROOT / 'public/data/oasis.json'))
    ap.add_argument('--out', default=str(ROOT / 'public/data/regions.geo.json'))
    a = ap.parse_args()
    wanted = {key(r['region']): r['region'] for r in json.load(open(a.data)).get('regions', [])}
    shapes = {}
    for f in json.load(open(a.ne))['features']:
        p = f['properties']
        names = [p.get(k) for k in ('name', 'name_en', 'gn_name', 'woe_name', 'name_alt')]
        names += (p.get('name_alt') or '').split('|')
        hit = next((wanted[key(n)] for n in names if n and key(n) in wanted), None)
        if not hit: continue
        g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        rings = [r for poly in polys for r in (simplify(poly[0]),) if r]
        shapes.setdefault(hit, []).extend(rings)
    json.dump(shapes, open(a.out, 'w'), separators=(',', ':'))
    missing = sorted(set(wanted.values()) - set(shapes))
    print(f'{a.out}: {len(shapes)} of {len(wanted)} regions, {Path(a.out).stat().st_size // 1024} KB; no outline: {missing}')


if __name__ == '__main__':
    main()
