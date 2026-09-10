import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { detectLineDirection } from "../../shared/bidi";
import type { ContextBlock, Folder, ImageNoteAttachment, NoteAttachment, Prompt, TextDirection, Translator } from "../../shared/types";
import { BidiEditor } from "./EditBeforeUseModal";
import { MarkdownPromptEditor } from "./MarkdownPromptEditor";
import { trapModalFocus } from "./modalKeyboard";
import { PromptMetadataFields } from "./PromptMetadataFields";

export type NewPromptMetadata = Pick<Prompt, "favorite" | "tags" | "contextBlockIds" | "note" | "noteAttachments">;

interface ItemFormModalProps {
  kind: "folder" | "prompt";
  mode: "add" | "rename";
  initialName?: string;
  initialContent?: string;
  fallbackDirection: TextDirection;
  destinationFolders?: Folder[];
  contextBlocks?: ContextBlock[];
  initialFolderId?: string;
  t: Translator;
  onClose: () => void;
  onNotice: (message: string) => void;
  onStoreImage: (file: File) => Promise<ImageNoteAttachment>;
  onSubmit: (name: string, content: string, folderId?: string, metadata?: NewPromptMetadata) => Promise<void>;
}

function folderPath(folder: Folder, folders: Folder[]) {
  const names = [folder.name];
  const visited = new Set([folder.id]);
  let parentId = folder.parentId;
  while (parentId) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = folders.find(({ id }) => id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

export function ItemFormModal({
  kind,
  mode,
  initialName = "",
  initialContent = "",
  fallbackDirection,
  destinationFolders = [],
  contextBlocks = [],
  initialFolderId,
  t,
  onClose,
  onNotice,
  onStoreImage,
  onSubmit,
}: ItemFormModalProps) {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState(initialContent);
  const [folderId, setFolderId] = useState(initialFolderId ?? destinationFolders[0]?.id ?? "");
  const [tags, setTags] = useState("");
  const [contextBlockIds, setContextBlockIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [favorite, setFavorite] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (kind === "folder") inputRef.current?.focus();
  }, [kind]);

  const submit = async () => {
    const normalizedName = kind === "prompt" ? name.replace(/\r?\n+/g, " ").trim() : name.trim();
    if (!normalizedName || (kind === "prompt" && mode === "add" && !content.trim())) {
      setError(t("required"));
      return;
    }
    setSaving(true);
    try {
      await onSubmit(
        normalizedName,
        content,
        folderId || undefined,
        kind === "prompt" && mode === "add" ? {
          favorite,
          tags: [...new Set(tags.split(/[,،]/u).map((tag) => tag.trim()).filter(Boolean))],
          contextBlockIds,
          note,
          noteAttachments: attachments,
        } : undefined,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const heading = mode === "rename"
    ? t("rename")
    : kind === "folder" ? t("newFolder") : t("newPrompt");
  const inputDirection = detectLineDirection(name, fallbackDirection);

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-labelledby="item-form-title" aria-modal="true" className="dialog-panel" onKeyDown={trapModalFocus} role="dialog">
        <header className="dialog-header">
          <h2 id="item-form-title">{heading}</h2>
          <button aria-label={t("close")} className="icon-button compact" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <label className="field-label" htmlFor="item-name">
          {kind === "folder" ? t("folderName") : t("title")}
        </label>
        {kind === "prompt" ? (
          <BidiEditor
            ariaLabel={t("title")}
            autoFocus
            fallbackDirection={fallbackDirection}
            id="item-name"
            onChange={(value) => { setName(value); setError(""); }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (mode === "rename") void submit();
            }}
            rows={1}
            value={name}
          />
        ) : (
          <input
            className="text-input"
            dir={inputDirection}
            id="item-name"
            onChange={(event) => { setName(event.target.value); setError(""); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) void submit();
            }}
            ref={inputRef}
            style={{ textAlign: inputDirection === "rtl" ? "right" : "left" }}
            value={name}
          />
        )}
        {kind === "prompt" && mode === "add" && (
          <>
            {destinationFolders.length > 0 && (
              <>
                <label className="field-label" htmlFor="prompt-destination">{t("destinationFolder")}</label>
                <select className="select-input" id="prompt-destination" onChange={(event) => setFolderId(event.target.value)} value={folderId}>
                  {destinationFolders.map((folder) => <option key={folder.id} value={folder.id}>{folderPath(folder, destinationFolders)}</option>)}
                </select>
              </>
            )}
            <div className="field-label">{t("content")}</div>
            <MarkdownPromptEditor
              ariaLabel={t("content")}
              minHeight={145}
              onChange={(value) => { setContent(value); setError(""); }}
              value={content}
            />
            <PromptMetadataFields
              attachments={attachments}
              contextBlockIds={contextBlockIds}
              contextBlocks={contextBlocks}
              favorite={favorite}
              note={note}
              onAttachmentsChange={setAttachments}
              onContextBlockIdsChange={setContextBlockIds}
              onFavoriteChange={setFavorite}
              onNoteChange={setNote}
              onNotice={onNotice}
              onStoreImage={onStoreImage}
              onTagsChange={setTags}
              t={t}
              tags={tags}
            />
          </>
        )}
        {error && <div aria-live="polite" className="form-error">{error}</div>}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">{t("cancel")}</button>
          <button className="primary-button btn-primary" disabled={saving} onClick={submit} type="button">{t("save")}</button>
        </div>
      </section>
    </div>
  );
}
