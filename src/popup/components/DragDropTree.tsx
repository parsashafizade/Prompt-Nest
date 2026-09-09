import { useState, type DragEvent, type ReactNode } from "react";
import type { DragPayload, Translator } from "../../shared/types";

export const DRAG_MIME = "application/x-prompt-nest-item";

export function writeDragPayload(event: DragEvent, payload: DragPayload) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  event.dataTransfer.setData("text/plain", `${payload.type}:${payload.id}`);
}

interface DragDropTreeProps {
  activeDrag: DragPayload | null;
  canDropAtCurrentLevel: boolean;
  children: ReactNode;
  onDropAtCurrentLevel: () => void;
  onDragEnd: () => void;
  t: Translator;
}

export function DragDropTree({
  activeDrag,
  canDropAtCurrentLevel,
  children,
  onDropAtCurrentLevel,
  onDragEnd,
  t,
}: DragDropTreeProps) {
  const [overRoot, setOverRoot] = useState(false);
  return (
    <div onDragEnd={onDragEnd}>
      {children}
      <div
        aria-hidden={!activeDrag}
        className={`root-drop-zone ${overRoot && canDropAtCurrentLevel ? "active" : ""}`}
        onDragEnter={(event) => {
          if (!activeDrag || !canDropAtCurrentLevel) return;
          event.preventDefault();
          setOverRoot(true);
        }}
        onDragLeave={() => setOverRoot(false)}
        onDragOver={(event) => {
          if (!activeDrag || !canDropAtCurrentLevel) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOverRoot(false);
          if (canDropAtCurrentLevel) onDropAtCurrentLevel();
        }}
      >
        {overRoot && canDropAtCurrentLevel ? t("moveTo") : ""}
      </div>
    </div>
  );
}
