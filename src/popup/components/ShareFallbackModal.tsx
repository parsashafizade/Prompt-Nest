import { Check, Copy, Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import { renderShareCard, type ShareCardRatio } from "../../shared/shareCard";
import type { Language, Prompt, Translator } from "../../shared/types";
import { trapModalFocus } from "./modalKeyboard";

interface ShareFallbackModalProps {
  prompt: Prompt;
  language: Language;
  t: Translator;
  onClose: () => void;
  onNotice: (message: string) => void;
}

async function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function ShareFallbackModal({ prompt, language, t, onClose, onNotice }: ShareFallbackModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState<ShareCardRatio>("square");
  const [copied, setCopied] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadFonts = async () => {
      try {
        const faces = await Promise.all([
          new FontFace("PromptNestPersian", `url("${browser.runtime.getURL("fonts/Vazirmatn-Regular.woff2")}")`).load(),
          new FontFace("PromptNestLatin", `url("${browser.runtime.getURL("fonts/Inter-Regular.woff2")}")`).load(),
        ]);
        if (!cancelled) faces.forEach((face) => document.fonts.add(face));
      } catch {
        // The same bundled font stack remains available through the popup stylesheet.
      }
      if (!cancelled) setFontsReady(true);
    };
    void loadFonts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (canvasRef.current) renderShareCard(canvasRef.current, { title: prompt.title, content: prompt.content, language }, ratio);
  }, [fontsReady, language, prompt.content, prompt.title, ratio]);

  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await canvasBlob(canvas);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `prompt-card-${ratio}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await canvasBlob(canvas);
      if (!blob) throw new Error("Canvas could not be encoded");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1400);
    } catch {
      onNotice(t("copyImageFailed"));
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="share-fallback-title"
        aria-modal="true"
        className="dialog-panel share-fallback-panel"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          } else trapModalFocus(event);
        }}
        role="dialog"
      >
        <header className="dialog-header">
          <h2 id="share-fallback-title">{t("shareCard")}</h2>
          <button autoFocus aria-label={t("close")} className="icon-button compact" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <p className="share-fallback-message">{t("shareOverlayUnavailable")}</p>
        <div className="share-fallback-preview"><canvas ref={canvasRef} /></div>
        <div className="share-ratios" role="group" aria-label={t("aspectRatio")}>
          {(["story", "square", "wide"] as const).map((option) => (
            <button aria-pressed={ratio === option} key={option} onClick={() => setRatio(option)} type="button">{t(option)}</button>
          ))}
        </div>
        <div className="dialog-actions">
          <button className={`secondary-button ${copied ? "copy-success" : ""}`} onClick={copy} type="button">
            {copied ? <Check aria-hidden="true" className="check-pop" size={16} /> : <Copy aria-hidden="true" size={16} />}
            {copied ? t("copied") : t("copyImage")}
          </button>
          <button className="primary-button btn-primary" onClick={download} type="button">
            <Download aria-hidden="true" size={16} /> {t("downloadPng")}
          </button>
        </div>
      </section>
    </div>
  );
}
