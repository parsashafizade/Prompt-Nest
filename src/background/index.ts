import browser from "webextension-polyfill";
import { storePendingPromptDraft } from "../shared/pendingPromptDraft";

const MENU_ID = "prompt-nest-save-selection";
const SETTINGS_KEY = "promptNestSettings";

async function registerSelectionMenu() {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] as { language?: string } | undefined;
  const language = settings?.language ?? (navigator.language.toLowerCase().startsWith("fa") ? "fa" : "en");
  const title = language === "fa"
    ? "ذخیره متن انتخاب‌شده به‌عنوان پرامپت"
    : "Save selection as a new prompt";
  await browser.contextMenus.remove(MENU_ID).catch(() => undefined);
  browser.contextMenus.create({ id: MENU_ID, contexts: ["selection"], title });
}

browser.runtime.onInstalled.addListener(() => { void registerSelectionMenu(); });
browser.runtime.onStartup.addListener(() => { void registerSelectionMenu(); });
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && SETTINGS_KEY in changes) void registerSelectionMenu();
});

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText?.trim()) return;
  void (async () => {
    await storePendingPromptDraft({
      id: crypto.randomUUID(),
      content: info.selectionText ?? "",
      createdAt: new Date().toISOString(),
    });
    try {
      await browser.action.openPopup();
    } catch {
      await browser.windows.create({
        type: "popup",
        url: browser.runtime.getURL("src/popup/index.html"),
        width: 420,
        height: 640,
      });
    }
  })();
});
