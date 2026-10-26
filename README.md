# Map Converter

Turns a **shapefile** (or GeoJSON) into an **interactive SVG map** and **JSON**, entirely in the browser — the file never leaves the user's computer.

Upload → pick the fields → tune detail and projection with a live, interactive preview → export.

## Features

- **Upload** a zipped shapefile, the loose `.shp`/`.dbf`/`.prj`/`.cpg` files, or GeoJSON (drag and drop or file picker). Files with several layers let you pick one.
- **Fields:** the identifier and name fields are guessed (e.g. `CD_MUN` / `NM_MUN` in IBGE meshes) and can be changed; choose which attributes go into the output and the tooltip.
- **Simplification** with a slider (0.1% to 100% of the points, log scale). It is topology-aware: shared borders are simplified once, so neighbors never get gaps or overlaps. The default aims at ~10k points.
- **Projection:** Transverse Mercator (UTM-like, default), Mercator, Conic Equal Area or Equirectangular; width and decimal places are configurable.
- **Interactive preview:** zoom buttons and drag to pan, hover highlight, tooltip with the chosen attributes, click to see every attribute, and "color by" any field to check regions.
- **Export:**
  - **SVG** — one `<path>` per area with `id`, `data-*` attributes and a `<title>`, plus minimal styles;
  - **JSON** — `viewBox`, outline and, per area, `id`, `name`, chosen `properties` and the path `d`;
  - **GeoJSON** — the simplified geometry in longitude/latitude (not projected, RFC 7946 winding, 5 decimal places) with the chosen attributes, for Leaflet, Mapbox, QGIS etc.;
  - **ceara-map JSON** — the `municipalities.json` format of the [ceara-map](https://github.com/felipehenriquee/ceara-mapa) library.

For the IBGE mesh of Ceará (184 municipalities, 273k points), the default settings give ~10k points and a ~150 KB SVG.

## How it works

| Step | Library |
|---|---|
| Read the shapefile (and reproject it from the `.prj`) | [`shpjs`](https://github.com/calvinmetcalf/shapefile-js), loaded on demand |
| Build a topology and simplify it (Visvalingam) | `topojson-server`, `topojson-simplify`, `topojson-client` |
| Project and generate SVG path data | `d3-geo` |
| Interface | React 19 + Vite |

The conversion code is plain functions in `src/lib/` (`load.ts`, `convert.ts`, `fields.ts`, `export.ts`), independent of the UI. Reading and converting run in a **Web Worker** (`src/worker.ts`), so large files don't freeze the page; while a file is being prepared it can be cancelled.

## Running

Requires Node 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (plus the IBGE file, when available)
npm run build      # static site in dist/
```

The IBGE test uses `../mapa-ceara/CE_Municipios_2025/CE_Municipios_2025.zip` by default; point `IBGE_ZIP` at another file, or it is skipped.

`dist/` is a static site with relative paths: it can be hosted anywhere (GitHub Pages, Netlify, Vercel), at any path, since there is no server.

**Live:** https://felipehenriquee.github.io/shapefile-converter/ — every push to `main` is tested, built and published by `.github/workflows/pages.yml`.
