import { ArrowLeft, FilePlus2, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ContextBlock, TextDirection, Translator } from "../../shared/types";
import { sortedByOrder } from "../../shared/utils";
import { BidiText } from "./BidiText";
import { BidiEditor } from "./EditBeforeUseModal";
import { MarkdownPromptEditor } from "./MarkdownPromptEditor";
import { ReadonlyMarkdown } from "./ReadonlyMarkdown";
import { trapModalFocus } from "./modalKeyboard";

interface ContextBlocksPanelProps {
  contextBlocks: ContextBlock[];
  editId?: string;
  fallbackDirection: TextDirection;
  t: Translator;
  onBack: () => void;
  onDelete: (block: ContextBlock) => void;
  onSave: (block: ContextBlock | null, title: string, content: string) => Promise<void>;
}

export function ContextBlocksPanel({ contextBlocks, editId, fallbackDirection, t, onBack, onDelete, onSave }: ContextBlocksPanelProps) {
  const orderedContextBlocks = useMemo(() => sortedByOrder(contextBlocks), [contextBlocks]);
  const [editing, setEditing] = useState<ContextBlock | null | "new">(() => contextBlocks.find(({ id }) => id === editId) ?? null);
  const current = editing === "new" ? null : editing;
  const [title, setTitle] = useState(current?.title ?? "");
  const [content, setContent] = useState(current?.content ?? "");
  const [saving, setSaving] = useState(false);
  const openEditor = (block: ContextBlock | null) => {
    setEditing(block ?? "new");
    setTitle(block?.title ?? "");
    setContent(block?.content ?? "");
  };
  return (
    <div className="scroll-area context-blocks-screen">
      <header className="view-header">
        <button aria-label={t("back")} className="icon-button compact" onClick={onBack} type="button"><ArrowLeft aria-hidden="true" className="back-icon" size={20} /></button>
        <h1>{t("contextBlocks")}</h1>
        <button aria-label={t("newContextBlock")} className="icon-button compact" onClick={() => openEditor(null)} type="button"><FilePlus2 aria-hidden="true" size={20} /></button>
      </header>
      {contextBlocks.length === 0 ? <div className="empty-state"><span>{t("noContextBlocks")}</span></div> : (
        <ul className="item-list">
          {orderedContextBlocks.map((block) => (
            <li className="item-card" key={block.id}>
              <button className="item-main" onClick={() => openEditor(block)} type="button">
                <BidiText className="item-title" fallbackDirection={fallbackDirection} text={block.title} />
                <ReadonlyMarkdown className="item-preview" compact value={block.content} />
              </button>
              <div className="context-row-actions">
                <button aria-label={t("editContextBlock")} className="icon-button compact" onClick={() => openEditor(block)} type="button"><Pencil aria-hidden="true" size={16} /></button>
                <button aria-label={t("delete")} className="icon-button compact danger-icon" onClick={() => onDelete(block)} type="button"><Trash2 aria-hidden="true" size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <div className="dialog-backdrop" role="presentation">
          <section aria-labelledby="context-editor-title" aria-modal="true" className="dialog-panel" onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setEditing(null);
            } else trapModalFocus(event);
          }} role="dialog">
            <header className="dialog-header">
              <h2 id="context-editor-title">{current ? t("editContextBlock") : t("newContextBlock")}</h2>
              <button aria-label={t("close")} className="icon-button compact" onClick={() => setEditing(null)} type="button"><X aria-hidden="true" size={20} /></button>
            </header>
            <label className="field-label">{t("title")}</label>
            <BidiEditor ariaLabel={t("title")} autoFocus fallbackDirection={fallbackDirection} onChange={setTitle} rows={1} value={title} />
            <div className="field-label">{t("content")}</div>
            <MarkdownPromptEditor ariaLabel={t("content")} minHeight={180} onChange={setContent} value={content} />
            <div className="dialog-actions">
              <button className="secondary-button" disabled={saving} onClick={() => setEditing(null)} type="button">{t("cancel")}</button>
              <button className="primary-button btn-primary" disabled={saving || !title.trim() || !content.trim()} onClick={async () => {
                setSaving(true);
                try {
                  await onSave(current, title.trim(), content);
                  setEditing(null);
                } finally { setSaving(false); }
              }} type="button">{t("save")}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
