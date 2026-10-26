import { existsSync, readFileSync } from "node:fs";
import type { Position } from "geojson";
import shp from "shpjs";
import { describe, expect, it } from "vitest";
import { convert, prepare, type ConvertOptions } from "./convert";
import { buildCearaMapJson, buildGeoJson, buildJson, buildSvg, dataAttributeName, slugify } from "./export";
import { describeFields, guessIdField, guessNameField } from "./fields";
import type { PolygonFeature } from "./load";

const OPTIONS: ConvertOptions = { detail: 1, projection: "transverseMercator", width: 900, digits: 1 };

// counterclockwise exterior rings, as in RFC 7946 GeoJSON (d3 expects the opposite)
function square(x: number, y: number, size: number, properties: Record<string, unknown>): PolygonFeature {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]],
    },
  };
}

function circle(cx: number, cy: number, r: number, points: number): PolygonFeature {
  const ring: Position[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * 2 * Math.PI;
    ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return { type: "Feature", properties: { id: "c" }, geometry: { type: "Polygon", coordinates: [ring] } };
}

const neighbors = [
  square(-39.5, -5.5, 0.5, { CD_MUN: "2300001", NM_MUN: "São <Teste> & Cia", AREA: 10 }),
  square(-39, -5.5, 0.5, { CD_MUN: "2300002", NM_MUN: "Ararendá", AREA: 20 }),
];

function numbersIn(d: string) {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe("convert", () => {
  it("draws GeoJSON-wound polygons inside the viewBox (not the whole globe)", () => {
    const result = convert(prepare(neighbors), OPTIONS);
    expect(result.features).toHaveLength(2);
    expect(result.width).toBe(900);
    expect(result.height).toBeGreaterThan(400);
    expect(result.height).toBeLessThan(500); // two side-by-side squares: about 2:1
    for (const f of result.features) {
      for (const n of numbersIn(f.d)) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(900);
      }
    }
  });

  it("merges neighbors into a single outline", () => {
    const result = convert(prepare(neighbors), OPTIONS);
    expect(result.outline.match(/M/g)).toHaveLength(1);
  });

  it("keeps the attributes of each feature", () => {
    const result = convert(prepare(neighbors), OPTIONS);
    expect(result.features.map((f) => f.properties.CD_MUN)).toEqual(["2300001", "2300002"]);
  });

  it("removes points as the detail goes down", () => {
    const prepared = prepare([circle(-39, -5, 1, 400)]);
    const full = convert(prepared, OPTIONS);
    const light = convert(prepared, { ...OPTIONS, detail: 0.1 });
    expect(prepared.sourcePoints).toBe(401);
    expect(light.points).toBeLessThan(full.points / 4);
    expect(light.features[0].d.length).toBeLessThan(full.features[0].d.length);
  });

  it("works with every projection", () => {
    const prepared = prepare(neighbors);
    for (const projection of ["transverseMercator", "mercator", "conicEqualArea", "equirectangular"] as const) {
      const result = convert(prepared, { ...OPTIONS, projection });
      expect(result.features.every((f) => f.d.startsWith("M"))).toBe(true);
    }
  });
});

describe("fields", () => {
  it("guesses the id and name fields", () => {
    const fields = describeFields(neighbors.map((f) => f.properties));
    expect(guessIdField(fields)).toBe("CD_MUN");
    expect(guessNameField(fields)).toBe("NM_MUN");
  });
});

describe("export", () => {
  const result = convert(prepare(neighbors), OPTIONS);
  const fields = { idField: "CD_MUN", nameField: "NM_MUN", dataFields: ["AREA", "NM_MUN"] };

  it("builds an SVG with ids, escaped names and data attributes", () => {
    const svg = buildSvg(result, fields);
    expect(svg).toContain('id="feature-2300001"');
    expect(svg).toContain('data-name="São &lt;Teste&gt; &amp; Cia"');
    expect(svg).toContain("<title>São &lt;Teste&gt; &amp; Cia</title>");
    expect(svg).toContain('data-area="10"');
    expect(svg).not.toContain("data-nm-mun"); // the name field is already data-name
    expect(svg.match(/<path [^>]*class="feature"/g)).toHaveLength(2);
  });

  it("builds the generic JSON", () => {
    const json = JSON.parse(buildJson(result, fields));
    expect(json.features[1]).toMatchObject({ id: "2300002", name: "Ararendá", properties: { AREA: 20 } });
  });

  it("builds GeoJSON in longitude/latitude with RFC 7946 winding", () => {
    const json = JSON.parse(buildGeoJson(result, fields));
    expect(json.type).toBe("FeatureCollection");
    expect(json.features[0]).toMatchObject({
      type: "Feature",
      id: "2300001",
      properties: { CD_MUN: "2300001", NM_MUN: "São <Teste> & Cia", AREA: 10 },
      geometry: { type: "Polygon" },
    });
    const ring: Position[] = json.features[0].geometry.coordinates[0];
    expect(ring).toContainEqual([-39.5, -5.5]);
    // shoelace sum: positive means counterclockwise, as RFC 7946 requires for exterior rings
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    expect(sum).toBeGreaterThan(0);
  });

  it("builds the ceara-map JSON", () => {
    const json = JSON.parse(buildCearaMapJson(result, { ...fields, regionField: "AREA" }));
    expect(json.municipalities[0]).toMatchObject({ ibgeCode: 2300002, slug: "ararenda", region: "20", shape: "path" });
    expect(json.stateOutline).toBe(result.outline);
  });

  it("normalizes attribute names", () => {
    expect(dataAttributeName("NM_RGINT")).toBe("data-nm-rgint");
    expect(dataAttributeName("Área km²")).toBe("data-area-km2");
    expect(slugify("Juazeiro do Norte")).toBe("juazeiro-do-norte");
  });
});

// real data: the IBGE municipal mesh of Ceará, when it is available on this machine
const IBGE_ZIP = process.env.IBGE_ZIP ?? "../mapa-ceara/CE_Municipios_2025/CE_Municipios_2025.zip";

describe.skipIf(!existsSync(IBGE_ZIP))("IBGE shapefile", () => {
  it("converts the 184 municipalities of Ceará to a light SVG", async () => {
    const parsed = await shp(readFileSync(IBGE_ZIP));
    const layer = Array.isArray(parsed) ? parsed[0] : parsed;
    const features = layer.features as PolygonFeature[];
    expect(features).toHaveLength(184);

    const prepared = prepare(features);
    const result = convert(prepared, { ...OPTIONS, detail: 0.03 });
    const svg = buildSvg(result, { idField: "CD_MUN", nameField: "NM_MUN", dataFields: ["NM_RGINT"] });

    expect(result.features).toHaveLength(184);
    expect(result.features.every((f) => f.d.length > 10)).toBe(true);
    expect(result.height).toBeGreaterThan(result.width); // Ceará is taller than it is wide
    expect(svg).toContain('data-id="2304400"'); // Fortaleza
    expect(svg.length).toBeLessThan(400_000);

    const geoJson = buildGeoJson(result, { idField: "CD_MUN", nameField: "NM_MUN", dataFields: [] });
    const fortaleza = JSON.parse(geoJson).features.find((f: { id: string }) => f.id === "2304400");
    const [lon, lat] = fortaleza.geometry.coordinates.flat(2).slice(0, 2);
    expect(lon).toBeCloseTo(-38.5, 0);
    expect(lat).toBeCloseTo(-3.8, 0);
    console.log(
      `IBGE: ${prepared.sourcePoints} → ${result.points} pontos, SVG ${(svg.length / 1024).toFixed(0)} KB, GeoJSON ${(geoJson.length / 1024).toFixed(0)} KB, ${result.viewBox}`,
    );
  });
});
