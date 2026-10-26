import { useMemo, useState } from "react";
import type { Converted } from "../lib/convert";
import { buildCearaMapJson, buildGeoJson, buildJson, buildSvg, byteSize, download, formatBytes, type ExportFields } from "../lib/export";
import type { FieldInfo } from "../lib/fields";

type Props = {
  result: Converted;
  fields: FieldInfo[];
  exportFields: Omit<ExportFields, "regionField">;
  baseName: string;
};

export default function ExportPanel({ result, fields, exportFields, baseName }: Props) {
  const [regionField, setRegionField] = useState<string>();

  // exportFields comes memoized from App, so each file is rebuilt only when its inputs change
  const svg = useMemo(() => buildSvg(result, exportFields), [result, exportFields]);
  const json = useMemo(() => buildJson(result, exportFields), [result, exportFields]);
  const geoJson = useMemo(() => buildGeoJson(result, exportFields), [result, exportFields]);
  const cearaMap = useMemo(
    () => buildCearaMapJson(result, { ...exportFields, regionField }),
    [result, exportFields, regionField],
  );

  const outputs = [
    {
      title: "SVG",
      description: "Um <path> por área, com id, data-* e <title>. Pronto para colocar numa página e ligar eventos.",
      size: byteSize(svg),
      fileName: `${baseName}.svg`,
      content: svg,
      type: "image/svg+xml",
    },
    {
      title: "JSON",
      description: "viewBox, contorno e, para cada área, id, nome, atributos e o caminho (d) do SVG.",
      size: byteSize(json),
      fileName: `${baseName}.json`,
      content: json,
      type: "application/json",
    },
    {
      title: "GeoJSON",
      description: "Geometria simplificada em latitude/longitude (sem projeção), com os atributos escolhidos. Para Leaflet, Mapbox, QGIS etc.",
      size: byteSize(geoJson),
      fileName: `${baseName}.geojson`,
      content: geoJson,
      type: "application/geo+json",
    },
    {
      title: "JSON da ceara-map",
      description: "No formato do municipalities.json da biblioteca ceara-map (ibgeCode, slug, name, geometry).",
      size: byteSize(cearaMap),
      fileName: `${baseName}.ceara-map.json`,
      content: cearaMap,
      type: "application/json",
    },
  ];

  return (
    <div className="panel">
      <section className="panel-section">
        <h2>Exportar</h2>
        <div className="exports">
          {outputs.map((output) => (
            <div key={output.title} className="export">
              <div className="export-text">
                <strong>
                  {output.title} <span className="export-size">{formatBytes(output.size)}</span>
                </strong>
                <p>{output.description}</p>
                {output.title === "JSON da ceara-map" && (
                  <label className="field field-inline">
                    <span>Campo de região</span>
                    <select value={regionField ?? ""} onChange={(e) => setRegionField(e.target.value || undefined)}>
                      <option value="">(nenhum)</option>
                      {fields.map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <button
                type="button"
                className="button button-primary"
                onClick={() => download(output.fileName, output.content, output.type)}
              >
                Baixar
              </button>
            </div>
          ))}
        </div>
        {!exportFields.idField && (
          <p className="warning">Sem campo identificador, as áreas são numeradas pela ordem do arquivo.</p>
        )}
      </section>
    </div>
  );
}
