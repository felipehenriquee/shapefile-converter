import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type PolygonFeature = Feature<Polygon | MultiPolygon, Record<string, unknown>>;

export type Layer = {
  name: string;
  features: PolygonFeature[];
  /** features without a polygon geometry (points, lines, empty) that were left out */
  skipped: number;
};

export class LoadError extends Error {}

// shpjs (and the proj4 it brings) is most of the bundle, so it only loads once a file is chosen
async function shapefileReader() {
  return (await import("shpjs")).default;
}

const SHAPEFILE_PARTS = ["shp", "dbf", "prj", "cpg", "shx", "qmd", "sbn", "sbx", "xml"];

function extension(name: string) {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

function baseName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}

function toLayer(name: string, collection: FeatureCollection): Layer {
  const features = collection.features.filter(
    (f): f is PolygonFeature => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
  );
  return {
    name,
    features: features.map((f) => ({ ...f, properties: f.properties ?? {} })),
    skipped: collection.features.length - features.length,
  };
}

function assertLonLat(layer: Layer) {
  // without a .prj, shpjs keeps the original coordinates; anything outside degrees can't be drawn
  for (const feature of layer.features) {
    const rings = feature.geometry.type === "Polygon" ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
    for (const ring of rings) {
      for (const [x, y] of ring) {
        if (Math.abs(x) > 180 || Math.abs(y) > 90) {
          throw new LoadError(
            `As coordenadas de "${layer.name}" não estão em graus (latitude/longitude). Envie junto o arquivo .prj para que a projeção seja convertida.`,
          );
        }
      }
    }
  }
}

async function readZip(file: File): Promise<Layer[]> {
  let parsed;
  try {
    const shp = await shapefileReader();
    parsed = await shp(await file.arrayBuffer());
  } catch {
    throw new LoadError(`Não foi possível ler "${file.name}". Confira se o .zip contém um shapefile (.shp e .dbf).`);
  }
  const collections = Array.isArray(parsed) ? parsed : [parsed];
  return collections.map((c) => toLayer(c.fileName ?? baseName(file.name), c));
}

async function readShapefileParts(name: string, parts: Map<string, File>): Promise<Layer> {
  const shpFile = parts.get("shp");
  if (!shpFile) {
    throw new LoadError(`Falta o arquivo "${name}.shp". Envie o .shp junto com o .dbf (e de preferência o .prj e o .cpg).`);
  }
  const read = async (ext: string) => {
    const file = parts.get(ext);
    return file ? new Uint8Array(await file.arrayBuffer()) : undefined;
  };
  const prj = parts.get("prj");
  const cpg = parts.get("cpg");
  try {
    const shp = await shapefileReader();
    const collection = await shp({
      shp: (await read("shp"))!,
      dbf: await read("dbf"),
      prj: prj ? await prj.text() : undefined,
      cpg: cpg ? await cpg.text() : undefined,
    });
    return toLayer(name, Array.isArray(collection) ? collection[0] : collection);
  } catch (error) {
    if (error instanceof LoadError) throw error;
    throw new LoadError(`Não foi possível ler o shapefile "${name}". O arquivo pode estar corrompido.`);
  }
}

async function readGeoJson(file: File): Promise<Layer> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new LoadError(`"${file.name}" não é um JSON válido.`);
  }
  const value = data as { type?: string; features?: unknown };
  if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
    return toLayer(baseName(file.name), value as FeatureCollection);
  }
  if (value.type === "Feature") {
    return toLayer(baseName(file.name), { type: "FeatureCollection", features: [value as Feature] });
  }
  throw new LoadError(`"${file.name}" não é um GeoJSON (esperava um FeatureCollection).`);
}

/** Reads the uploaded files: a .zip, the loose parts of a shapefile, or GeoJSON. */
export async function loadFiles(files: File[]): Promise<Layer[]> {
  const layers: Layer[] = [];
  const shapefiles = new Map<string, Map<string, File>>();

  for (const file of files) {
    const ext = extension(file.name);
    if (ext === "zip") {
      layers.push(...(await readZip(file)));
    } else if (ext === "geojson" || ext === "json") {
      layers.push(await readGeoJson(file));
    } else if (SHAPEFILE_PARTS.includes(ext)) {
      const name = baseName(file.name);
      if (!shapefiles.has(name)) shapefiles.set(name, new Map());
      shapefiles.get(name)!.set(ext, file);
    } else {
      throw new LoadError(`Formato não suportado: "${file.name}". Envie .zip, .shp/.dbf/.prj ou .geojson.`);
    }
  }
  for (const [name, parts] of shapefiles) {
    layers.push(await readShapefileParts(name, parts));
  }

  if (layers.length === 0) throw new LoadError("Nenhum arquivo de mapa encontrado.");
  for (const layer of layers) {
    if (layer.features.length === 0) {
      throw new LoadError(`"${layer.name}" não tem polígonos. Este conversor trabalha com áreas (municípios, estados, bairros…).`);
    }
    assertLonLat(layer);
  }
  return layers;
}
