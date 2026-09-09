import { FileText, FolderOpen } from "lucide-react";
import type { Translator } from "../../shared/types";

interface OnboardingFlowProps {
  onComplete: () => void;
  t: Translator;
}

export function OnboardingFlow({ onComplete, t }: OnboardingFlowProps) {
  return (
    <main className="onboarding">
      <div aria-hidden="true" className="onboarding-visual">
        <div className="onboarding-folder"><FolderOpen size={45} /></div>
        <div className="onboarding-note"><FileText size={40} /></div>
      </div>
      <h1>{t("onboardingTitle")}</h1>
      <p>{t("onboardingBody")}</p>
      <div className="onboarding-actions">
        <button className="secondary-button" onClick={onComplete} type="button">{t("skip")}</button>
        <button className="primary-button btn-primary" onClick={onComplete} type="button">{t("start")}</button>
      </div>
    </main>
  );
}
