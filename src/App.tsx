import { useEffect, useMemo, useRef, useState } from "react";
import ExportPanel from "./components/ExportPanel";
import MapPreview from "./components/MapPreview";
import SettingsPanel, { detailToSlider, formatPercent, sliderToDetail, type Settings } from "./components/SettingsPanel";
import UploadArea from "./components/UploadArea";
import { CancelledError, ConverterClient } from "./converterClient";
import type { ConvertOptions } from "./lib/convert";
import { formatBytes } from "./lib/export";
import { describeFields, fieldValue, guessIdField, guessNameField } from "./lib/fields";
import { LoadError } from "./lib/load";
import type { ConvertResult, LayerInfo } from "./lib/session";

// default detail aims at ~10k points: light files that still look smooth on screen
const TARGET_POINTS = 10_000;

// categorical palette for "color by"; repeats after 10 categories
const PALETTE = ["#3b82f6", "#14b8a6", "#8b5cf6", "#84cc16", "#ec4899", "#f97316", "#eab308", "#06b6d4", "#ef4444", "#64748b"];

function defaultSettings(layer: LayerInfo): Settings {
  const fields = describeFields(layer.properties);
  return {
    idField: guessIdField(fields),
    nameField: guessNameField(fields),
    dataFields: [],
    colorField: undefined,
    detailSlider: detailToSlider(Math.min(1, TARGET_POINTS / layer.points)),
    projection: "transverseMercator",
    width: 900,
    digits: 1,
  };
}

/** A worker result, tagged with what it was computed from so stale ones can be spotted. */
type Conversion = ConvertResult & { layers: LayerInfo[]; layerIndex: number; drawing: ConvertOptions };

