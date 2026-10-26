import { PROJECTIONS, type ProjectionKind } from "../lib/convert";
import type { FieldInfo } from "../lib/fields";

export type Settings = {
  idField?: string;
  nameField?: string;
  dataFields: string[];
  colorField?: string;
  /** slider position from 0 to 1; the detail grows exponentially with it */
  detailSlider: number;
  projection: ProjectionKind;
  width: number;
  digits: number;
};

// the slider covers 0.1% to 100% on a log scale: small values matter most
const MIN_EXPONENT = -3;

export function sliderToDetail(slider: number) {
  return Math.min(1, 10 ** (MIN_EXPONENT * (1 - slider)));
}

export function detailToSlider(detail: number) {
  return 1 - Math.log10(Math.max(detail, 10 ** MIN_EXPONENT)) / MIN_EXPONENT;
}

export function formatPercent(detail: number) {
  const percent = detail * 100;
  return `${percent < 1 ? percent.toFixed(1) : Math.round(percent)}%`.replace(".", ",");
}

type Props = {
  fields: FieldInfo[];
  settings: Settings;
  onChange: (settings: Settings) => void;
};

export default function SettingsPanel({ fields, settings, onChange }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  const detail = sliderToDetail(settings.detailSlider);

  function toggleDataField(name: string) {
    const dataFields = settings.dataFields.includes(name)
      ? settings.dataFields.filter((f) => f !== name)
      : [...settings.dataFields, name];
    set("dataFields", dataFields);
  }

  return (
    <div className="panel">
      <section className="panel-section">
        <h2>Campos</h2>
        <label className="field">
          <span>Identificador</span>
          <select value={settings.idField ?? ""} onChange={(e) => set("idField", e.target.value || undefined)}>
            <option value="">(nenhum — usar a ordem)</option>
            {fields.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
                {f.unique ? "" : " (tem valores repetidos)"}
              </option>
            ))}
          </select>
          <small>Vira o id de cada forma. Ex.: o código IBGE.</small>
        </label>
        <label className="field">
          <span>Nome</span>
          <select value={settings.nameField ?? ""} onChange={(e) => set("nameField", e.target.value || undefined)}>
            <option value="">(nenhum)</option>
            {fields.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="field">
          <legend>Atributos para levar no arquivo e no tooltip</legend>
          <div className="checklist">
            {fields
              .filter((f) => f.name !== settings.idField && f.name !== settings.nameField)
              .map((f) => (
                <label key={f.name} className="check">
                  <input
                    type="checkbox"
                    checked={settings.dataFields.includes(f.name)}
                    onChange={() => toggleDataField(f.name)}
                  />
                  <span className="check-name">{f.name}</span>
                  <span className="check-example">{f.example || "—"}</span>
                </label>
              ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Colorir a pré-visualização por</span>
          <select value={settings.colorField ?? ""} onChange={(e) => set("colorField", e.target.value || undefined)}>
            <option value="">(cor única)</option>
            {fields.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
          <small>Útil para conferir regiões. Só afeta a pré-visualização.</small>
        </label>
      </section>

      <section className="panel-section">
        <h2>Desenho</h2>
        <label className="field">
          <span>
            Detalhe <output>{formatPercent(detail)}</output>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={settings.detailSlider}
            onChange={(e) => set("detailSlider", Number(e.target.value))}
          />
          <small>Percentual de pontos mantidos. As divisas entre vizinhos continuam encaixadas.</small>
        </label>
        <label className="field">
          <span>Projeção</span>
          <select value={settings.projection} onChange={(e) => set("projection", e.target.value as ProjectionKind)}>
            {Object.entries(PROJECTIONS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
          <small>{PROJECTIONS[settings.projection].hint}</small>
        </label>
        <div className="field-row">
          <label className="field">
            <span>Largura (px)</span>
            <input
              type="number"
              min={100}
              max={4000}
              step={50}
              value={settings.width}
              onChange={(e) => set("width", Math.min(Math.max(Number(e.target.value) || 900, 100), 4000))}
            />
          </label>
          <label className="field">
            <span>Casas decimais</span>
            <select value={settings.digits} onChange={(e) => set("digits", Number(e.target.value))}>
              <option value={0}>0 (menor arquivo)</option>
              <option value={1}>1</option>
              <option value={2}>2 (mais preciso)</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
