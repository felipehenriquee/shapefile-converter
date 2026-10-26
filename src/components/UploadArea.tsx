import { useRef, useState, type DragEvent } from "react";

type Props = {
  onFiles: (files: File[]) => void;
  busy: boolean;
  /** shown while busy (defaults to reading the file) */
  busyText?: string;
  /** when given, a busy upload area offers to cancel */
  onCancel?: () => void;
  compact?: boolean;
};

const ACCEPT = ".zip,.shp,.dbf,.prj,.cpg,.shx,.geojson,.json";

export default function UploadArea({ onFiles, busy, busyText = "Lendo o arquivo…", onCancel, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (files.length) onFiles(files);
  }

  return (
    <div
      className={`upload${compact ? " upload-compact" : ""}${dragging ? " upload-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length) onFiles(files);
          event.target.value = "";
        }}
      />
      {compact ? (
        <button type="button" className="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Lendo…" : "Trocar arquivo"}
        </button>
      ) : (
        <>
          <svg className="upload-icon" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="upload-title">{busy ? busyText : "Arraste o arquivo do mapa aqui"}</p>
          <p className="upload-hint">
            Shapefile em <strong>.zip</strong>, ou os arquivos <strong>.shp</strong>, <strong>.dbf</strong>,{" "}
            <strong>.prj</strong> e <strong>.cpg</strong> juntos, ou <strong>GeoJSON</strong>.
          </p>
          {busy && onCancel ? (
            <button type="button" className="button" onClick={onCancel}>
              Cancelar
            </button>
          ) : (
            <button type="button" className="button button-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
              Escolher arquivos
            </button>
          )}
          <p className="upload-privacy">O arquivo é processado no seu navegador e não é enviado para nenhum servidor.</p>
        </>
      )}
    </div>
  );
}
