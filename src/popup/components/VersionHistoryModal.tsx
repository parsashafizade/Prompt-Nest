import { RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getPromptVersions } from "../../shared/db";
import type { Language, PromptVersion, Translator } from "../../shared/types";
import { ReadonlyMarkdown } from "./ReadonlyMarkdown";
import { AttachmentImage } from "./AttachmentImage";
import { trapModalFocus } from "./modalKeyboard";

interface VersionHistoryModalProps {
  promptId: string;
  language: Language;
  t: Translator;
  onClose: () => void;
  onRestore: (version: PromptVersion) => Promise<void>;
}

export function VersionHistoryModal({ promptId, language, t, onClose, onRestore }: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<PromptVersion[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    let active = true;
    void getPromptVersions(promptId).then((items) => {
      if (!active) return;
      setVersions(items);
      setSelectedId(items[0]?.id ?? null);
    }).catch(() => {
      if (!active) return;
      setLoadFailed(true);
      setVersions([]);
    });
    return () => { active = false; };
  }, [promptId]);
  const selected = useMemo(() => versions?.find(({ id }) => id === selectedId), [selectedId, versions]);
  const locale = language === "fa" ? "fa-IR" : "en";
  return (
    <div className="dialog-backdrop dialog-backdrop-top" role="presentation">
      <section aria-labelledby="history-title" aria-modal="true" className="dialog-panel history-panel" onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        } else trapModalFocus(event);
      }} role="dialog">
        <header className="dialog-header">
          <h2 id="history-title">{t("versionHistory")}</h2>
          <button aria-label={t("close")} className="icon-button compact" onClick={onClose} type="button"><X aria-hidden="true" size={20} /></button>
        </header>
        {versions === null ? <div className="screen-spinner"><div className="spinner" /></div>
          : loadFailed ? <div className="compact-empty-state" role="alert">{t("historyLoadFailed")}</div>
          : versions.length === 0 ? <div className="compact-empty-state">{t("noVersions")}</div>
            : (
              <div className="history-layout">
                <div className="history-list" role="listbox" aria-label={t("versionHistory")}>
                  {versions.map((version) => (
                    <button aria-selected={selectedId === version.id} className="history-row" key={version.id} onClick={() => setSelectedId(version.id)} role="option" type="button">
                      <span>{version.kind === "content" ? t("promptContentVersion") : t("noteVersion")}</span>
                      <time dateTime={version.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.createdAt))}</time>
                    </button>
                  ))}
                </div>
                {selected && (
                  <div className="history-preview">
                    <ReadonlyMarkdown value={selected.kind === "content" ? selected.content : selected.note} />
                    {selected.kind === "note" && selected.noteAttachments.map((attachment) => attachment.kind === "image" ? (
                      <figure className="note-attachment" key={attachment.id}>
                        <AttachmentImage alt={attachment.name} blobId={attachment.blobId} />
                        {attachment.caption && <figcaption>{attachment.caption}</figcaption>}
                      </figure>
                    ) : <div className="reference-attachment" key={attachment.id}><strong>{attachment.header}</strong><span>{attachment.location}</span></div>)}
                  </div>
                )}
              </div>
            )}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">{t("close")}</button>
          <button className="primary-button btn-primary" disabled={!selected || restoring} onClick={async () => {
            if (!selected) return;
            setRestoring(true);
            try {
              await onRestore(selected);
              onClose();
            } finally { setRestoring(false); }
          }} type="button"><RotateCcw aria-hidden="true" size={18} /> {t("restoreVersion")}</button>
        </div>
      </section>
    </div>
  );
}