export default function App() {
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [layerIndex, setLayerIndex] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conversion, setConversion] = useState<Conversion | null>(null);

  // loading and conversion run in a Web Worker, so large files don't freeze the page
  const clientRef = useRef<ConverterClient | null>(null);
  const loadIdRef = useRef(0);
  useEffect(() => {
    const client = new ConverterClient();
    clientRef.current = client;
    return () => client.dispose();
  }, []);

  const layer = layers[layerIndex];
  const fields = useMemo(() => (layer ? describeFields(layer.properties) : []), [layer]);

  // only the drawing settings trigger a new conversion (not field or color choices)
  const drawing = useMemo<ConvertOptions | null>(
    () =>
      settings && {
        detail: sliderToDetail(settings.detailSlider),
        projection: settings.projection,
        width: settings.width,
        digits: settings.digits,
      },
    [settings?.detailSlider, settings?.projection, settings?.width, settings?.digits],
  );

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !layer || !drawing) return;
    // while a conversion runs, newer settings replace older queued ones, so the slider stays responsive
    client.convert(layerIndex, drawing).then(
      (converted) => converted && setConversion({ ...converted, layers, layerIndex, drawing }),
      (e) => {
        setError("Não foi possível converter o mapa.");
        console.error(e);
      },
    );
  }, [layers, layerIndex, layer, drawing]);

  // a result from another file or layer is never shown; one with older settings is shown while the new one arrives
  const current = conversion && conversion.layers === layers && conversion.layerIndex === layerIndex ? conversion : null;
  const result = current?.result ?? null;
  const stale = current !== null && current.drawing !== drawing;

  const exportFields = useMemo(
    () => ({ idField: settings?.idField, nameField: settings?.nameField, dataFields: settings?.dataFields ?? [] }),
    [settings?.idField, settings?.nameField, settings?.dataFields],
  );

  const colors = useMemo(() => {
    if (!result || !settings?.colorField) return null;
    const categories = new Map<string, string>();
    const fills = result.features.map((f) => {
      const value = fieldValue(f.properties, settings.colorField);
      if (!categories.has(value)) categories.set(value, PALETTE[categories.size % PALETTE.length]);
      return categories.get(value);
    });
    return { fills, legend: [...categories].sort(([a], [b]) => a.localeCompare(b, "pt-BR")) };
  }, [result, settings?.colorField]);

  async function handleFiles(files: File[]) {
    const client = clientRef.current;
    if (!client) return;
    const loadId = ++loadIdRef.current;
    setBusy(true);
    setError(null);
    try {
      const loaded = await client.load(files);
      if (loadId !== loadIdRef.current) return;
      setLayers(loaded);
      setLayerIndex(0);
      setSelected(null);
      setSettings(defaultSettings(loaded[0]));
    } catch (e) {
      // a newer upload or a cancel took over
      if (e instanceof CancelledError || loadId !== loadIdRef.current) return;
      setError(e instanceof LoadError ? e.message : "Não foi possível ler o arquivo.");
      console.error(e);
    } finally {
      if (loadId === loadIdRef.current) setBusy(false);
    }
  }

  function cancel() {
    loadIdRef.current++;
    clientRef.current?.restart();
    setBusy(false);
    setLayers([]);
    setSettings(null);
    setConversion(null);
  }

  function changeLayer(index: number) {
    setLayerIndex(index);
    setSelected(null);
    setSettings(defaultSettings(layers[index]));
  }

  const selectedFeature = selected !== null && result ? result.features[selected] : undefined;
  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Map Converter</h1>
          <p>Converta shapefile ou GeoJSON em um mapa SVG interativo e em JSON.</p>
        </div>
        {result && <UploadArea onFiles={handleFiles} busy={busy} compact />}
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!layer || !settings || !current || !result ? (
        <UploadArea
          onFiles={handleFiles}
          busy={busy || (!!layer && !error)}
          busyText={busy ? "Lendo o arquivo…" : "Preparando o mapa…"}
          onCancel={cancel}
        />
      ) : (
        <main className="workspace">
          <aside className="sidebar">
            {layers.length > 1 && (
              <div className="panel">
                <section className="panel-section">
                  <label className="field">
                    <span>Camada</span>
                    <select value={layerIndex} onChange={(e) => changeLayer(Number(e.target.value))}>
                      {layers.map((l, i) => (
                        <option key={i} value={i}>
                          {l.name} ({l.properties.length})
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              </div>
            )}
            <SettingsPanel fields={fields} settings={settings} onChange={setSettings} />
          </aside>

          <section className="main">
            <div className="stats">
              <span>
                <strong>{layer.name}</strong>
              </span>
              <span>{result.features.length} áreas</span>
              <span>
                {current.sourcePoints.toLocaleString("pt-BR")} → {result.points.toLocaleString("pt-BR")} pontos (
                {formatPercent(sliderToDetail(settings.detailSlider))})
              </span>
              <span>
                {result.width} × {result.height}
              </span>
              {layer.skipped > 0 && <span className="warning">{layer.skipped} itens sem polígono ignorados</span>}
              {stale && <span className="stats-busy">atualizando…</span>}
            </div>

            <div className="card">
              <MapPreview
                result={result}
                idField={settings.idField}
                nameField={settings.nameField}
                tooltipFields={settings.dataFields}
                fills={colors?.fills}
                selected={selected}
                onSelect={setSelected}
              />
              {colors && (
                <ul className="legend">
                  {colors.legend.map(([value, color]) => (
                    <li key={value}>
                      <span className="swatch" style={{ backgroundColor: color }} />
                      {value || "(vazio)"}
                    </li>
                  ))}
                </ul>
              )}
              {colors && colors.legend.length > PALETTE.length && (
                <p className="warning">
                  {colors.legend.length} categorias: as cores se repetem a partir da {PALETTE.length + 1}ª.
                </p>
              )}
            </div>

            {selectedFeature && (
              <div className="card">
                <div className="card-header">
                  <h2>
                    {fieldValue(selectedFeature.properties, settings.nameField) ||
                      fieldValue(selectedFeature.properties, settings.idField) ||
                      `Área ${selected! + 1}`}
                  </h2>
                  <button type="button" className="button" onClick={() => setSelected(null)}>
                    Fechar
                  </button>
                </div>
                <table className="attributes">
                  <tbody>
                    {Object.entries(selectedFeature.properties).map(([key, value]) => (
                      <tr key={key}>
                        <th>{key}</th>
                        <td>{value === null || value === undefined || value === "" ? "—" : String(value)}</td>
                      </tr>
                    ))}
                    <tr>
                      <th>Tamanho do caminho</th>
                      <td>{formatBytes(selectedFeature.d.length)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

          </section>

          <section className="export-area">
            <ExportPanel
              result={result}
              fields={fields}
              exportFields={exportFields}
              baseName={layer.name.split("/").pop() || "mapa"}
            />
          </section>
        </main>
      )}
    </div>
  );
}
