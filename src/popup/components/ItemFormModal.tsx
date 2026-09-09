import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { detectLineDirection } from "../../shared/bidi";
import type { TextDirection, Translator } from "../../shared/types";
import { BidiEditor } from "./EditBeforeUseModal";
import { trapModalFocus } from "./modalKeyboard";

interface ItemFormModalProps {
  kind: "folder" | "prompt";
  mode: "add" | "rename";
  initialName?: string;
  initialContent?: string;
  fallbackDirection: TextDirection;
  t: Translator;
  onClose: () => void;
  onSubmit: (name: string, content: string) => Promise<void>;
}

export function ItemFormModal({
  kind,
  mode,
  initialName = "",
  initialContent = "",
  fallbackDirection,
  t,
  onClose,
  onSubmit,
}: ItemFormModalProps) {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async () => {
    if (!name.trim() || (kind === "prompt" && mode === "add" && !content.trim())) {
      setError(t("required"));
      return;
    }
    setSaving(true);
    try {
      await onSubmit(name.trim(), content);
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
        <input
          className="text-input"
          dir={inputDirection}
          id="item-name"
          onChange={(event) => { setName(event.target.value); setError(""); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (kind === "folder" || mode === "rename")) submit();
          }}
          ref={inputRef}
          style={{ textAlign: inputDirection === "rtl" ? "right" : "left" }}
          value={name}
        />
        {kind === "prompt" && mode === "add" && (
          <>
            <div className="field-label">{t("content")}</div>
            <BidiEditor
              ariaLabel={t("content")}
              fallbackDirection={fallbackDirection}
              minHeight={145}
              onChange={(value) => { setContent(value); setError(""); }}
              value={content}
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
