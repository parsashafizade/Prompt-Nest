import { Share2, X } from "lucide-react";
import { useState } from "react";
import browser from "webextension-polyfill";
import {
  installPreparedShareOverlay,
  prepareShareOverlayPayload,
} from "../../content/shareOverlay";
import type { Language, Prompt, Translator } from "../../shared/types";
import { noteShareText } from "../../shared/promptOutput";
import { trapModalFocus } from "./modalKeyboard";

interface ShareCardTriggerProps {
  prompt: Prompt;
  language: Language;
  t: Translator;
  onFallback: (content: string) => void;
}

const RESTRICTED_PAGE = /^(?:chrome|chrome-extension|edge|about|moz-extension|file):/i;
const CHROME_WEB_STORE = /^https:\/\/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)(?:\/|$)/i;

export function ShareCardTrigger({ prompt, language, t, onFallback }: ShareCardTriggerProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [includeNote, setIncludeNote] = useState(false);
  const noteContent = noteShareText(prompt.note, prompt.noteAttachments);
  const openShareCard = async (withNote: boolean) => {
    const content = [prompt.content, withNote ? noteContent : ""].filter(Boolean).join("\n\n");
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab.id === undefined || !tab.url || RESTRICTED_PAGE.test(tab.url) || CHROME_WEB_STORE.test(tab.url)) {
        onFallback(content);
        return;
      }
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: installPreparedShareOverlay,
        args: [prepareShareOverlayPayload({
          title: prompt.title,
          content,
          language,
        })],
      });
      window.close();
    } catch {
      onFallback(content);
    }
  };

  const beginShare = () => {
    if (!noteContent) {
      void openShareCard(false);
      return;
    }
    setIncludeNote(false);
    setOptionsOpen(true);
  };

  return <>
    <button aria-label={t("share")} className="icon-button compact" onClick={beginShare} title={t("share")} type="button">
      <Share2 aria-hidden="true" size={20} />
    </button>
    {optionsOpen && (
      <div className="dialog-backdrop dialog-backdrop-top" role="presentation">
        <section aria-labelledby="share-options-title" aria-modal="true" className="dialog-panel share-options-panel" onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOptionsOpen(false);
          } else trapModalFocus(event);
        }} role="dialog">
          <header className="dialog-header">
            <h2 id="share-options-title">{t("shareCard")}</h2>
            <button aria-label={t("close")} className="icon-button compact" onClick={() => setOptionsOpen(false)} type="button"><X aria-hidden="true" size={20} /></button>
          </header>
          <label className="radio-card">
            <input checked={includeNote} onChange={(event) => setIncludeNote(event.target.checked)} type="checkbox" />
            <span>{t("includeNoteInShare")}</span>
          </label>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setOptionsOpen(false)} type="button">{t("cancel")}</button>
            <button className="primary-button btn-primary" onClick={() => { setOptionsOpen(false); void openShareCard(includeNote); }} type="button"><Share2 aria-hidden="true" size={18} /> {t("share")}</button>
          </div>
        </section>
      </div>
    )}
  </>;
}
