import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { Converted } from "../lib/convert";
import { fieldValue } from "../lib/fields";

type Props = {
  result: Converted;
  nameField?: string;
  idField?: string;
  tooltipFields: string[];
  /** fill per feature index (when coloring by a field) */
  fills?: (string | undefined)[];
  selected: number | null;
  onSelect: (index: number | null) => void;
};

const OFFSET = 14;
const MAX_ZOOM = 32;
const ZOOM_STEP = 1.6;
// pixels the pointer must move before a press becomes a drag (so clicks still select)
const DRAG_THRESHOLD = 4;

/** Zoom level and center (in viewBox units), tied to the viewBox it was set for. */
type View = { viewBox: string; zoom: number; cx: number; cy: number };

function clampView(view: View, width: number, height: number): View {
  const zoom = Math.min(Math.max(view.zoom, 1), MAX_ZOOM);
  const halfW = width / zoom / 2;
  const halfH = height / zoom / 2;
  return {
    ...view,
    zoom,
    cx: Math.min(Math.max(view.cx, halfW), width - halfW),
    cy: Math.min(Math.max(view.cy, halfH), height - halfH),
  };
}

export default function MapPreview({ result, nameField, idField, tooltipFields, fills, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  // a zoom set for another viewBox (e.g. after changing the width) falls back to the whole map
  const { width, height } = result;
  const initial: View = { viewBox: result.viewBox, zoom: 1, cx: width / 2, cy: height / 2 };
  const [storedView, setView] = useState<View>(initial);
  const view = storedView.viewBox === result.viewBox ? storedView : initial;
  const viewBox = [view.cx - width / view.zoom / 2, view.cy - height / view.zoom / 2, width / view.zoom, height / view.zoom].join(" ");

  function zoomBy(factor: number) {
    setView(clampView({ ...view, zoom: view.zoom * factor }, width, height));
  }

  // dragging pans the map once zoomed in; the pointer is only captured after it moves, so a
  // plain click still reaches the area under it
  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (view.zoom <= 1 || event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy, moved: false };
  }

  function drag(event: PointerEvent<SVGSVGElement>) {
    const start = dragRef.current;
    const matrix = svgRef.current?.getScreenCTM();
    if (!start || !matrix) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      start.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      setHovered(null);
    }
    // screen pixels → viewBox units
    setView(clampView({ ...view, cx: start.cx - dx / matrix.a, cy: start.cy - dy / matrix.d }, width, height));
  }

  function endDrag() {
    dragRef.current = null;
    setDragging(false);
  }

  // the tooltip is positioned straight in the DOM, so moving the mouse doesn't re-render the map
  function moveTooltip(event: MouseEvent) {
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !tooltip) return;
    const area = container.getBoundingClientRect();
    let x = event.clientX - area.left + OFFSET;
    let y = event.clientY - area.top + OFFSET;
    if (x + tooltip.offsetWidth > area.width) x -= tooltip.offsetWidth + OFFSET * 2;
    if (y + tooltip.offsetHeight > area.height) y -= tooltip.offsetHeight + OFFSET * 2;
    tooltip.style.transform = `translate(${Math.max(x, 0)}px, ${Math.max(y, 0)}px)`;
  }

  const hoveredFeature = hovered === null ? undefined : result.features[hovered];
  const label = (index: number) => {
    const props = result.features[index].properties;
    return fieldValue(props, nameField) || fieldValue(props, idField) || `Área ${index + 1}`;
  };

  return (
    <div className="preview" ref={containerRef} onMouseMove={moveTooltip} onMouseLeave={() => setHovered(null)}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="preview-svg"
        data-pannable={view.zoom > 1 || undefined}
        data-dragging={dragging || undefined}
        role="img"
        aria-label="Pré-visualização do mapa"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {result.features.map((f, index) => (
          <path
            key={index}
            d={f.d}
            className="preview-feature"
            data-hovered={hovered === index || undefined}
            data-selected={selected === index || undefined}
            style={fills?.[index] ? { fill: fills[index] } : undefined}
            tabIndex={0}
            role="button"
            aria-label={label(index)}
            onMouseEnter={() => !dragging && setHovered(index)}
            onClick={() => onSelect(selected === index ? null : index)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(selected === index ? null : index);
              }
            }}
          />
        ))}
        <path className="preview-outline" d={result.outline} />
      </svg>

      <div className="zoom-controls">
        <button
          type="button"
          className="zoom-button"
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={view.zoom >= MAX_ZOOM}
          aria-label="Aproximar"
          title="Aproximar"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <button
          type="button"
          className="zoom-button"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          disabled={view.zoom <= 1}
          aria-label="Afastar"
          title="Afastar"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M3 8h10" />
          </svg>
        </button>
        <button
          type="button"
          className="zoom-button"
          onClick={() => setView(initial)}
          disabled={view.zoom <= 1}
          aria-label="Ver o mapa inteiro"
          title="Ver o mapa inteiro"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
          </svg>
        </button>
      </div>
      {view.zoom > 1 && <span className="zoom-level">{Math.round(view.zoom * 100)}%</span>}

      <div ref={tooltipRef} className="tooltip" data-visible={hoveredFeature ? true : undefined} aria-hidden="true">
        {hoveredFeature && hovered !== null && (
          <>
            <strong>{label(hovered)}</strong>
            {tooltipFields.length > 0 && (
              <dl>
                {tooltipFields.map((field) => (
                  <div key={field}>
                    <dt>{field}</dt>
                    <dd>{fieldValue(hoveredFeature.properties, field) || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
}
