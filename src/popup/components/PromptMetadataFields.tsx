import { ImagePlus, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import type { ContextBlock, ImageNoteAttachment, NoteAttachment, ReferenceNoteAttachment, Translator } from "../../shared/types";
import { createId, nowIso } from "../../shared/utils";
import { AttachmentImage } from "./AttachmentImage";
import { BidiText } from "./BidiText";
import { trapModalFocus } from "./modalKeyboard";

interface PromptMetadataFieldsProps {
  tags: string;
  contextBlocks: ContextBlock[];
  contextBlockIds: string[];
  note: string;
  attachments: NoteAttachment[];
  favorite?: boolean;
  t: Translator;
  onTagsChange: (value: string) => void;
  onContextBlockIdsChange: (ids: string[]) => void;
  onNoteChange: (value: string) => void;
  onAttachmentsChange: Dispatch<SetStateAction<NoteAttachment[]>>;
  onFavoriteChange?: (favorite: boolean) => void;
  onOpenContextBlock?: (id: string) => void;
  onStoreImage: (file: File) => Promise<ImageNoteAttachment>;
  onNotice: (message: string) => void;
}

export function PromptMetadataFields({
  tags,
  contextBlocks,
  contextBlockIds,
  note,
  attachments,
  favorite,
  t,
  onTagsChange,
  onContextBlockIdsChange,
  onNoteChange,
  onAttachmentsChange,
  onFavoriteChange,
  onOpenContextBlock,
  onStoreImage,
  onNotice,
}: PromptMetadataFieldsProps) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const acceptImage = (file?: File) => {
    if (file?.type.startsWith("image/")) setPendingFile(file);
  };
  const dropImage = (event: DragEvent) => {
    event.preventDefault();
    acceptImage(event.dataTransfer.files[0]);
  };
  const updateAttachment = (id: string, patch: { caption?: string; header?: string; location?: string }) => {
    onAttachmentsChange((items) => items.map((attachment) => (
      attachment.id === id ? { ...attachment, ...patch } as NoteAttachment : attachment
    )));
  };

  return (
    <>
      <label className="field-label" htmlFor="prompt-tags">{t("tags")}</label>
      <input className="text-input" id="prompt-tags" onChange={(event) => onTagsChange(event.target.value)} placeholder={t("tagsHint")} value={tags} />

      {onFavoriteChange && (
        <label className="check-chip prompt-favorite-field">
          <input checked={favorite === true} onChange={(event) => onFavoriteChange(event.target.checked)} type="checkbox" />
          <span>{t("favorites")}</span>
        </label>
      )}

      <div className="field-label">{t("contextBlocks")}</div>
      {contextBlocks.length ? (
        <div className="context-selector">
          {contextBlocks.map((block) => (
            <span className="context-option" key={block.id}>
              <label className="check-chip">
                <input
                  checked={contextBlockIds.includes(block.id)}
                  onChange={() => onContextBlockIdsChange(contextBlockIds.includes(block.id)
                    ? contextBlockIds.filter((id) => id !== block.id)
                    : [...contextBlockIds, block.id])}
                  type="checkbox"
                />
                <BidiText fallbackDirection="ltr" text={block.title} />
              </label>
              {onOpenContextBlock && contextBlockIds.includes(block.id) && (
                <button aria-label={t("editContextBlock")} className="context-edit-link" onClick={() => onOpenContextBlock(block.id)} type="button">{t("edit")}</button>
              )}
            </span>
          ))}
        </div>
      ) : <p className="field-hint">{t("noContextBlocks")}</p>}

      <label className="field-label" htmlFor="prompt-note">{t("personalNote")}</label>
      <textarea className="note-editor" id="prompt-note" onChange={(event) => onNoteChange(event.target.value)} rows={4} value={note} />
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
              <button aria-label={t("removeAttachment")} className="icon-button compact danger-icon attachment-remove" onClick={() => onAttachmentsChange((items) => items.filter(({ id }) => id !== attachment.id))} type="button"><Trash2 aria-hidden="true" size={16} /></button>
            </article>
          ))}
        </div>
      )}

      {pendingFile && createPortal(
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
                  onAttachmentsChange((items) => [...items, attachment]);
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
                onAttachmentsChange((items) => [...items, attachment]);
                setPendingFile(null);
              }} type="button">{t("referenceOnly")}</button>
              <button className="secondary-button" onClick={() => setPendingFile(null)} type="button">{t("cancel")}</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
