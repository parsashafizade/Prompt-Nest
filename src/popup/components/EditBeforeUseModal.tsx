import { Check, Copy, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { detectLineDirection } from "../../shared/bidi";
import type { Prompt, TextDirection, Translator } from "../../shared/types";
import { MarkdownPromptEditor } from "./MarkdownPromptEditor";
import { trapModalFocus } from "./modalKeyboard";

function lineAtCaret(value: string, caret: number) {
  const safeCaret = Math.max(0, Math.min(caret, value.length));
  const previousBreak = safeCaret > 0 ? value.lastIndexOf("\n", safeCaret - 1) : -1;
  const nextBreak = value.indexOf("\n", safeCaret);
  return value.slice(previousBreak + 1, nextBreak === -1 ? value.length : nextBreak);
}

interface BidiEditorProps {
  value: string;
  onChange: (value: string) => void;
  fallbackDirection: TextDirection;
  ariaLabel: string;
  autoFocus?: boolean;
  className?: string;
  id?: string;
  minHeight?: number;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  rows?: number;
}

export function BidiEditor({
  value,
  onChange,
  fallbackDirection,
  ariaLabel,
  autoFocus = false,
  className = "",
  id,
  minHeight,
  onKeyDown,
  rows,
}: BidiEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialValueRef = useRef(value);
  const [direction, setDirection] = useState<TextDirection>(() => (
    detectLineDirection(lineAtCaret(value, 0), fallbackDirection)
  ));
  const directionRef = useRef(direction);

  const updateDirection = useCallback((textarea: HTMLTextAreaElement) => {
    const currentLine = lineAtCaret(textarea.value, textarea.selectionStart ?? 0);
    const nextDirection = detectLineDirection(currentLine, directionRef.current);
    if (nextDirection !== directionRef.current) {
      directionRef.current = nextDirection;
      setDirection(nextDirection);
    }
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const textarea = textareaRef.current;
      if (textarea && document.activeElement === textarea) updateDirection(textarea);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [updateDirection]);

  return (
    <textarea
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      className={`bidi-title-editor ${className}`.trim()}
      defaultValue={initialValueRef.current}
      dir={direction}
      id={id}
      onFocus={(event) => updateDirection(event.currentTarget)}
      onInput={(event) => {
        updateDirection(event.currentTarget);
        onChange(event.currentTarget.value);
      }}
      onKeyDown={onKeyDown}
      onSelect={(event) => updateDirection(event.currentTarget)}
      ref={textareaRef}
      rows={rows}
      spellCheck
      style={{
        direction,
        minHeight,
        textAlign: direction === "rtl" ? "right" : "left",
      }}
    />
  );
}

interface EditBeforeUseModalProps {
  prompt: Prompt;
  t: Translator;
  onClose: () => void;
  onSaveContent: (content: string) => Promise<void>;
  onNotice: (message: string) => void;
}

export function EditBeforeUseModal({
  prompt,
  t,
  onClose,
  onSaveContent,
  onNotice,
}: EditBeforeUseModalProps) {
  const [content, setContent] = useState(prompt.content);
  const [saveForLater, setSaveForLater] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const copy = async () => {
    try {
      if (saveForLater) await onSaveContent(content);
      await navigator.clipboard.writeText(content);
      setCopyState("copied");
      globalThis.setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      onNotice(t("copyFailed"));
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-labelledby="edit-before-use-title" aria-modal="true" className="dialog-panel" onKeyDown={trapModalFocus} role="dialog">
        <header className="dialog-header">
          <h2 id="edit-before-use-title">{t("editBeforeUse")}</h2>
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
        <div className="radio-list" role="radiogroup" aria-label={t("editPrompt")}>
          <label className="radio-card">
            <input
              checked={saveForLater}
              name="save-mode"
              onChange={() => setSaveForLater(true)}
              type="radio"
            />
            <span>{t("saveForLater")}</span>
          </label>
          <label className="radio-card">
            <input
              checked={!saveForLater}
              name="save-mode"
              onChange={() => setSaveForLater(false)}
              type="radio"
            />
            <span>{t("justThisTime")}</span>
          </label>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">{t("cancel")}</button>
          <button
            className={`primary-button btn-primary ${copyState === "copied" ? "copy-success" : ""}`}
            onClick={copy}
            type="button"
          >
            {copyState === "copied"
              ? <Check aria-hidden="true" className="check-pop" size={18} />
              : <Copy aria-hidden="true" size={18} />}
            {copyState === "copied" ? t("copied") : t("copy")}
          </button>
        </div>
      </section>
    </div>
  );
}
