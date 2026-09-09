import { Check, Copy, FilePenLine, Pencil, X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import type { Language, Prompt, TextDirection, Translator } from "../../shared/types";
import { BidiText } from "./BidiText";
import { EditBeforeUseModal } from "./EditBeforeUseModal";
import { EditPromptModal } from "./EditPromptModal";
import { ReadonlyMarkdown } from "./ReadonlyMarkdown";
import { ShareCardTrigger } from "./ShareCardTrigger";
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
  onSaveContent: (content: string) => Promise<void>;
  onNotice: (message: string) => void;
}

export function PromptDetailActions({
  prompt,
  language,
  fallbackDirection,
  t,
  onClose,
  onSaveContent,
  onNotice,
}: PromptDetailActionsProps) {
  const [editing, setEditing] = useState(false);
  const [editingToSave, setEditingToSave] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareFallback, setShareFallback] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1400);
    } catch {
      onNotice(t("copyFailed"));
    }
  };

  if (editing) {
    return (
      <EditBeforeUseModal
        fallbackDirection={fallbackDirection}
        onClose={() => setEditing(false)}
        onNotice={onNotice}
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
        onSave={onSaveContent}
        prompt={prompt}
        t={t}
      />
    );
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-labelledby="prompt-detail-title" aria-modal="true" className="dialog-panel" onKeyDown={trapModalFocus} role="dialog">
        <header className="dialog-header">
          <h2 id="prompt-detail-title">
            <BidiText fallbackDirection={fallbackDirection} text={prompt.title} />
          </h2>
          <ShareCardTrigger language={language} onFallback={() => setShareFallback(true)} prompt={prompt} t={t} />
          <button aria-label={t("editPrompt")} className="icon-button compact" onClick={() => setEditingToSave(true)} type="button">
            <FilePenLine aria-hidden="true" size={20} />
          </button>
          <button aria-label={t("close")} className="icon-button compact" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="prompt-view">
          <ReadonlyMarkdown value={prompt.content} />
        </div>
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
            onClose={() => setShareFallback(false)}
            onNotice={onNotice}
            prompt={prompt}
            t={t}
          />
        </Suspense>
      )}
    </div>
  );
}
