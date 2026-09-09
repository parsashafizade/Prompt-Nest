import type { Folder, Prompt, PromptSortMode, TextDirection } from "./types";

export const nowIso = () => new Date().toISOString();

export const createId = () => crypto.randomUUID();

export function interfaceDirection(language: "fa" | "en"): TextDirection {
  return language === "fa" ? "rtl" : "ltr";
}

export function sortedByOrder<T extends { order: number; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function sortPrompts(prompts: Prompt[], mode: PromptSortMode): Prompt[] {
  const items = [...prompts];
  if (mode === "custom") return sortedByOrder(items);
  if (mode === "newest") return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (mode === "oldest") return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (mode === "most-used") return items.sort((a, b) => (
    b.usageCount - a.usageCount || b.createdAt.localeCompare(a.createdAt)
  ));
  return items.sort((a, b) => {
    const comparison = a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
    return mode === "name-asc" ? comparison : -comparison;
  });
}

export function getDescendantFolderIds(folders: Folder[], folderId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [folderId];
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const folder of folders) {
      if (folder.parentId === parentId && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        queue.push(folder.id);
      }
    }
  }
  return descendants;
}

export function isFolderMoveValid(folders: Folder[], folderId: string, nextParentId: string | null) {
  if (!nextParentId) return true;
  if (folderId === nextParentId) return false;
  return !getDescendantFolderIds(folders, folderId).has(nextParentId);
}
