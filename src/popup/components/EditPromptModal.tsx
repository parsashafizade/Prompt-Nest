import { ImagePlus, Paperclip, Save, Trash2, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import type { ContextBlock, ImageNoteAttachment, NoteAttachment, Prompt, ReferenceNoteAttachment, Translator } from "../../shared/types";
import { createId, nowIso } from "../../shared/utils";
import { AttachmentImage } from "./AttachmentImage";
import { BidiText } from "./BidiText";
import { MarkdownPromptEditor } from "./MarkdownPromptEditor";
import { trapModalFocus } from "./modalKeyboard";

interface EditPromptModalProps {
  prompt: Prompt;
  contextBlocks: ContextBlock[];
  t: Translator;
  onClose: () => void;
  onSave: (patch: Pick<Prompt, "content" | "tags" | "contextBlockIds" | "note" | "noteAttachments">) => Promise<void>;
  onOpenContextBlock: (id: string) => void;
  onStoreImage: (file: File) => Promise<ImageNoteAttachment>;
  onNotice: (message: string) => void;
}

export function EditPromptModal({
  prompt,
  contextBlocks,
  t,
  onClose,
  onSave,
  onOpenContextBlock,
  onStoreImage,
  onNotice,
}: EditPromptModalProps) {
  const [content, setContent] = useState(prompt.content);
  const [tags, setTags] = useState(prompt.tags.join(", "));
  const [contextBlockIds, setContextBlockIds] = useState(prompt.contextBlockIds);
  const [note, setNote] = useState(prompt.note);
  const [attachments, setAttachments] = useState<NoteAttachment[]>(prompt.noteAttachments);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        content,
        tags: [...new Set(tags.split(/[,،]/u).map((tag) => tag.trim()).filter(Boolean))],
        contextBlockIds,
        note,
        noteAttachments: attachments,
      });
      onClose();
    } catch {
      onNotice(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const acceptImage = (file?: File) => {
    if (file?.type.startsWith("image/")) setPendingFile(file);
  };
  const dropImage = (event: DragEvent) => {
    event.preventDefault();
    acceptImage(event.dataTransfer.files[0]);
  };
  const updateAttachment = (id: string, patch: { caption?: string; header?: string; location?: string }) => {
    setAttachments((items) => items.map((attachment) => attachment.id === id ? { ...attachment, ...patch } as NoteAttachment : attachment));
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-labelledby="edit-prompt-title" aria-modal="true" className="dialog-panel" onKeyDown={trapModalFocus} role="dialog">
        <header className="dialog-header">
          <h2 id="edit-prompt-title">{t("editPrompt")}</h2>
          <button aria-label={t("close")} className="icon-button compact" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <MarkdownPromptEditor
          ariaLabel={t("content")}
          autoFocus
          onChange={setContent}
          value={content}
        />
        <label className="field-label" htmlFor="prompt-tags">{t("tags")}</label>
        <input className="text-input" id="prompt-tags" onChange={(event) => setTags(event.target.value)} placeholder={t("tagsHint")} value={tags} />

        <div className="field-label">{t("contextBlocks")}</div>
        {contextBlocks.length ? (
          <div className="context-selector">
            {contextBlocks.map((block) => (
              <span className="context-option" key={block.id}>
                <label className="check-chip">
                  <input checked={contextBlockIds.includes(block.id)} onChange={() => setContextBlockIds((ids) => ids.includes(block.id) ? ids.filter((id) => id !== block.id) : [...ids, block.id])} type="checkbox" />
                  <BidiText fallbackDirection="ltr" text={block.title} />
                </label>
                {contextBlockIds.includes(block.id) && <button aria-label={t("editContextBlock")} className="context-edit-link" onClick={() => onOpenContextBlock(block.id)} type="button">{t("edit")}</button>}
              </span>
            ))}
          </div>
        ) : <p className="field-hint">{t("noContextBlocks")}</p>}

        <label className="field-label" htmlFor="prompt-note">{t("personalNote")}</label>
        <textarea className="note-editor" id="prompt-note" onChange={(event) => setNote(event.target.value)} rows={4} value={note} />
        <div className="attachment-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={dropImage}>
          <Paperclip aria-hidden="true" size={18} />
          <span>{t("dropAttachment")}</span>
          <button className="small-button" onClick={() => fileRef.current?.click()} type="button"><ImagePlus aria-hidden="true" size={16} /> {t("uploadImage")}</button>
          <input accept="image/*" className="sr-only" onChange={(event) => { acceptImage(event.target.files?.[0]); event.target.value = ""; }} ref={fileRef} type="file" />
        </div>
        {attachments.length > 0 && (
          <div className="attachment-list">
            {attachments.map((attachment) => (
              <article className="attachment-card" key={attachment.id}>
                {attachment.kind === "image" ? (
                  <>
                    <AttachmentImage alt={attachment.name} blobId={attachment.blobId} />
                    <label className="field-label">{t("caption")}</label>
                    <textarea className="note-editor compact-note-editor" onChange={(event) => updateAttachment(attachment.id, { caption: event.target.value })} value={attachment.caption} />
                  </>
                ) : (
                  <>
                    <div className="attachment-warning">{t("referenceNotPortable")}</div>
                    <label className="field-label">{t("referenceHeader")}</label>
                    <textarea className="note-editor compact-note-editor" onChange={(event) => updateAttachment(attachment.id, { header: event.target.value })} value={attachment.header} />
                    <label className="field-label">{t("fileLocationReminder")}</label>
                    <textarea className="note-editor compact-note-editor" onChange={(event) => updateAttachment(attachment.id, { location: event.target.value })} value={attachment.location} />
                  </>
                )}
                <button aria-label={t("removeAttachment")} className="icon-button compact danger-icon attachment-remove" onClick={() => setAttachments((items) => items.filter(({ id }) => id !== attachment.id))} type="button"><Trash2 aria-hidden="true" size={16} /></button>
              </article>
            ))}
          </div>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" disabled={saving} onClick={onClose} type="button">{t("cancel")}</button>
          <button className="primary-button btn-primary" disabled={saving} onClick={save} type="button">
            <Save aria-hidden="true" size={18} />
            {t("save")}
          </button>
        </div>
      </section>
      {pendingFile && (
        <div className="dialog-backdrop dialog-backdrop-top" role="presentation">
          <section aria-labelledby="attachment-mode-title" aria-modal="true" className="dialog-panel attachment-mode-panel" onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setPendingFile(null);
            } else trapModalFocus(event);
          }} role="dialog">
            <header className="dialog-header"><h2 id="attachment-mode-title">{t("attachmentMode")}</h2></header>
            <p className="dialog-description">{t("attachmentModeHint")}</p>
            <div className="attachment-mode-actions">
              <button className="primary-button btn-primary" onClick={async () => {
                try {
                  const attachment = await onStoreImage(pendingFile);
                  setAttachments((items) => [...items, attachment]);
                  setPendingFile(null);
                } catch { onNotice(t("saveFailed")); }
              }} type="button">{t("showImage")}</button>
              <button className="secondary-button" onClick={() => {
                const attachment: ReferenceNoteAttachment = {
                  id: createId(),
                  kind: "reference",
                  header: t("defaultReferenceHeader"),
                  location: "",
                  createdAt: nowIso(),
                };
                setAttachments((items) => [...items, attachment]);
                setPendingFile(null);
              }} type="button">{t("referenceOnly")}</button>
              <button className="secondary-button" onClick={() => setPendingFile(null)} type="button">{t("cancel")}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
