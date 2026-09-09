import type { Translator } from "../../shared/types";

interface ConfirmUndoSnackbarProps {
  message: string;
  onUndo?: () => void;
  onDismiss: () => void;
  t: Translator;
}

export function ConfirmUndoSnackbar({ message, onUndo, onDismiss, t }: ConfirmUndoSnackbarProps) {
  return (
    <div aria-live="polite" className="snackbar" role="status">
      <span>{message}</span>
      {onUndo && <button onClick={onUndo} type="button">{t("undo")}</button>}
      <button aria-label={t("close")} onClick={onDismiss} type="button">×</button>
    </div>
  );
}
