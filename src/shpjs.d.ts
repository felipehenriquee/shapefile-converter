declare module "shpjs" {
  import type { FeatureCollection } from "geojson";

  type Binary = ArrayBuffer | ArrayBufferView;
  type ParsedLayer = FeatureCollection & { fileName?: string };

  /** Parses a zipped shapefile, or an object with the loose .shp/.dbf/.prj/.cpg contents. */
  export default function shp(
    input: Binary | { shp: Binary; dbf?: Binary; prj?: Binary | string; cpg?: Binary | string },
  ): Promise<ParsedLayer | ParsedLayer[]>;
}
