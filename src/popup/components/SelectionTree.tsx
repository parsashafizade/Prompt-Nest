import { ChevronDown, FileText, Folder as FolderIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExportData, Folder, Prompt, TextDirection, Translator } from "../../shared/types";
import { sortedByOrder } from "../../shared/utils";
import { BidiText } from "./BidiText";

export interface SelectionState {
  folderIds: Set<string>;
  promptIds: Set<string>;
}

interface TreeIndexes {
  childrenByParent: Map<string | null, Folder[]>;
  promptsByFolder: Map<string, Prompt[]>;
  folderById: Map<string, Folder>;
}

function buildIndexes(folders: Folder[], prompts: Prompt[]): TreeIndexes {
  const childrenByParent = new Map<string | null, Folder[]>();
  const promptsByFolder = new Map<string, Prompt[]>();
  for (const folder of folders) {
    const children = childrenByParent.get(folder.parentId) ?? [];
    children.push(folder);
    childrenByParent.set(folder.parentId, children);
  }
  for (const [parentId, children] of childrenByParent) {
    childrenByParent.set(parentId, sortedByOrder(children));
  }
  for (const prompt of prompts) {
    const folderPrompts = promptsByFolder.get(prompt.folderId) ?? [];
    folderPrompts.push(prompt);
    promptsByFolder.set(prompt.folderId, folderPrompts);
  }
  for (const [folderId, folderPrompts] of promptsByFolder) {
    promptsByFolder.set(folderId, sortedByOrder(folderPrompts));
  }
  return {
    childrenByParent,
    promptsByFolder,
    folderById: new Map(folders.map((folder) => [folder.id, folder])),
  };
}

function collectFolderSubtree(folderId: string, indexes: TreeIndexes) {
  const folderIds = new Set<string>();
  const promptIds = new Set<string>();
  const queue = [folderId];
  while (queue.length) {
    const id = queue.shift()!;
    folderIds.add(id);
    for (const prompt of indexes.promptsByFolder.get(id) ?? []) promptIds.add(prompt.id);
    for (const child of indexes.childrenByParent.get(id) ?? []) queue.push(child.id);
  }
  return { folderIds, promptIds };
}

export function createAllSelection(folders: Folder[], prompts: Prompt[]): SelectionState {
  return {
    folderIds: new Set(folders.map(({ id }) => id)),
    promptIds: new Set(prompts.map(({ id }) => id)),
  };
}

export function hasSelectedItems(selection: SelectionState) {
  return selection.folderIds.size > 0 || selection.promptIds.size > 0;
}

export function filterExportData<T extends ExportData>(data: T, selection: SelectionState): T {
  const folderById = new Map(data.folders.map((folder) => [folder.id, folder]));
  const includedFolders = new Set(selection.folderIds);
  const includeAncestors = (folderId: string) => {
    let currentId: string | null = folderId;
    while (currentId) {
      includedFolders.add(currentId);
      currentId = folderById.get(currentId)?.parentId ?? null;
    }
  };
  for (const prompt of data.prompts) {
    if (selection.promptIds.has(prompt.id)) includeAncestors(prompt.folderId);
  }
  for (const folderId of selection.folderIds) includeAncestors(folderId);
  return {
    ...data,
    folders: data.folders.filter(({ id }) => includedFolders.has(id)),
    prompts: data.prompts.filter(({ id, folderId }) => (
      selection.promptIds.has(id) && includedFolders.has(folderId)
    )),
  } as T;
}

interface TriStateCheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  label: string;
  onChange: () => void;
}

function TriStateCheckbox({ checked, indeterminate, label, onChange }: TriStateCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      aria-label={label}
      checked={checked}
      onChange={onChange}
      ref={ref}
      type="checkbox"
    />
  );
}

interface FolderSelectionNodeProps {
  folder: Folder;
  indexes: TreeIndexes;
  selection: SelectionState;
  fallbackDirection: TextDirection;
  t: Translator;
  onToggleFolder: (folder: Folder) => void;
  onTogglePrompt: (prompt: Prompt) => void;
}

