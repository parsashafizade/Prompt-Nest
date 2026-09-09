import { ChevronDown, ChevronUp, CopyPlus, FileText, GripVertical, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { memo, useCallback, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import type { DragPayload, Folder, Prompt, PromptSortMode, TextDirection, Translator } from "../../shared/types";
import { sortPrompts, sortedByOrder } from "../../shared/utils";
import { BidiText } from "./BidiText";
import { writeDragPayload } from "./DragDropTree";
import { ReadonlyMarkdown } from "./ReadonlyMarkdown";

interface PromptMenuProps {
  prompt: Prompt;
  folders: Folder[];
  isFirst: boolean;
  isLast: boolean;
  canReorder: boolean;
  t: Translator;
  onRename: () => void;
  onDelete: () => void;
  onMoveTo: (folderId: string) => void;
  onCopyTo: (folderId: string) => void;
  onMoveStep: (direction: -1 | 1) => void;
}

function folderPath(folder: Folder, folders: Folder[]) {
  const names = [folder.name];
  const seen = new Set([folder.id]);
  let parentId = folder.parentId;
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = folders.find(({ id }) => id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

const PromptMenu = memo(function PromptMenu({
  prompt,
  folders,
  isFirst,
  isLast,
  canReorder,
  t,
  onRename,
  onDelete,
  onMoveTo,
  onCopyTo,
  onMoveStep,
}: PromptMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-wrap" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === "Escape") setOpen(false);
    }}>
      <button aria-expanded={open} aria-haspopup="menu" aria-label={t("moreActions")} className="icon-button compact" onClick={() => setOpen((value) => !value)} type="button">
        <MoreVertical aria-hidden="true" size={16} />
      </button>
      {open && (
        <div className="context-menu" role="menu">
          <button className="menu-button" onClick={() => { setOpen(false); onRename(); }} role="menuitem" type="button">
            <Pencil aria-hidden="true" size={16} /> {t("rename")}
          </button>
          <div className="menu-picker-row">
            <label className="sr-only" htmlFor={`move-prompt-${prompt.id}`}>{t("moveTo")}</label>
            <select
              className="menu-select"
              defaultValue=""
              id={`move-prompt-${prompt.id}`}
              onChange={(event) => { setOpen(false); onMoveTo(event.target.value); }}
            >
              <option disabled value="">{t("moveTo")}</option>
              {folders.map((folder) => (
                <option disabled={folder.id === prompt.folderId} key={folder.id} value={folder.id}>
                  {folderPath(folder, folders)}
                </option>
              ))}
            </select>
          </div>
          <div className="menu-picker-row copy-picker-row">
            <CopyPlus aria-hidden="true" size={16} />
            <label className="sr-only" htmlFor={`copy-prompt-${prompt.id}`}>{t("copyTo")}</label>
            <select
              className="menu-select"
              defaultValue=""
              id={`copy-prompt-${prompt.id}`}
              onChange={(event) => { setOpen(false); onCopyTo(event.target.value); }}
            >
              <option disabled value="">{t("copyTo")}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folderPath(folder, folders)}</option>
              ))}
            </select>
          </div>
          {canReorder && (
            <div className="menu-order-row">
              <button aria-label={t("moveUp")} className="menu-arrow" disabled={isFirst} onClick={() => onMoveStep(-1)} type="button">
                <ChevronUp aria-hidden="true" size={16} />
              </button>
              <button aria-label={t("moveDown")} className="menu-arrow" disabled={isLast} onClick={() => onMoveStep(1)} type="button">
                <ChevronDown aria-hidden="true" size={16} />
              </button>
            </div>
          )}
          <button className="menu-button danger-menu" onClick={() => { setOpen(false); onDelete(); }} role="menuitem" type="button">
            <Trash2 aria-hidden="true" size={16} /> {t("delete")}
          </button>
        </div>
      )}
    </div>
  );
});

interface PromptRowProps {
  prompt: Prompt;
  parent?: Folder;
  folders: Folder[];
  siblingIndex: number;
  siblingCount: number;
  animationIndex: number;
  fallbackDirection: TextDirection;
  activeDrag: DragPayload | null;
  searchMode: boolean;
  canReorder: boolean;
  t: Translator;
  onOpen: (prompt: Prompt) => void;
  onRename: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
  onMoveTo: (prompt: Prompt, folderId: string) => void;
  onCopyTo: (prompt: Prompt, folderId: string) => void;
  onMoveStep: (prompt: Prompt, direction: -1 | 1) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDropPrompt: (promptId: string, targetPromptId: string, position: "before" | "after") => void;
}

