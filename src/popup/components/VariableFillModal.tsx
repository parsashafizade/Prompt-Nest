import { Copy, X } from "lucide-react";
import { useState } from "react";
import { detectLineDirection } from "../../shared/bidi";
import type { TextDirection, Translator } from "../../shared/types";
import { trapModalFocus } from "./modalKeyboard";

interface VariableFillModalProps {
  names: string[];
  fallbackDirection: TextDirection;
  t: Translator;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}

export function VariableFillModal({ names, fallbackDirection, t, onCancel, onSubmit }: VariableFillModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(names.map((name) => [name, ""])));
  const [copying, setCopying] = useState(false);
  return (
    <div className="dialog-backdrop dialog-backdrop-top" role="presentation">
      <section aria-labelledby="variable-fill-title" aria-modal="true" className="dialog-panel" onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        } else trapModalFocus(event);
      }} role="dialog">
        <header className="dialog-header">
          <h2 id="variable-fill-title">{t("fillVariables")}</h2>
          <button aria-label={t("close")} className="icon-button compact" onClick={onCancel} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <p className="dialog-description">{t("fillVariablesHint")}</p>
        <div className="variable-fields">
          {names.map((name, index) => {
            const direction = detectLineDirection(values[name], fallbackDirection);
            return (
              <label className="field-label variable-field" key={name}>
                <span dir={detectLineDirection(name, fallbackDirection)}>{name}</span>
                <input
                  autoFocus={index === 0}
                  className="text-input"
                  dir={direction}
                  onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                  style={{ textAlign: direction === "rtl" ? "right" : "left" }}
                  value={values[name]}
                />
              </label>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" disabled={copying} onClick={onCancel} type="button">{t("cancel")}</button>
          <button className="primary-button btn-primary" disabled={copying} onClick={async () => {
            setCopying(true);
            try { await onSubmit(values); } finally { setCopying(false); }
          }} type="button">
            <Copy aria-hidden="true" size={18} /> {t("copy")}
          </button>
        </div>
      </section>
    </div>
  );
}
