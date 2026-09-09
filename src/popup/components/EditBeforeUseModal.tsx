import { Check, Copy, X } from "lucide-react";
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { splitBidiLines } from "../../shared/bidi";
import type { Prompt, TextDirection, Translator } from "../../shared/types";
import { trapModalFocus } from "./modalKeyboard";

interface TextSelection {
  start: number;
  end: number;
}

function getTextSelection(element: HTMLElement): TextSelection {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) {
    const length = element.textContent?.length ?? 0;
    return { start: length, end: length };
  }
  const range = selection.getRangeAt(0);
  const startRange = range.cloneRange();
  startRange.selectNodeContents(element);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = range.cloneRange();
  endRange.selectNodeContents(element);
  endRange.setEnd(range.endContainer, range.endOffset);
  return { start: startRange.toString().length, end: endRange.toString().length };
}

function selectionPoint(element: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let lastText: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.data.length;
    if (remaining < length) return { node, offset: remaining };
    remaining -= length;
    lastText = node;
    node = walker.nextNode() as Text | null;
  }
  if (remaining === 0) {
    const lastLine = element.querySelector<HTMLElement>("[data-editor-line]:last-of-type");
    if (lastLine) return { node: lastLine, offset: lastLine.childNodes.length };
  }
  return lastText
    ? { node: lastText, offset: lastText.data.length }
    : { node: element, offset: 0 };
}

function placeSelection(element: HTMLElement | null, selection: TextSelection) {
  if (!element) return;
  element.focus();
  const start = selectionPoint(element, selection.start);
  const end = selectionPoint(element, selection.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const browserSelection = window.getSelection();
  browserSelection?.removeAllRanges();
  browserSelection?.addRange(range);
}

interface BidiEditorProps {
  value: string;
  onChange: (value: string) => void;
  fallbackDirection: TextDirection;
  ariaLabel: string;
  autoFocus?: boolean;
  minHeight?: number;
}

export function BidiEditor({
  value,
  onChange,
  fallbackDirection,
  ariaLabel,
  autoFocus = false,
  minHeight,
}: BidiEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingSelection = useRef<TextSelection | null>(null);
  const lines = useMemo(
    () => splitBidiLines(value, fallbackDirection),
    [value, fallbackDirection],
  );

  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (selection) {
      pendingSelection.current = null;
      placeSelection(rootRef.current, selection);
    }
  }, [value]);

  const replaceSelection = (insertedText: string) => {
    const element = rootRef.current;
    if (!element) return;
    const { start, end } = getTextSelection(element);
    const normalized = insertedText.replace(/\r\n?/g, "\n");
    const caret = start + normalized.length;
    pendingSelection.current = { start: caret, end: caret };
    onChange(`${value.slice(0, start)}${normalized}${value.slice(end)}`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      replaceSelection("\n");
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    replaceSelection(event.clipboardData.getData("text/plain"));
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-multiline="true"
      autoFocus={autoFocus}
      className="bidi-editor"
      contentEditable
      onInput={(event) => {
        const selection = getTextSelection(event.currentTarget);
        pendingSelection.current = selection;
        onChange((event.currentTarget.textContent ?? "").replace(/\r\n?/g, "\n"));
      }}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      ref={rootRef}
      role="textbox"
      spellCheck
      style={minHeight ? { minHeight } : undefined}
      suppressContentEditableWarning
    >
      {lines.map((line, index) => {
        return (
          <Fragment key={index}>
            <span className="bidi-editor-line" data-editor-line dir={line.direction}>{line.text}</span>
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        );
      })}
    </div>
  );
}

interface EditBeforeUseModalProps {
  prompt: Prompt;
  fallbackDirection: TextDirection;
  t: Translator;
  onClose: () => void;
  onSaveContent: (content: string) => Promise<void>;
  onNotice: (message: string) => void;
}

export function EditBeforeUseModal({
  prompt,
  fallbackDirection,
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
        <BidiEditor
          ariaLabel={t("content")}
          autoFocus
          fallbackDirection={fallbackDirection}
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
