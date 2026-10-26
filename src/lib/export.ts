import type { MultiPolygon, Polygon, Position } from "geojson";
import type { Converted } from "./convert";
import { fieldValue } from "./fields";

export type ExportFields = {
  idField?: string;
  nameField?: string;
  /** extra attributes carried into the output */
  dataFields: string[];
  /** optional field used as `region` in the ceara-map format */
  regionField?: string;
};

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Attribute name for a field: data-<lowercase, hyphenated>. */
export function dataAttributeName(field: string) {
  const name = field
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `data-${name || "field"}`;
}

export function slugify(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function selectedProperties(properties: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, properties[field] ?? null]));
}

/**
 * Standalone SVG: one <path> per feature with id and data-* attributes, a <title> for the native
 * tooltip and minimal styles, ready to receive interactions from any page.
 */
export function buildSvg(result: Converted, fields: ExportFields) {
  const lines = result.features.map((f, index) => {
    const id = fieldValue(f.properties, fields.idField) || String(index + 1);
    const name = fieldValue(f.properties, fields.nameField);
    const attributes = [
      `id="feature-${escapeAttribute(slugify(id) || String(index + 1))}"`,
      `class="feature"`,
      `data-id="${escapeAttribute(id)}"`,
      name && `data-name="${escapeAttribute(name)}"`,
      ...fields.dataFields
        .filter((field) => field !== fields.idField && field !== fields.nameField)
        .map((field) => `${dataAttributeName(field)}="${escapeAttribute(fieldValue(f.properties, field))}"`),
    ].filter(Boolean);
    const title = name ? `<title>${escapeText(name)}</title>` : "";
    return `    <path ${attributes.join(" ")} d="${f.d}">${title}</path>`;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${result.viewBox}" width="${result.width}" height="${result.height}">`,
    `  <style>`,
    `    .feature { fill: #cbd5e1; stroke: #ffffff; stroke-width: 0.6; stroke-linejoin: round; transition: fill .2s; }`,
    `    .feature:hover { fill: #0f172a; }`,
    `    .outline { fill: none; stroke: #94a3b8; stroke-width: 1.5; stroke-linejoin: round; pointer-events: none; }`,
    `  </style>`,
    `  <g class="features">`,
    ...lines,
    `  </g>`,
    `  <path class="outline" d="${result.outline}"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

/** Generic JSON: viewBox, outline and, per feature, id, name, chosen attributes and path data. */
export function buildJson(result: Converted, fields: ExportFields) {
  return JSON.stringify(
    {
      viewBox: result.viewBox,
      width: result.width,
      height: result.height,
      outline: result.outline,
      features: result.features.map((f, index) => ({
        id: fieldValue(f.properties, fields.idField) || String(index + 1),
        name: fieldValue(f.properties, fields.nameField) || null,
        properties: selectedProperties(f.properties, fields.dataFields),
        d: f.d,
      })),
    },
    null,
    1,
  );
}

/** Twice the signed planar area of a ring: positive when counterclockwise. */
function ringArea(ring: Position[]) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return sum;
}

/**
 * RFC 7946 winding (exterior counterclockwise, holes clockwise) with coordinates rounded to
 * `digits` decimal places; the converted geometry comes in d3's opposite winding.
 */
function toRfc7946(geometry: Polygon | MultiPolygon, digits: number): Polygon | MultiPolygon {
  const factor = 10 ** digits;
  const round = (n: number) => Math.round(n * factor) / factor;
  const fixPolygon = (rings: Position[][]) =>
    rings.map((ring, index) => {
      const rounded = ring.map(([x, y]) => [round(x), round(y)]);
      const counterclockwise = ringArea(rounded) > 0;
      return counterclockwise === (index === 0) ? rounded : rounded.reverse();
    });
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: fixPolygon(geometry.coordinates) }
    : { type: "MultiPolygon", coordinates: geometry.coordinates.map(fixPolygon) };
}

/**
 * GeoJSON FeatureCollection with the simplified geometry in longitude/latitude (not projected),
 * for Leaflet, Mapbox, QGIS etc. Properties keep the original field names.
 */
export function buildGeoJson(result: Converted, fields: ExportFields, digits = 5) {
  const propertyFields = [...new Set([fields.idField, fields.nameField, ...fields.dataFields].filter((f) => f !== undefined))];
  return JSON.stringify({
    type: "FeatureCollection",
    features: result.features.map((f, index) => ({
      type: "Feature",
      id: fieldValue(f.properties, fields.idField) || String(index + 1),
      properties: selectedProperties(f.properties, propertyFields),
      geometry: toRfc7946(f.geometry, digits),
    })),
  });
}

/**
 * JSON in the format of the ceara-map library (src/municipalities.json): numeric IBGE code,
 * slug, name, region and the path data as "geometry".
 */
export function buildCearaMapJson(result: Converted, fields: ExportFields) {
  return JSON.stringify(
    {
      viewBox: result.viewBox,
      stateOutline: result.outline,
      municipalities: result.features
        .map((f, index) => {
          const id = fieldValue(f.properties, fields.idField) || String(index + 1);
          const name = fieldValue(f.properties, fields.nameField) || id;
          const region = fieldValue(f.properties, fields.regionField);
          return {
            ibgeCode: /^\d+$/.test(id) ? Number(id) : id,
            slug: slugify(name),
            name,
            ...(region ? { region } : {}),
            shape: "path",
            geometry: f.d,
          };
        })
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    },
    null,
    1,
  );
}

export function byteSize(text: string) {
  return new Blob([text]).size;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2).replace(".", ",")} MB`;
}

export function download(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
