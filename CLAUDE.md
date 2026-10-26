# CLAUDE.md

Browser-only tool that converts shapefiles/GeoJSON into interactive SVG maps and JSON. See README.md for features and stack.

## Conventions

- Code, comments, commit messages and docs in **English**; all text shown in the UI in **Portuguese (pt-BR)**.
- Never add a `Co-Authored-By: Claude` trailer (or any Claude attribution) to commits or PRs — commits go out under the user's name only.
- The machine runs **Node 18.20**: keep Vite on v6 and Vitest on v3 (newer majors require Node 20+).
- Keep the conversion logic as pure functions in `src/lib/` (no React there); components only call them.

## Layout

- `src/lib/load.ts` — reads .zip / loose .shp+.dbf+.prj+.cpg / GeoJSON (shpjs is lazy-loaded).
- `src/lib/convert.ts` — topology + simplification + projection + SVG path data. Note: `quantile(topo, p)` keeps a fraction `p` of the points (weights are sorted descending).
- `src/lib/fields.ts`, `src/lib/export.ts` — field guessing and the SVG / JSON / GeoJSON / ceara-map JSON builders.
- `src/lib/session.ts` — `ConverterSession`: keeps the loaded layers and topologies; only attributes and results leave it.
- `src/worker.ts` + `src/converterClient.ts` — loading and conversion run in a Web Worker (module format, see `vite.config.ts`); the client coalesces convert requests (newer ones replace the queued one) and restarts the worker on a new upload or cancel. The page never holds the source geometry.
- `src/components/` — UploadArea, SettingsPanel, MapPreview, ExportPanel; `src/App.tsx` wires them.

## Checks

```bash
npx tsc            # types
npm test           # vitest; includes the real IBGE file when ../mapa-ceara/CE_Municipios_2025/CE_Municipios_2025.zip exists (or IBGE_ZIP=...)
npm run build
```

UI changes were verified by driving /usr/bin/google-chrome with puppeteer-core (installed outside the repo) against `vite preview`, taking screenshots in light/dark and at 390px width.

## Related projects

- `../mapa-ceara` — Next.js site + the `ceara-map` React library (`packages/ceara-map`, also at github.com/felipehenriquee/ceara-mapa). The "ceara-map JSON" export matches that library's `src/municipalities.json` format.

## Open items

- With very large files the page stays responsive, but rendering thousands of paths in the preview still blocks for ~0.2 s, and memory is the real limit.
- The 2025 IBGE mesh has no mesoregions (replaced by intermediate/immediate regions), so the ceara-map export takes an optional field as `region`.
- Repository: github.com/felipehenriquee/shapefile-converter (remote `origin` over SSH).
