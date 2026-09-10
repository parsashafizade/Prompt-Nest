import { ChevronDown, ChevronRight, ChevronUp, Folder as FolderIcon, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { DragPayload, Folder, FolderDropPosition, TextDirection, Translator } from "../../shared/types";
import { isFolderMoveValid, sortedByOrder } from "../../shared/utils";
import { BidiText } from "./BidiText";
import { AnchoredContextMenu } from "./AnchoredContextMenu";
import { writeDragPayload } from "./DragDropTree";

interface FolderTreeProps {
  folders: Folder[];
  parentId: string | null;
  rootParentId: string | null;
  includeRootSiblings?: boolean;
  fallbackDirection: TextDirection;
  activeDrag: DragPayload | null;
  t: Translator;
  onOpen: (folderId: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onMoveTo: (folder: Folder, parentId: string | null) => void;
  onMoveStep: (folder: Folder, direction: -1 | 1) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDropFolder: (folderId: string, targetId: string, position: FolderDropPosition) => void;
  onDropPrompt: (promptId: string, folderId: string) => void;
}

type DropState = { position: FolderDropPosition; invalid: boolean } | null;

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

interface FolderMenuProps {
  folder: Folder;
  folders: Folder[];
  rootParentId: string | null;
  isFirst: boolean;
  isLast: boolean;
  t: Translator;
  onRename: () => void;
  onDelete: () => void;
  onMoveTo: (parentId: string | null) => void;
  onMoveStep: (direction: -1 | 1) => void;
}

const FolderMenu = memo(function FolderMenu({
  folder,
  folders,
  rootParentId,
  isFirst,
  isLast,
  t,
  onRename,
  onDelete,
  onMoveTo,
  onMoveStep,
}: FolderMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="menu-wrap" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === "Escape") setOpen(false);
    }}>
      <button aria-expanded={open} aria-haspopup="menu" aria-label={t("moreActions")} className="icon-button compact" onClick={() => setOpen((value) => !value)} ref={triggerRef} type="button">
        <MoreVertical aria-hidden="true" size={16} />
      </button>
      {open && (
        <AnchoredContextMenu anchorRef={triggerRef} onClose={() => setOpen(false)}>
          <button className="menu-button" onClick={() => { setOpen(false); onRename(); }} role="menuitem" type="button">
            <Pencil aria-hidden="true" size={16} /> {t("rename")}
          </button>
          <div className="menu-move-row">
            <label className="sr-only" htmlFor={`move-folder-${folder.id}`}>{t("moveTo")}</label>
            <select
              className="menu-select"
              defaultValue=""
              id={`move-folder-${folder.id}`}
              onChange={(event) => {
                setOpen(false);
                onMoveTo(event.target.value === "__root__" ? rootParentId : event.target.value);
              }}
            >
              <option disabled value="">{t("moveTo")}</option>
              <option disabled={folder.parentId === rootParentId} value="__root__">{t("root")}</option>
              {folders.filter(({ id }) => id !== rootParentId).map((candidate) => (
                <option
                  disabled={candidate.id === folder.parentId || !isFolderMoveValid(folders, folder.id, candidate.id)}
                  key={candidate.id}
                  value={candidate.id}
                >
                  {folderPath(candidate, folders)}
                </option>
              ))}
            </select>
            <button aria-label={t("moveUp")} className="menu-arrow" disabled={isFirst} onClick={() => { setOpen(false); onMoveStep(-1); }} type="button">
              <ChevronUp aria-hidden="true" size={16} />
            </button>
            <button aria-label={t("moveDown")} className="menu-arrow" disabled={isLast} onClick={() => { setOpen(false); onMoveStep(1); }} type="button">
              <ChevronDown aria-hidden="true" size={16} />
            </button>
          </div>
          <button className="menu-button danger-menu" onClick={() => { setOpen(false); onDelete(); }} role="menuitem" type="button">
            <Trash2 aria-hidden="true" size={16} /> {t("delete")}
          </button>
        </AnchoredContextMenu>
      )}
    </div>
  );
});

interface FolderRowProps {
  folder: Folder;
  folders: Folder[];
  rootParentId: string | null;
  animationIndex: number;
  siblingIndex: number;
  siblingCount: number;
  fallbackDirection: TextDirection;
  activeDrag: DragPayload | null;
  t: Translator;
  onOpen: (folderId: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onMoveTo: (folder: Folder, parentId: string | null) => void;
  onMoveStep: (folder: Folder, direction: -1 | 1) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDropFolder: (folderId: string, targetId: string, position: FolderDropPosition) => void;
  onDropPrompt: (promptId: string, folderId: string) => void;
}

const FolderRow = memo(function FolderRow({
  folder,
  folders,
  rootParentId,
  animationIndex,
  siblingIndex,
  siblingCount,
  fallbackDirection,
  activeDrag,
  t,
  onOpen,
  onRename,
  onDelete,
  onMoveTo,
  onMoveStep,
  onDragStart,
  onDragEnd,
  onDropFolder,
  onDropPrompt,
}: FolderRowProps) {
  const [dropState, setDropState] = useState<DropState>(null);
  const openFolder = useCallback(() => onOpen(folder.id), [folder.id, onOpen]);
  const renameFolder = useCallback(() => onRename(folder), [folder, onRename]);
  const deleteFolder = useCallback(() => onDelete(folder), [folder, onDelete]);
  const moveFolderTo = useCallback((parentId: string | null) => onMoveTo(folder, parentId), [folder, onMoveTo]);
  const moveFolderStep = useCallback((direction: -1 | 1) => onMoveStep(folder, direction), [folder, onMoveStep]);
  const animationStyle = { "--item-delay": `${animationIndex < 8 ? animationIndex * 24 : 0}ms` } as CSSProperties;

  const dropPosition = (event: DragEvent): FolderDropPosition => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - bounds.top) / bounds.height;
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "inside";
  };

