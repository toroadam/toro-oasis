# Toro Oasis Globe

Oasis irrigation activity on an interactive 3D globe.

- **Red pulses** are people opening the Oasis app, at their city.
- **Green beams and arcs** are controllers being added. Each arc is drawn from Toro HQ in Bloomington, Minnesota.
- **Amber beams** are setup errors. **Grey ripples** are setups the user cancelled.
- **Blue dots** are zones watering, started from the app (mostly test runs during setup). Scheduled watering runs on the controller and isn't in the analytics.
- The day/night line follows the clock, so each evening wave rolls west across North America.

**Replay** plays the last thirty days, at 15 minutes, 1 hour or 3 hours per second. **Live** replays the most recent two days as "today and yesterday" at 120× speed, so the network is always moving. Add `?live` to the URL to open straight into Live.

Select any city, or any event in the feed, to fly there and see its thirty-day totals. When nothing is selected, the right-hand panel shows four network cards: users, controllers, controllers added this month, and share online. A **Zoom out** button appears above the timeline whenever you are zoomed in close.

The globe, star field, transitions and mobile layout are adapted from [Earth, Moon & Solar System](https://github.com/ethanplusai/earth-moon-solar) (MIT). See [CREDITS.md](CREDITS.md).

## Run it

```sh
npm install
npm run dev        # http://127.0.0.1:5173
npm test
```

Node 22.12 or newer. Without real data, the app loads `public/data/oasis.sample.json`, a synthetic dataset with no Toro data, and shows a **Sample data** badge.

## Deployment: GitHub Pages

`.github/workflows/pages.yml` builds and deploys the site on every push to `main`.

The site shows a fixed 30-day snapshot of Oasis analytics, committed as `public/data/oasis.json`. **Live** replays the snapshot's last 48 hours as "today and yesterday". No Mixpanel credentials are needed.

To refresh the snapshot, re-export from Mixpanel and rebuild it with `scripts/build-oasis-data.py`, which is documented in the script. Then commit the new file.

`scripts/build-from-export.mjs` can instead rebuild the data on every deploy from the Mixpanel Export API. It only runs if `MIXPANEL_SERVICE_ACCOUNT` and `MIXPANEL_SERVICE_SECRET` repo secrets exist. `OASIS_INTERNAL_PLACES` (`Region|City;…`) lists internal test locations to exclude.

## What gets published

The site and the snapshot are public, so they hold only what the globe needs:

- **Places at city level**, from the city associated with each phone's connection, never a street address. A place with fewer than 10 events in the window is folded into its state or region, so a single installation in a small town can't be pinpointed.
- **Event times and kinds:** app open, controller added, setup error, setup cancelled, watering.
- **Network card totals.**

No names, e-mail addresses, or user, device or controller identifiers are published, hashed or otherwise. `tests/export-check.mjs` enforces this for the Mixpanel builder. If that builder runs, its per-day event cache is keyed-hashed and encrypted (AES-256-GCM) with a key derived from the Mixpanel secret, which fork pull requests never receive.

## Network cards

| Card | Definition | Caveat |
| --- | --- | --- |
| Total users | People who opened the app since analytics began (Apr 2026) | App users, not accounts |
| Controllers | Distinct controllers seen in the app | Controller IDs are only recorded from May 2026, so this is lower than the full fleet |
| New this month | Controllers added this month | |
| Online now | Share of controllers whose latest reported status is online | Only controllers opened in the app report status |

## Live against Mixpanel directly (optional, local)

With a Mixpanel service account in `.env.local` (gitignored), `npm run dev` also runs `server/live.js`, a small proxy that streams events five minutes behind real time instead of replaying the last 48 hours. It sends the browser only `{t, kind, lat, lon, name, region, precise}`, and stays under the Export API limit of 60 requests an hour. `tests/live-check.mjs` covers it.

```sh
MIXPANEL_SERVICE_ACCOUNT=...
MIXPANEL_SERVICE_SECRET=...
OASIS_INTERNAL_PLACES=...
```

## Layout

```
src/main.js                    page: chapters, replay and live, feed, cards, city detail
src/oasis-layer.js             globe layer: ripples, beams, HQ arcs, city markers, picking
src/oasis.css                  Toro theme (Golos, brand #e11837)
src/scene.js                   globe renderer (from the original), plus a geographic sun
scripts/build-from-export.mjs  Mixpanel Export API → public/data/oasis.json (used by the workflow)
scripts/build-oasis-data.py    GeoNames place lookup; synthetic sample; offline build from exports
server/live.js                 optional local live proxy, as a Vite plugin
```
