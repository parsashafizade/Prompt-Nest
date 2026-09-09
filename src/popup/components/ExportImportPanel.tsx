import { Download, Upload, X } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { validateExportData } from "../../shared/db";
import type { AppSettings, DatabaseSnapshot, ExportData, TextDirection, Translator } from "../../shared/types";
import { nowIso } from "../../shared/utils";
import {
  SelectionTree,
  createAllSelection,
  filterExportData,
  hasSelectedItems,
  type SelectionState,
} from "./SelectionTree";
import { trapModalFocus } from "./modalKeyboard";

interface ExportImportPanelProps {
  snapshot: DatabaseSnapshot;
  settings: AppSettings;
  fallbackDirection: TextDirection;
  t: Translator;
  onImport: (data: ExportData, mode: "replace" | "merge") => Promise<void>;
  onNotice: (message: string) => void;
}

function exportDataFromSnapshot(snapshot: DatabaseSnapshot, settings: AppSettings): ExportData {
  return {
    schemaVersion: 1,
    exportedAt: nowIso(),
    folders: snapshot.folders,
    prompts: snapshot.prompts,
    settings: { language: settings.language, theme: settings.theme },
  };
}

function downloadCompactJson(data: ExportData) {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `prompt-nest-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportImportPanel({
  snapshot,
  settings,
  fallbackDirection,
  t,
  onImport,
  onNotice,
}: ExportImportPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportSelection, setExportSelection] = useState<SelectionState | null>(null);
  const [pending, setPending] = useState<ExportData | null>(null);
  const [importSelection, setImportSelection] = useState<SelectionState | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const fullExport = useMemo(
    () => exportDataFromSnapshot(snapshot, settings),
    [settings.language, settings.theme, snapshot],
  );

  const openExport = () => {
    setExportSelection(createAllSelection(snapshot.folders, snapshot.prompts));
  };

  const exportSelected = () => {
    if (!exportSelection || !hasSelectedItems(exportSelection)) return;
    downloadCompactJson(filterExportData({ ...fullExport, exportedAt: nowIso() }, exportSelection));
    setExportSelection(null);
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!validateExportData(parsed)) throw new Error("Invalid schema");
      setError("");
      setPending(parsed);
      setImportSelection(createAllSelection(parsed.folders, parsed.prompts));
    } catch {
      setPending(null);
      setImportSelection(null);
      setError(t("invalidImport"));
    }
  };

  const apply = async (mode: "replace" | "merge") => {
    if (!pending || !importSelection || !hasSelectedItems(importSelection)) return;
    setApplying(true);
    try {
      await onImport(filterExportData(pending, importSelection), mode);
      setPending(null);
      setImportSelection(null);
      onNotice(t("imported"));
    } catch {
      setError(t("invalidImport"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <div className="settings-stack">
        <button className="primary-button btn-primary" onClick={openExport} type="button">
          <Download aria-hidden="true" size={16} /> {t("export")}
        </button>
        <button className="primary-button btn-primary" onClick={() => fileRef.current?.click()} type="button">
          <Upload aria-hidden="true" size={16} /> {t("import")}
        </button>
        <input
          accept=".json,application/json"
          className="sr-only"
          onChange={selectFile}
          ref={fileRef}
          type="file"
        />
        {error && <div aria-live="polite" className="form-error">{error}</div>}
      </div>

      {exportSelection && (
        <div className="dialog-backdrop" role="presentation">
          <section
            aria-labelledby="export-selection-title"
            aria-modal="true"
            className="dialog-panel selection-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setExportSelection(null);
              } else trapModalFocus(event);
            }}
            role="dialog"
          >
            <header className="dialog-header">
              <h2 id="export-selection-title">{t("selectExportItems")}</h2>
              <button autoFocus aria-label={t("close")} className="icon-button compact" onClick={() => setExportSelection(null)} type="button">
                <X aria-hidden="true" size={20} />
              </button>
            </header>
            <SelectionTree
              fallbackDirection={fallbackDirection}
              folders={snapshot.folders}
              onChange={setExportSelection}
              prompts={snapshot.prompts}
              selection={exportSelection}
              t={t}
            />
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setExportSelection(null)} type="button">{t("cancel")}</button>
              <button className="primary-button btn-primary" disabled={!hasSelectedItems(exportSelection)} onClick={exportSelected} type="button">
                <Download aria-hidden="true" size={16} /> {t("export")}
              </button>
            </div>
          </section>
        </div>
      )}

      {pending && importSelection && (
        <div className="dialog-backdrop" role="presentation">
          <section
            aria-labelledby="import-choice-title"
            aria-modal="true"
            className="dialog-panel selection-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setPending(null);
                setImportSelection(null);
              } else trapModalFocus(event);
            }}
            role="dialog"
          >
            <header className="dialog-header">
              <h2 id="import-choice-title">{t("selectImportItems")}</h2>
              <button aria-label={t("close")} className="icon-button compact" onClick={() => { setPending(null); setImportSelection(null); }} type="button">
                <X aria-hidden="true" size={20} />
              </button>
            </header>
            <SelectionTree
              fallbackDirection={fallbackDirection}
              folders={pending.folders}
              onChange={setImportSelection}
              prompts={pending.prompts}
              selection={importSelection}
              t={t}
            />
            <h3 className="import-mode-heading">{t("importChoice")}</h3>
            <div className="import-choice-grid">
              <div>
                <button className="danger-button danger-button-filled" disabled={applying || !hasSelectedItems(importSelection)} onClick={() => apply("replace")} type="button">
                  {t("replaceAll")}
                </button>
                <div className="import-warning">{t("replaceWarning")}</div>
              </div>
              <div>
                <button autoFocus className="primary-button btn-primary" disabled={applying || !hasSelectedItems(importSelection)} onClick={() => apply("merge")} type="button">
                  {t("merge")}
                </button>
                <div className="import-hint">{t("mergeHint")}</div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
