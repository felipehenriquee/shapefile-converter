import { File as NodeFile } from "node:buffer";
import { describe, expect, it } from "vitest";
import { ConverterSession } from "./session";

// Node 18 has no global File; the one in node:buffer has the same API
function geoJsonFile(name: string, collection: object) {
  return new NodeFile([JSON.stringify(collection)], name) as unknown as File;
}

const collection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { CD_MUN: "1", NM_MUN: "Um" },
      geometry: { type: "Polygon", coordinates: [[[-39, -5], [-38, -5], [-38, -4], [-39, -4], [-39, -5]]] },
    },
    { type: "Feature", properties: { CD_MUN: "2" }, geometry: { type: "Point", coordinates: [-38, -4] } },
  ],
};

const OPTIONS = { detail: 1, projection: "transverseMercator", width: 400, digits: 1 } as const;

describe("ConverterSession", () => {
  it("returns the attributes of a loaded layer, without the geometry", async () => {
    const session = new ConverterSession();
    const [layer] = await session.load([geoJsonFile("mapa.geojson", collection)]);
    expect(layer).toEqual({ name: "mapa", skipped: 1, points: 5, properties: [{ CD_MUN: "1", NM_MUN: "Um" }] });
  });

  it("converts the loaded layer and replaces it on a new load", async () => {
    const session = new ConverterSession();
    await session.load([geoJsonFile("mapa.geojson", collection)]);
    const { result, sourcePoints } = session.convert(0, OPTIONS);
    expect(sourcePoints).toBe(5);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].d).toMatch(/^M/);

    await expect(session.load([geoJsonFile("vazio.geojson", { type: "FeatureCollection", features: [] })])).rejects.toThrow(
      "não tem polígonos",
    );
    expect(() => session.convert(1, OPTIONS)).toThrow();
  });
});
