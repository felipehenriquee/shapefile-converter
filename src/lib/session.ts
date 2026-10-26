import { convert, countPoints, prepare, type Converted, type ConvertOptions, type Prepared } from "./convert";
import { loadFiles, type Layer } from "./load";

/** What the page needs to know about a layer: everything but the geometry. */
export type LayerInfo = {
  name: string;
  skipped: number;
  points: number;
  /** attributes of each feature, in file order */
  properties: Record<string, unknown>[];
};

export type ConvertResult = { result: Converted; sourcePoints: number };

/**
 * Keeps the loaded layers and their topologies, so the geometry stays wherever the session
 * lives (the Web Worker) and only attributes and results cross over to the page.
 */
export class ConverterSession {
  private layers: Layer[] = [];
  private prepared = new Map<number, Prepared>();

  async load(files: File[]): Promise<LayerInfo[]> {
    this.layers = await loadFiles(files);
    this.prepared.clear();
    return this.layers.map((layer) => ({
      name: layer.name,
      skipped: layer.skipped,
      points: countPoints(layer.features),
      properties: layer.features.map((f) => f.properties),
    }));
  }

  convert(layerIndex: number, options: ConvertOptions): ConvertResult {
    const layer = this.layers[layerIndex];
    if (!layer) throw new Error(`Layer ${layerIndex} is not loaded`);
    // building the topology is the slow step, so it runs once per layer
    let prepared = this.prepared.get(layerIndex);
    if (!prepared) {
      prepared = prepare(layer.features);
      this.prepared.set(layerIndex, prepared);
    }
    return { result: convert(prepared, options), sourcePoints: prepared.sourcePoints };
  }
}
