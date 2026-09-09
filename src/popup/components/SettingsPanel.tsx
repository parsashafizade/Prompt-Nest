import { ArrowLeft } from "lucide-react";
import type { AccentPalette, AppSettings, DatabaseSnapshot, ExportData, Language, TextDirection, Theme, Translator } from "../../shared/types";
import { ExportImportPanel } from "./ExportImportPanel";

interface SettingsPanelProps {
  settings: AppSettings;
  snapshot: DatabaseSnapshot;
  fallbackDirection: TextDirection;
  t: Translator;
  onBack: () => void;
  onLanguage: (language: Language) => Promise<void>;
  onTheme: (theme: Theme) => Promise<void>;
  onAccent: (accent: AccentPalette) => Promise<void>;
  onImport: (data: ExportData, mode: "replace" | "merge") => Promise<void>;
  onNotice: (message: string) => void;
}

export function SettingsPanel({
  settings,
  snapshot,
  fallbackDirection,
  t,
  onBack,
  onLanguage,
  onTheme,
  onAccent,
  onImport,
  onNotice,
}: SettingsPanelProps) {
  return (
    <div className="scroll-area">
      <header className="view-header">
        <button aria-label={t("back")} className="icon-button compact" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" className="back-icon" size={20} />
        </button>
        <h1>{t("settings")}</h1>
      </header>

      <section className="settings-section">
        <h3>{t("language")}</h3>
        <div className="segmented">
          <button aria-pressed={settings.language === "en"} onClick={() => onLanguage("en")} type="button">{t("english")}</button>
          <button aria-pressed={settings.language === "fa"} onClick={() => onLanguage("fa")} type="button">{t("persian")}</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("theme")}</h3>
        <div className="segmented">
          <button aria-pressed={settings.theme === "light"} onClick={() => onTheme("light")} type="button">{t("light")}</button>
          <button aria-pressed={settings.theme === "dark"} onClick={() => onTheme("dark")} type="button">{t("dark")}</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("accentColor")}</h3>
        <div className="accent-options" role="group" aria-label={t("accentColor")}>
          {(["violet", "ocean", "sage", "terracotta"] as const).map((accent) => (
            <button
              aria-label={t(accent)}
              aria-pressed={settings.accent === accent}
              className={`accent-option accent-${accent}`}
              key={accent}
              onClick={() => onAccent(accent)}
              type="button"
            >
              <span aria-hidden="true" className="accent-swatch" />
              <span>{t(accent)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("data")}</h3>
        <ExportImportPanel
          fallbackDirection={fallbackDirection}
          onImport={onImport}
          onNotice={onNotice}
          settings={settings}
          snapshot={snapshot}
          t={t}
        />
      </section>
    </div>
  );
}
