import {
  geoArea,
  geoBounds,
  geoCentroid,
  geoConicEqualArea,
  geoEquirectangular,
  geoMercator,
  geoPath,
  geoTransverseMercator,
  type GeoProjection,
} from "d3-geo";
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { feature, merge } from "topojson-client";
import { topology } from "topojson-server";
import { presimplify, quantile, simplify, sphericalTriangleArea } from "topojson-simplify";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { PolygonFeature } from "./load";

export type ProjectionKind = "transverseMercator" | "mercator" | "conicEqualArea" | "equirectangular";

export const PROJECTIONS: Record<ProjectionKind, { label: string; hint: string }> = {
  transverseMercator: { label: "Transversa de Mercator", hint: "Como a UTM: forma fiel para estados e regiões (recomendada)" },
  mercator: { label: "Mercator", hint: "A dos mapas da web; distorce perto dos polos" },
  conicEqualArea: { label: "Cônica de áreas iguais", hint: "Preserva as áreas; boa para países inteiros" },
  equirectangular: { label: "Equiretangular", hint: "Latitude e longitude direto; distorce a forma" },
};

export type Prepared = {
  topology: Topology<{ layer: GeometryCollection<Record<string, unknown>> }>;
  /** coordinates in the original file, for the "before" size */
  sourcePoints: number;
};

export type ConvertOptions = {
  /** fraction of points kept by the simplification, from 0 to 1 */
  detail: number;
  projection: ProjectionKind;
  /** width of the SVG viewBox */
  width: number;
  /** decimal places in the SVG path data */
  digits: number;
};

export type ConvertedFeature = {
  properties: Record<string, unknown>;
  d: string;
  /** simplified geometry in longitude/latitude (d3 winding), before projection */
  geometry: Polygon | MultiPolygon;
};

export type Converted = {
  width: number;
  height: number;
  viewBox: string;
  features: ConvertedFeature[];
  /** outline of the whole area (all features merged) */
  outline: string;
  points: number;
};

const PADDING = 8;

function polygonsOf(geometry: Polygon | MultiPolygon): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

export function countPoints(features: PolygonFeature[]) {
  let total = 0;
  for (const f of features) for (const polygon of polygonsOf(f.geometry)) for (const ring of polygon) total += ring.length;
  return total;
}

/**
 * d3-geo works on the sphere and needs the exterior ring clockwise; GeoJSON (RFC 7946) uses the
 * opposite. A polygon wound the "wrong" way covers the whole globe minus itself, so it is
 * detected by its area (more than half the sphere) and its rings are reversed.
 */
function rewindForD3(f: PolygonFeature): PolygonFeature {
  const polygons = polygonsOf(f.geometry).map((rings) => {
    const area = geoArea({ type: "Polygon", coordinates: rings });
    return area > 2 * Math.PI ? rings.map((ring) => [...ring].reverse()) : rings;
  });
  const geometry: Polygon | MultiPolygon =
    f.geometry.type === "Polygon" ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
  return { ...f, geometry };
}

/**
 * Builds the topology once per upload. Shared borders become a single arc, so simplifying
 * later never opens gaps or overlaps between neighbors.
 */
export function prepare(features: PolygonFeature[]): Prepared {
  const collection: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features: features.map(rewindForD3),
  };
  const topo = topology({ layer: collection }, 1e6) as Prepared["topology"];
  return { topology: presimplify(topo, sphericalTriangleArea), sourcePoints: countPoints(features) };
}

function makeProjection(kind: ProjectionKind, collection: FeatureCollection): GeoProjection {
  const [lon, lat] = geoCentroid(collection);
  switch (kind) {
    case "transverseMercator":
      return geoTransverseMercator().rotate([-lon, -lat]);
    case "mercator":
      return geoMercator();
    case "conicEqualArea": {
      const [[, south], [, north]] = geoBounds(collection);
      const span = north - south;
      return geoConicEqualArea()
        .rotate([-lon, 0])
        .parallels([south + span / 6, north - span / 6]);
    }
    case "equirectangular":
      return geoEquirectangular();
  }
}

/** Simplifies, projects and turns every feature into SVG path data. */
export function convert(prepared: Prepared, options: ConvertOptions): Converted {
  const { topology: topo } = prepared;
  const detail = Math.min(Math.max(options.detail, 0), 1);
  // weights are sorted from largest to smallest, so quantile(p) is the cut that keeps a fraction p of the points
  const simplified = detail >= 1 ? topo : simplify(topo, quantile(topo, detail));

  const collection = feature(simplified, simplified.objects.layer) as FeatureCollection<
    Polygon | MultiPolygon,
    Record<string, unknown>
  >;
  const outlineGeometry = merge(simplified, simplified.objects.layer.geometries as never);

  // fit the width, then derive the height from the projected bounds
  const projection = makeProjection(options.projection, collection);
  const innerWidth = Math.max(options.width - PADDING * 2, 1);
  projection.fitWidth(innerWidth, collection);
  const measure = geoPath(projection);
  const [[x0, y0], [, y1]] = measure.bounds(collection);
  const [tx, ty] = projection.translate();
  projection.translate([tx + PADDING - x0, ty + PADDING - y0]);
  const height = Math.ceil(y1 - y0 + PADDING * 2);

  const path = geoPath(projection).digits(options.digits);
  const features = collection.features.map((f) => ({
    properties: f.properties ?? {},
    d: path(f) ?? "",
    geometry: f.geometry,
  }));

  return {
    width: options.width,
    height,
    viewBox: `0 0 ${options.width} ${height}`,
    features,
    outline: path(outlineGeometry) ?? "",
    points: countPoints(collection.features as PolygonFeature[]),
  };
}