const FolderSelectionNode = memo(function FolderSelectionNode({
  folder,
  indexes,
  selection,
  fallbackDirection,
  t,
  onToggleFolder,
  onTogglePrompt,
}: FolderSelectionNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const children = indexes.childrenByParent.get(folder.id) ?? [];
  const prompts = indexes.promptsByFolder.get(folder.id) ?? [];
  const subtree = useMemo(() => collectFolderSubtree(folder.id, indexes), [folder.id, indexes]);
  const selectedCount = [...subtree.folderIds].filter((id) => selection.folderIds.has(id)).length
    + [...subtree.promptIds].filter((id) => selection.promptIds.has(id)).length;
  const totalCount = subtree.folderIds.size + subtree.promptIds.size;
  const checked = selectedCount === totalCount;
  const indeterminate = selectedCount > 0 && !checked;
  const hasChildren = children.length > 0 || prompts.length > 0;
  const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
  const toggleFolder = useCallback(() => onToggleFolder(folder), [folder, onToggleFolder]);

  return (
    <li className="selection-folder" role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div className="selection-row folder-selection-row">
        <button
          aria-label={expanded ? t("collapse") : t("expand")}
          className={`selection-chevron ${expanded ? "expanded" : ""}`}
          disabled={!hasChildren}
          onClick={toggleExpanded}
          type="button"
        >
          <ChevronDown aria-hidden="true" size={16} />
        </button>
        <TriStateCheckbox
          checked={checked}
          indeterminate={indeterminate}
          label={folder.name}
          onChange={toggleFolder}
        />
        <FolderIcon aria-hidden="true" size={16} />
        <BidiText className="selection-label" fallbackDirection={fallbackDirection} text={folder.name} />
      </div>
      {hasChildren && expanded && (
        <ul className="selection-children" role="group">
          {children.map((child) => (
            <FolderSelectionNode
              fallbackDirection={fallbackDirection}
              folder={child}
              indexes={indexes}
              key={child.id}
              onToggleFolder={onToggleFolder}
              onTogglePrompt={onTogglePrompt}
              selection={selection}
              t={t}
            />
          ))}
          {prompts.map((prompt) => (
            <li className="selection-row prompt-selection-row" key={prompt.id} role="treeitem">
              <span aria-hidden="true" className="selection-indent" />
              <input
                aria-label={prompt.title}
                checked={selection.promptIds.has(prompt.id)}
                onChange={() => onTogglePrompt(prompt)}
                type="checkbox"
              />
              <FileText aria-hidden="true" size={16} />
              <BidiText className="selection-label" fallbackDirection={fallbackDirection} text={prompt.title} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
});

interface SelectionTreeProps {
  folders: Folder[];
  prompts: Prompt[];
  selection: SelectionState;
  onChange: (selection: SelectionState) => void;
  fallbackDirection: TextDirection;
  t: Translator;
}

export function SelectionTree({ folders, prompts, selection, onChange, fallbackDirection, t }: SelectionTreeProps) {
  const indexes = useMemo(() => buildIndexes(folders, prompts), [folders, prompts]);
  const roots = indexes.childrenByParent.get(null) ?? [];

  const selectAncestors = useCallback((folderId: string, next: SelectionState) => {
    let currentId: string | null = folderId;
    while (currentId) {
      next.folderIds.add(currentId);
      currentId = indexes.folderById.get(currentId)?.parentId ?? null;
    }
  }, [indexes]);

  const toggleFolder = useCallback((folder: Folder) => {
    const subtree = collectFolderSubtree(folder.id, indexes);
    const fullySelected = [...subtree.folderIds].every((id) => selection.folderIds.has(id))
      && [...subtree.promptIds].every((id) => selection.promptIds.has(id));
    const next: SelectionState = {
      folderIds: new Set(selection.folderIds),
      promptIds: new Set(selection.promptIds),
    };
    if (fullySelected) {
      for (const id of subtree.folderIds) next.folderIds.delete(id);
      for (const id of subtree.promptIds) next.promptIds.delete(id);
    } else {
      for (const id of subtree.folderIds) next.folderIds.add(id);
      for (const id of subtree.promptIds) next.promptIds.add(id);
      selectAncestors(folder.id, next);
    }
    onChange(next);
  }, [indexes, onChange, selectAncestors, selection]);

  const togglePrompt = useCallback((prompt: Prompt) => {
    const next: SelectionState = {
      folderIds: new Set(selection.folderIds),
      promptIds: new Set(selection.promptIds),
    };
    if (next.promptIds.has(prompt.id)) {
      next.promptIds.delete(prompt.id);
    } else {
      next.promptIds.add(prompt.id);
      selectAncestors(prompt.folderId, next);
    }
    onChange(next);
  }, [indexes, onChange, selectAncestors, selection]);

  return (
    <ul aria-label={t("selectItems")} className="selection-tree" role="tree">
      {roots.map((folder) => (
        <FolderSelectionNode
          fallbackDirection={fallbackDirection}
          folder={folder}
          indexes={indexes}
          key={folder.id}
          onToggleFolder={toggleFolder}
          onTogglePrompt={togglePrompt}
          selection={selection}
          t={t}
        />
      ))}
    </ul>
  );
}
