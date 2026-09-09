import { Save, X } from "lucide-react";
import { useState } from "react";
import type { Prompt, Translator } from "../../shared/types";
import { MarkdownPromptEditor } from "./MarkdownPromptEditor";
import { trapModalFocus } from "./modalKeyboard";

interface EditPromptModalProps {
  prompt: Prompt;
  t: Translator;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
  onNotice: (message: string) => void;
}

export function EditPromptModal({
  prompt,
  t,
  onClose,
  onSave,
  onNotice,
}: EditPromptModalProps) {
  const [content, setContent] = useState(prompt.content);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(content);
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
