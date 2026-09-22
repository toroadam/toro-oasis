# Credits and asset terms

Toro Oasis Globe is adapted from [Earth, Moon & Solar System](https://github.com/ethanplusai/earth-moon-solar) by [Ethan Rogers](https://x.com/ethanplusai), © 2026, MIT. The globe renderer, star field, text transitions, exploration shell and mobile layout come from that project; its MIT notice is kept in `LICENSE`. The Moon and Solar System experiences and their assets are not included.

Toro additions (the Oasis data layer, data pipeline, branding and copy) are © The Toro Company.

The code license does not replace the following asset terms. Preserve these credits and linked licenses when redistributing the corresponding files. No endorsement by NASA or the other source organizations is implied.

| Assets | Attribution and source | Terms and transformations |
| --- | --- | --- |
| Earth surface, relief, water and cloud maps | NASA-derived imagery distributed through [WebGL Earth](https://github.com/turban/webgl-earth) | [NASA media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/). Static maps; displayed shading and cloud motion are illustrative. |
| Earth night map | NASA-derived composite distributed through [three-globe](https://github.com/vasturiano/three-globe/tree/master/example/img) | Preserve NASA attribution. Static composite, with brightness and color adjusted in the renderer. |
| `public/data/stars.json` | David Nash / Astronomy Nexus, [HYG Database 4.1](https://github.com/astronexus/HYG-Database) | Adapted subset: magnitude ≤ 6.5, selected fields and rounded coordinates. [CC BY-SA 4.0](public/data/HYG-LICENSE.md). Share adaptations of this dataset under that license. |
| City coordinates in `public/data/oasis*.json` | [GeoNames](https://www.geonames.org/) `cities1000`, `admin1CodesASCII` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Coordinates rounded to 0.001°; region centroids are population-weighted. |
| `public/data/regions.geo.json` | [Natural Earth](https://www.naturalearthdata.com/) 1:50m admin-1 states and provinces | Public domain. Simplified to 0.03° and rounded to 0.01°, for the regions shown on the leaderboard. |
| `public/brand/toro-logo.svg` | The Toro Company | Toro trademark of The Toro Company. Not covered by the MIT license; do not reuse. |
| Golos Text typeface | Paratype, via [Fontsource](https://fontsource.org/fonts/golos-text) | [SIL Open Font License 1.1](https://openfontlicense.org). |

Three.js (MIT), Vite (MIT), Playwright (Apache-2.0), and their dependencies retain the licenses shipped in their npm packages.
