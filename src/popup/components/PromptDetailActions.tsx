import { Check, Clock3, Copy, FilePenLine, Pencil, Star, X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import type { ShareCardImage } from "../../shared/shareCard";
import type { ContextBlock, ImageNoteAttachment, Prompt, PromptVersion, TextDirection, Translator, Language } from "../../shared/types";
import { AttachmentImage } from "./AttachmentImage";
import { BidiText } from "./BidiText";
import { EditBeforeUseModal } from "./EditBeforeUseModal";
import { EditPromptModal } from "./EditPromptModal";
import { ReadonlyMarkdown } from "./ReadonlyMarkdown";
import { ShareCardTrigger } from "./ShareCardTrigger";
import { VersionHistoryModal } from "./VersionHistoryModal";
import { trapModalFocus } from "./modalKeyboard";

const ShareFallbackModal = lazy(() => import("./ShareFallbackModal").then((module) => ({
  default: module.ShareFallbackModal,
})));

interface PromptDetailActionsProps {
  prompt: Prompt;
  language: Language;
  fallbackDirection: TextDirection;
  t: Translator;
  onClose: () => void;
  contextBlocks: ContextBlock[];
  onCopyContent: (content?: string) => Promise<boolean>;
  onFavorite: () => void;
  onOpenContextBlock: (id: string) => void;
  onRestoreVersion: (version: PromptVersion) => Promise<void>;
  onSavePrompt: (patch: Pick<Prompt, "content" | "tags" | "contextBlockIds" | "note" | "noteAttachments">) => Promise<void>;
  onSaveContent: (content: string) => Promise<void>;
  onStoreImage: (file: File) => Promise<ImageNoteAttachment>;
  onNotice: (message: string) => void;
}

export function PromptDetailActions({
  prompt,
  language,
  fallbackDirection,
  t,
  onClose,
  contextBlocks,
  onCopyContent,
  onFavorite,
  onOpenContextBlock,
  onRestoreVersion,
  onSavePrompt,
  onSaveContent,
  onStoreImage,
  onNotice,
}: PromptDetailActionsProps) {
  const [editing, setEditing] = useState(false);
  const [editingToSave, setEditingToSave] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareFallback, setShareFallback] = useState(false);
  const [shareContent, setShareContent] = useState(prompt.content);
  const [shareImages, setShareImages] = useState<ShareCardImage[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const copy = async () => {
    try {
      const success = await onCopyContent();
      if (!success) return;
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1400);
    } catch {
      onNotice(t("copyFailed"));
    }
  };

  if (editing) {
    return (
      <EditBeforeUseModal
        onClose={() => setEditing(false)}
        onNotice={onNotice}
        onCopyContent={onCopyContent}
        onSaveContent={onSaveContent}
        prompt={prompt}
        t={t}
      />
    );
  }

  if (editingToSave) {
    return (
      <EditPromptModal
        onClose={() => setEditingToSave(false)}
        onNotice={onNotice}
        contextBlocks={contextBlocks}
        onSave={onSavePrompt}
        onOpenContextBlock={onOpenContextBlock}
        onStoreImage={onStoreImage}
        prompt={prompt}
        t={t}
      />
    );
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-labelledby="prompt-detail-title" aria-modal="true" className="dialog-panel" onKeyDown={trapModalFocus} role="dialog">
        <header className="dialog-header prompt-detail-header">
          <h2 id="prompt-detail-title">
            <BidiText fallbackDirection={fallbackDirection} text={prompt.title} />
          </h2>
          <div className="prompt-detail-toolbar">
            <ShareCardTrigger language={language} onFallback={(content, images) => { setShareContent(content); setShareImages(images); setShareFallback(true); }} prompt={prompt} t={t} />
            <button aria-label={t("versionHistory")} className="icon-button compact" onClick={() => setHistoryOpen(true)} title={t("versionHistory")} type="button">
              <Clock3 aria-hidden="true" size={20} />
            </button>
            <button aria-label={prompt.favorite ? t("removeFavorite") : t("addFavorite")} aria-pressed={prompt.favorite} className={`icon-button compact ${prompt.favorite ? "favorite-active" : ""}`} onClick={onFavorite} title={prompt.favorite ? t("removeFavorite") : t("addFavorite")} type="button">
              <Star aria-hidden="true" fill={prompt.favorite ? "currentColor" : "none"} size={20} />
            </button>
            <button aria-label={t("editPrompt")} className="icon-button compact" onClick={() => setEditingToSave(true)} title={t("editPrompt")} type="button">
              <FilePenLine aria-hidden="true" size={20} />
            </button>
            <button aria-label={t("close")} className="icon-button compact" onClick={onClose} type="button">
              <X aria-hidden="true" size={20} />
            </button>
          </div>
        </header>
        <div className="prompt-view">
          <ReadonlyMarkdown value={prompt.content} />
        </div>
        {prompt.contextBlockIds.length > 0 && (
          <div className="reference-chips" aria-label={t("contextBlocks")}>
            {prompt.contextBlockIds.map((id) => {
              const block = contextBlocks.find((item) => item.id === id);
              return block ? <button className="reference-chip" key={id} onClick={() => onOpenContextBlock(id)} type="button"><BidiText fallbackDirection={fallbackDirection} text={block.title} /></button> : null;
            })}
          </div>
        )}
        {prompt.tags.length > 0 && <div className="tag-list">{prompt.tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</div>}
        {(prompt.note || prompt.noteAttachments.length > 0) && (
          <section className="prompt-note-view">
            <h3>{t("personalNote")}</h3>
            {prompt.note && <ReadonlyMarkdown value={prompt.note} />}
            {prompt.noteAttachments.map((attachment) => attachment.kind === "image" ? (
              <figure className="note-attachment" key={attachment.id}>
                <AttachmentImage alt={attachment.name} blobId={attachment.blobId} />
                {attachment.caption && <figcaption>{attachment.caption}</figcaption>}
              </figure>
            ) : (
              <div className="reference-attachment" key={attachment.id}><strong>{attachment.header}</strong><span>{attachment.location}</span><small>{t("referenceNotPortable")}</small></div>
            ))}
          </section>
        )}
        <div className="action-grid">
          <button autoFocus className={`primary-button btn-primary ${copied ? "copy-success" : ""}`} onClick={copy} type="button">
            {copied
              ? <Check aria-hidden="true" className="check-pop" size={18} />
              : <Copy aria-hidden="true" size={18} />}
            {copied ? t("copied") : t("use")}
          </button>
          <button className="secondary-button" onClick={() => setEditing(true)} type="button">
            <Pencil aria-hidden="true" size={17} />
            {t("editBeforeUse")}
          </button>
        </div>
      </section>
      {shareFallback && (
        <Suspense fallback={null}>
          <ShareFallbackModal
            language={language}
            images={shareImages}
            onClose={() => setShareFallback(false)}
            onNotice={onNotice}
            prompt={{ ...prompt, content: shareContent }}
            t={t}
          />
        </Suspense>
      )}
      {historyOpen && <VersionHistoryModal language={language} onClose={() => setHistoryOpen(false)} onRestore={onRestoreVersion} promptId={prompt.id} t={t} />}
    </div>
  );
}
