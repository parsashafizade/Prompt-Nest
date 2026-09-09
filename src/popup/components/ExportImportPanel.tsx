import { Download, Upload, X } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortableExport, normalizeExportData, validateExportData } from "../../shared/db";
import type { AppSettings, DatabaseSnapshot, ExportDataV2, TextDirection, Translator } from "../../shared/types";
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
  onImport: (data: ExportDataV2) => Promise<void>;
  onNotice: (message: string) => void;
}

function downloadCompactJson(data: ExportDataV2) {
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
  const [pending, setPending] = useState<ExportDataV2 | null>(null);
  const [importSelection, setImportSelection] = useState<SelectionState | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const exportSettings = useMemo(() => ({ language: settings.language, theme: settings.theme }), [settings.language, settings.theme]);

  const openExport = () => {
    setError("");
    setExportSelection(createAllSelection(snapshot.folders, snapshot.prompts));
  };

  const exportSelected = async () => {
    if (!exportSelection || !hasSelectedItems(exportSelection)) return;
    setApplying(true);
    try {
      const selected = filterExportData({
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        folders: snapshot.folders,
        prompts: snapshot.prompts,
        contextBlocks: [],
        promptVersions: [],
        attachmentImages: [],
        settings: exportSettings,
      }, exportSelection);
      if (selected.schemaVersion !== 2) return;
      downloadCompactJson(await createPortableExport(
        selected.folders,
        selected.prompts,
        snapshot.contextBlocks,
        exportSettings,
        settings.includeNotesInExport,
      ));
      setExportSelection(null);
    } catch {
      setError(t("exportFailed"));
    } finally { setApplying(false); }
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!validateExportData(parsed)) throw new Error("Invalid schema");
      setError("");
      const normalized = normalizeExportData(parsed);
      setPending(normalized);
      setImportSelection(createAllSelection(normalized.folders, normalized.prompts));
    } catch {
      setPending(null);
      setImportSelection(null);
      setError(t("invalidImport"));
    }
  };

  const apply = async () => {
    if (!pending || !importSelection || importSelection.promptIds.size === 0) return;
    setApplying(true);
    try {
      const selected = filterExportData(pending, importSelection);
      if (selected.schemaVersion !== 2) throw new Error("Unexpected import schema");
      const selectedPromptIds = new Set(selected.prompts.map(({ id }) => id));
      const selectedContextIds = new Set(selected.prompts.flatMap(({ contextBlockIds }) => contextBlockIds));
      const promptVersions = pending.promptVersions.filter(({ promptId }) => selectedPromptIds.has(promptId));
      const attachmentIds = new Set([
        ...selected.prompts.flatMap(({ noteAttachments }) => noteAttachments),
        ...promptVersions.flatMap((version) => version.kind === "note" ? version.noteAttachments : []),
      ].flatMap((attachment) => attachment.kind === "image" ? [attachment.blobId] : []));
      await onImport({
        ...selected,
        contextBlocks: pending.contextBlocks.filter(({ id }) => selectedContextIds.has(id)),
        promptVersions,
        attachmentImages: pending.attachmentImages.filter(({ id }) => attachmentIds.has(id)),
      });
      setPending(null);
      setImportSelection(null);
      onNotice(t("imported"));
    } catch {
      setError(t("importFailed"));
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
        {error && !exportSelection && !pending && <div aria-live="polite" className="form-error">{error}</div>}
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
            {error && <div aria-live="polite" className="form-error">{error}</div>}
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setExportSelection(null)} type="button">{t("cancel")}</button>
              <button className="primary-button btn-primary" disabled={applying || !hasSelectedItems(exportSelection)} onClick={() => { void exportSelected(); }} type="button">
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
            {error && <div aria-live="polite" className="form-error">{error}</div>}
            <div className="import-choice-grid">
              <div className="import-hint">{t("sharedImportHint")}</div>
              <button autoFocus className="primary-button btn-primary" disabled={applying || importSelection.promptIds.size === 0} onClick={() => { void apply(); }} type="button">
                {t("import")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
