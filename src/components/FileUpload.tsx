import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { UploadCloud, FileText, X, ShieldCheck } from "lucide-react";
import { cn } from "../lib/utils";

type Props = {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (idx: number) => void;
  maxFiles?: number;
};

export function FileUpload({ files, onAdd, onRemove, maxFiles = 10 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const canAdd = files.length < maxFiles;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const remaining = Math.max(0, maxFiles - files.length);
    if (remaining === 0) return;
    const incoming = Array.from(list).slice(0, remaining);
    onAdd(incoming);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (canAdd) setDragActive(true);
  };
  const onDragLeave = () => setDragActive(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        onClick={() => canAdd && inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && canAdd) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "w-full rounded-xl border-2 border-dashed transition-all duration-150 p-8 md:p-10 text-center cursor-pointer",
          dragActive
            ? "border-brand-blue bg-brand-blue/5"
            : canAdd
              ? "border-divider-muted hover:border-brand-blue/60 hover:bg-brand-blue/5"
              : "border-divider-muted bg-surface-offWhite cursor-not-allowed opacity-60"
        )}
        aria-disabled={!canAdd}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onChange}
          accept=".pdf,image/*,.csv,.xls,.xlsx"
        />
        <div className="mx-auto mb-3 inline-flex items-center justify-center h-12 w-12 rounded-full bg-brand-blue/10 text-brand-blue">
          <UploadCloud className="h-6 w-6" />
        </div>
        <div className="font-display font-semibold text-brand-navy">
          Drag and drop files, or click to browse
        </div>
        <div className="text-sm text-ink-muted mt-1">
          {canAdd
            ? `Upload up to ${maxFiles - files.length} more file${
                maxFiles - files.length === 1 ? "" : "s"
              } — PDFs, images, or spreadsheets`
            : "Maximum number of files reached"}
        </div>
      </div>

      {/* Uploaded list */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-divider-soft bg-white"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-md bg-brand-blue/10 text-brand-blue flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-brand-navy truncate">
                    {f.name}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {f.type || "Unknown type"} • {(f.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${f.name}`}
                className="p-1.5 rounded-md hover:bg-red-50 text-ink-muted hover:text-red-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Reassurance banner */}
      <div className="flex items-start gap-2.5 rounded-lg bg-brand-blue/5 border border-brand-blue/20 px-4 py-3 text-sm text-brand-blueDark">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          All files are transmitted over an encrypted connection and stored securely for
          our underwriting team.
        </span>
      </div>
    </div>
  );
}