  const invalidDrop = (moving: DragPayload, position: FolderDropPosition) => {
    if (moving.type === "prompt") return false;
    if (moving.id === folder.id) return true;
    return !isFolderMoveValid(folders, moving.id, position === "inside" ? folder.id : folder.parentId);
  };

  const dropClass = dropState
    ? dropState.invalid ? "drop-invalid" : `drop-${dropState.position}`
    : "";

  return (
    <li
      aria-grabbed={activeDrag?.type === "folder" && activeDrag.id === folder.id}
      className={`item-card item-enter ${dropClass}`}
      draggable
      onDragEnd={() => { setDropState(null); onDragEnd(); }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropState(null);
      }}
      onDragOver={(event) => {
        if (!activeDrag) return;
        event.preventDefault();
        const position = activeDrag.type === "prompt" ? "inside" : dropPosition(event);
        const invalid = invalidDrop(activeDrag, position);
        event.dataTransfer.dropEffect = invalid ? "none" : "move";
        setDropState({ position, invalid });
      }}
      onDragStart={(event) => {
        const payload: DragPayload = { type: "folder", id: folder.id };
        writeDragPayload(event, payload);
        onDragStart(payload);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const state = dropState;
        setDropState(null);
        if (!activeDrag || !state || state.invalid) return;
        if (activeDrag.type === "folder") onDropFolder(activeDrag.id, folder.id, state.position);
        else onDropPrompt(activeDrag.id, folder.id);
      }}
      role="treeitem"
      style={animationStyle}
      title={dropState?.invalid ? t("invalidMove") : undefined}
    >
      <FolderIcon aria-hidden="true" className="folder-icon" size={16} />
      <button className="item-main" onClick={openFolder} type="button">
        <BidiText className="item-title" fallbackDirection={fallbackDirection} text={folder.name} />
      </button>
      <ChevronRight aria-hidden="true" className="folder-icon open-chevron" size={16} />
      <FolderMenu
        folder={folder}
        folders={folders}
        isFirst={siblingIndex === 0}
        isLast={siblingIndex === siblingCount - 1}
        onDelete={deleteFolder}
        onMoveStep={moveFolderStep}
        onMoveTo={moveFolderTo}
        onRename={renameFolder}
        rootParentId={rootParentId}
        t={t}
      />
    </li>
  );
});

export function FolderTree({
  folders,
  parentId,
  rootParentId,
  includeRootSiblings = false,
  fallbackDirection,
  activeDrag,
  t,
  onOpen,
  onRename,
  onDelete,
  onMoveTo,
  onMoveStep,
  onDragStart,
  onDragEnd,
  onDropFolder,
  onDropPrompt,
}: FolderTreeProps) {
  const siblingsByParent = useMemo(() => {
    const grouped = new Map<string | null, Folder[]>();
    for (const folder of folders) {
      const siblings = grouped.get(folder.parentId) ?? [];
      siblings.push(folder);
      grouped.set(folder.parentId, siblings);
    }
    for (const [groupParentId, siblings] of grouped) {
      grouped.set(groupParentId, sortedByOrder(siblings));
    }
    return grouped;
  }, [folders]);
  const visibleTopLevelSiblings = useMemo(
    () => (siblingsByParent.get(null) ?? []).filter(({ id }) => id !== rootParentId),
    [rootParentId, siblingsByParent],
  );
  const visible = useMemo(() => {
    const directChildren = siblingsByParent.get(parentId) ?? [];
    if (!includeRootSiblings || !rootParentId || parentId !== rootParentId) return directChildren;
    return [...directChildren, ...visibleTopLevelSiblings];
  }, [includeRootSiblings, parentId, rootParentId, siblingsByParent, visibleTopLevelSiblings]);

  return (
    <ul className="item-list" role="tree">
      {visible.map((folder, animationIndex) => {
        const siblings = folder.parentId === null
          ? visibleTopLevelSiblings
          : siblingsByParent.get(folder.parentId) ?? [];
        return <FolderRow
          activeDrag={activeDrag}
          animationIndex={animationIndex}
          fallbackDirection={fallbackDirection}
          folder={folder}
          folders={folders}
          key={folder.id}
          onDelete={onDelete}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onDropFolder={onDropFolder}
          onDropPrompt={onDropPrompt}
          onMoveStep={onMoveStep}
          onMoveTo={onMoveTo}
          onOpen={onOpen}
          onRename={onRename}
          rootParentId={rootParentId}
          siblingCount={siblings.length}
          siblingIndex={siblings.findIndex(({ id }) => id === folder.id)}
          t={t}
        />;
      })}
    </ul>
  );
}