const PromptRow = memo(function PromptRow({
  prompt,
  parent,
  folders,
  siblingIndex,
  siblingCount,
  animationIndex,
  fallbackDirection,
  activeDrag,
  searchMode,
  canReorder,
  t,
  onOpen,
  onRename,
  onDelete,
  onMoveTo,
  onCopyTo,
  onMoveStep,
  onDragStart,
  onDragEnd,
  onDropPrompt,
}: PromptRowProps) {
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);
  const openPrompt = useCallback(() => onOpen(prompt), [onOpen, prompt]);
  const renamePrompt = useCallback(() => onRename(prompt), [onRename, prompt]);
  const deletePrompt = useCallback(() => onDelete(prompt), [onDelete, prompt]);
  const movePromptTo = useCallback((folderId: string) => onMoveTo(prompt, folderId), [onMoveTo, prompt]);
  const copyPromptTo = useCallback((folderId: string) => onCopyTo(prompt, folderId), [onCopyTo, prompt]);
  const movePromptStep = useCallback((direction: -1 | 1) => onMoveStep(prompt, direction), [onMoveStep, prompt]);
  const animationStyle = { "--item-delay": `${animationIndex < 8 ? animationIndex * 24 : 0}ms` } as CSSProperties;

  const getDropPosition = (event: DragEvent): "before" | "after" => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  };

  return (
    <li
      aria-grabbed={canReorder && activeDrag?.type === "prompt" && activeDrag.id === prompt.id}
      className={`item-card item-enter ${dropPosition ? `drop-${dropPosition}` : ""}`}
      onDragEnd={() => { setDropPosition(null); onDragEnd(); }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPosition(null);
      }}
      onDragOver={(event) => {
        if (!canReorder || activeDrag?.type !== "prompt" || activeDrag.id === prompt.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropPosition(getDropPosition(event));
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (canReorder && activeDrag?.type === "prompt" && dropPosition) {
          onDropPrompt(activeDrag.id, prompt.id, dropPosition);
        }
        setDropPosition(null);
      }}
      style={animationStyle}
    >
      {canReorder && (
        <button
          aria-label={t("dragToReorder")}
          className="prompt-drag-handle"
          draggable
          onDragStart={(event) => {
            const payload: DragPayload = { type: "prompt", id: prompt.id };
            writeDragPayload(event, payload);
            onDragStart(payload);
          }}
          type="button"
        >
          <GripVertical aria-hidden="true" size={16} />
        </button>
      )}
      <FileText aria-hidden="true" className="prompt-icon" size={16} />
      <button className="item-main" onClick={openPrompt} type="button">
        <BidiText className="item-title" fallbackDirection={fallbackDirection} text={prompt.title} />
        {prompt.content && <ReadonlyMarkdown className="item-preview" compact value={prompt.content} />}
        {searchMode && parent && <div className="item-subtitle">{t("inFolder", { folder: parent.name })}</div>}
      </button>
      <PromptMenu
        canReorder={canReorder}
        folders={folders}
        isFirst={siblingIndex <= 0}
        isLast={siblingIndex === siblingCount - 1}
        onCopyTo={copyPromptTo}
        onDelete={deletePrompt}
        onMoveStep={movePromptStep}
        onMoveTo={movePromptTo}
        onRename={renamePrompt}
        prompt={prompt}
        t={t}
      />
    </li>
  );
});

interface PromptListProps {
  prompts: Prompt[];
  allPrompts?: Prompt[];
  folders: Folder[];
  fallbackDirection: TextDirection;
  activeDrag: DragPayload | null;
  sortMode: PromptSortMode;
  searchMode?: boolean;
  t: Translator;
  onOpen: (prompt: Prompt) => void;
  onRename: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
  onMoveTo: (prompt: Prompt, folderId: string) => void;
  onCopyTo: (prompt: Prompt, folderId: string) => void;
  onMoveStep: (prompt: Prompt, direction: -1 | 1) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDropPrompt: (promptId: string, targetPromptId: string, position: "before" | "after") => void;
}

export function PromptList({
  prompts,
  allPrompts = prompts,
  folders,
  fallbackDirection,
  activeDrag,
  sortMode,
  searchMode = false,
  t,
  onOpen,
  onRename,
  onDelete,
  onMoveTo,
  onCopyTo,
  onMoveStep,
  onDragStart,
  onDragEnd,
  onDropPrompt,
}: PromptListProps) {
  const visible = useMemo(
    () => searchMode ? prompts : sortPrompts(prompts, sortMode),
    [prompts, searchMode, sortMode],
  );
  const customSiblingsByFolder = useMemo(() => {
    const result = new Map<string, Prompt[]>();
    for (const prompt of allPrompts) {
      const siblings = result.get(prompt.folderId) ?? [];
      siblings.push(prompt);
      result.set(prompt.folderId, siblings);
    }
    for (const [folderId, siblings] of result) result.set(folderId, sortedByOrder(siblings));
    return result;
  }, [allPrompts]);
  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const canReorder = !searchMode && sortMode === "custom";

  return (
    <ul className="item-list">
      {visible.map((prompt, index) => {
        const siblings = customSiblingsByFolder.get(prompt.folderId) ?? [];
        return (
          <PromptRow
            activeDrag={activeDrag}
            animationIndex={index}
            canReorder={canReorder}
            fallbackDirection={fallbackDirection}
            folders={folders}
            key={prompt.id}
            onCopyTo={onCopyTo}
            onDelete={onDelete}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onDropPrompt={onDropPrompt}
            onMoveStep={onMoveStep}
            onMoveTo={onMoveTo}
            onOpen={onOpen}
            onRename={onRename}
            parent={folderById.get(prompt.folderId)}
            prompt={prompt}
            searchMode={searchMode}
            siblingCount={siblings.length}
            siblingIndex={siblings.findIndex(({ id }) => id === prompt.id)}
            t={t}
          />
        );
      })}
    </ul>
  );
}
