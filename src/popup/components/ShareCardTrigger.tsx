import { Share2 } from "lucide-react";
import browser from "webextension-polyfill";
import { installShareOverlay } from "../../content/shareOverlay";
import type { Language, Prompt, Translator } from "../../shared/types";

interface ShareCardTriggerProps {
  prompt: Prompt;
  language: Language;
  t: Translator;
  onFallback: () => void;
}

const RESTRICTED_PAGE = /^(?:chrome|chrome-extension|edge|about|moz-extension|file):/i;
const CHROME_WEB_STORE = /^https:\/\/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)(?:\/|$)/i;

export function ShareCardTrigger({ prompt, language, t, onFallback }: ShareCardTriggerProps) {
  const openShareCard = async () => {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab.id === undefined || !tab.url || RESTRICTED_PAGE.test(tab.url) || CHROME_WEB_STORE.test(tab.url)) {
        onFallback();
        return;
      }
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: installShareOverlay,
        args: [{ title: prompt.title, content: prompt.content, language }],
      });
      window.close();
    } catch {
      onFallback();
    }
  };

  return (
    <button aria-label={t("share")} className="icon-button compact" onClick={openShareCard} type="button">
      <Share2 aria-hidden="true" size={20} />
    </button>
  );
}
