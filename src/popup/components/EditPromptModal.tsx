import { Save, X } from "lucide-react";
import { useState } from "react";
import type { ContextBlock, ImageNoteAttachment, NoteAttachment, Prompt, Translator } from "../../shared/types";
import { MarkdownPromptEditor } from "./MarkdownPromptEditor";
import { trapModalFocus } from "./modalKeyboard";
import { PromptMetadataFields } from "./PromptMetadataFields";

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
        <PromptMetadataFields
          attachments={attachments}
          contextBlockIds={contextBlockIds}
          contextBlocks={contextBlocks}
          note={note}
          onAttachmentsChange={setAttachments}
          onContextBlockIdsChange={setContextBlockIds}
          onNoteChange={setNote}
          onNotice={onNotice}
          onOpenContextBlock={onOpenContextBlock}
          onStoreImage={onStoreImage}
          onTagsChange={setTags}
          t={t}
          tags={tags}
        />
        <div className="dialog-actions">
          <button className="secondary-button" disabled={saving} onClick={onClose} type="button">{t("cancel")}</button>
          <button className="primary-button btn-primary" disabled={saving} onClick={save} type="button">
            <Save aria-hidden="true" size={18} />
            {t("save")}
          </button>
        </div>
      </section>
    </div>
  );
}
