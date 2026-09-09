import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import browser from "webextension-polyfill";
import type {
  AppSettings,
  AccentPalette,
  DatabaseSnapshot,
  DeletedBundle,
  ExportData,
  ExportSettings,
  Folder,
  Language,
  Prompt,
  PromptSortMode,
  Theme,
} from "./types";
import { createId, getDescendantFolderIds, isFolderMoveValid, nowIso, sortedByOrder } from "./utils";

interface PromptNestSchema extends DBSchema {
  folders: {
    key: string;
    value: Folder;
    indexes: { "by-parent": string; "by-order": number };
  };
  prompts: {
    key: string;
    value: Prompt;
    indexes: { "by-folder": string; "by-order": number; "by-updated": string };
  };
}

type DataTransaction = IDBPTransaction<PromptNestSchema, ("folders" | "prompts")[], "readwrite">;

const DB_NAME = "prompt-nest";
const DB_VERSION = 1;
const SETTINGS_KEY = "promptNestSettings";

let databasePromise: Promise<IDBPDatabase<PromptNestSchema>> | undefined;

function database() {
  databasePromise ??= openDB<PromptNestSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const folders = db.createObjectStore("folders", { keyPath: "id" });
      folders.createIndex("by-parent", "parentId");
      folders.createIndex("by-order", "order");

      const prompts = db.createObjectStore("prompts", { keyPath: "id" });
      prompts.createIndex("by-folder", "folderId");
      prompts.createIndex("by-order", "order");
      prompts.createIndex("by-updated", "updatedAt");
    },
  });
  return databasePromise;
}

function defaultLanguage(): Language {
  return navigator.language.toLowerCase().startsWith("fa") ? "fa" : "en";
}

function defaultTheme(): Theme {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const ACCENTS: AccentPalette[] = ["violet", "ocean", "sage", "terracotta"];
const PROMPT_SORTS: PromptSortMode[] = ["newest", "oldest", "name-asc", "name-desc", "custom"];

export async function getSettings(): Promise<AppSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const value = stored[SETTINGS_KEY] as Partial<AppSettings> | undefined;
  return {
    language: value?.language === "fa" || value?.language === "en" ? value.language : defaultLanguage(),
    theme: value?.theme === "dark" || value?.theme === "light" ? value.theme : defaultTheme(),
    onboardingComplete: value?.onboardingComplete === true,
    accent: ACCENTS.includes(value?.accent as AccentPalette) ? value?.accent as AccentPalette : "violet",
    promptSort: PROMPT_SORTS.includes(value?.promptSort as PromptSortMode)
      ? value?.promptSort as PromptSortMode
      : "newest",
    workspaceFolderId: typeof value?.workspaceFolderId === "string" ? value.workspaceFolderId : undefined,
  };
}

export async function saveSettings(next: AppSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}

export async function getSnapshot(): Promise<DatabaseSnapshot> {
  const db = await database();
  const [folders, prompts] = await Promise.all([db.getAll("folders"), db.getAll("prompts")]);
  return { folders, prompts };
}

export async function persistFolders(folders: Folder[]): Promise<void> {
  if (!folders.length) return;
  const db = await database();
  const tx = db.transaction("folders", "readwrite");
  await Promise.all(folders.map((folder) => tx.store.put(folder)));
  await tx.done;
}

export async function persistPrompts(prompts: Prompt[]): Promise<void> {
  if (!prompts.length) return;
  const db = await database();
  const tx = db.transaction("prompts", "readwrite");
  await Promise.all(prompts.map((prompt) => tx.store.put(prompt)));
  await tx.done;
}

export async function removeDeletedBundle(bundle: DeletedBundle): Promise<void> {
  const db = await database();
  const tx = db.transaction(["folders", "prompts"], "readwrite");
  await Promise.all([
    ...bundle.folders.map(({ id }) => tx.objectStore("folders").delete(id)),
    ...bundle.prompts.map(({ id }) => tx.objectStore("prompts").delete(id)),
  ]);
  await tx.done;
}

export async function getFoldersByParent(parentId: string | null): Promise<Folder[]> {
  const db = await database();
  const folders = parentId === null
    ? (await db.getAll("folders")).filter((folder) => folder.parentId === null)
    : await db.getAllFromIndex("folders", "by-parent", parentId);
  return sortedByOrder(folders);
}

export async function getPromptsByFolder(folderId: string): Promise<Prompt[]> {
  const db = await database();
  return sortedByOrder(await db.getAllFromIndex("prompts", "by-folder", folderId));
}

export async function addFolder(name: string, parentId: string | null): Promise<Folder> {
  const siblings = await getFoldersByParent(parentId);
  const timestamp = nowIso();
  const folder: Folder = {
    id: createId(),
    name: name.trim(),
    parentId,
    order: siblings.length ? Math.max(...siblings.map(({ order }) => order)) + 1 : 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await (await database()).put("folders", folder);
  return folder;
}

export async function addPrompt(folderId: string, title: string, content: string): Promise<Prompt> {
  const siblings = await getPromptsByFolder(folderId);
  const timestamp = nowIso();
  const prompt: Prompt = {
    id: createId(),
    folderId,
    title: title.trim(),
    content,
    order: siblings.length ? Math.max(...siblings.map(({ order }) => order)) + 1 : 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await (await database()).put("prompts", prompt);
  return prompt;
}

export async function updateFolder(id: string, patch: Pick<Partial<Folder>, "name">): Promise<void> {
  const db = await database();
  const folder = await db.get("folders", id);
  if (!folder) return;
  await db.put("folders", { ...folder, ...patch, name: patch.name?.trim() ?? folder.name, updatedAt: nowIso() });
}

export async function updatePrompt(
  id: string,
  patch: Pick<Partial<Prompt>, "title" | "content">,
): Promise<void> {
  const db = await database();
  const prompt = await db.get("prompts", id);
  if (!prompt) return;
  await db.put("prompts", {
    ...prompt,
    ...patch,
    title: patch.title?.trim() ?? prompt.title,
    updatedAt: nowIso(),
  });
}

async function putOrderedFolders(tx: DataTransaction, folders: Folder[], movedId: string) {
  const timestamp = nowIso();
  await Promise.all(folders.map((folder, order) => {
    const changed = folder.order !== order || folder.id === movedId;
    return tx.objectStore("folders").put({
      ...folder,
      order,
      updatedAt: changed ? timestamp : folder.updatedAt,
    });
  }));
}

export async function moveFolder(
  folderId: string,
  nextParentId: string | null,
  destinationIndex?: number,
): Promise<boolean> {
  const db = await database();
  const folders = await db.getAll("folders");
  if (!isFolderMoveValid(folders, folderId, nextParentId)) return false;
  const moving = folders.find(({ id }) => id === folderId);
  if (!moving) return false;

  const sourceSiblings = sortedByOrder(folders.filter(
    ({ parentId, id }) => parentId === moving.parentId && id !== folderId,
  ));
  const destinationSiblings = sortedByOrder(folders.filter(
    ({ parentId, id }) => parentId === nextParentId && id !== folderId,
  ));
  const insertAt = Math.max(0, Math.min(destinationIndex ?? destinationSiblings.length, destinationSiblings.length));
  destinationSiblings.splice(insertAt, 0, { ...moving, parentId: nextParentId });

  const tx = db.transaction(["folders", "prompts"], "readwrite");
  if (moving.parentId !== nextParentId) await putOrderedFolders(tx, sourceSiblings, folderId);
  await putOrderedFolders(tx, destinationSiblings, folderId);
  await tx.done;
  return true;
}

export async function movePrompt(
  promptId: string,
  nextFolderId: string,
  destinationIndex?: number,
): Promise<boolean> {
  const db = await database();
  const [moving, folder, prompts] = await Promise.all([
    db.get("prompts", promptId),
    db.get("folders", nextFolderId),
    db.getAll("prompts"),
  ]);
  if (!moving || !folder) return false;

  const source = sortedByOrder(prompts.filter(({ folderId, id }) => folderId === moving.folderId && id !== promptId));
  const destination = sortedByOrder(prompts.filter(({ folderId, id }) => folderId === nextFolderId && id !== promptId));
  const insertAt = Math.max(0, Math.min(destinationIndex ?? destination.length, destination.length));
  destination.splice(insertAt, 0, { ...moving, folderId: nextFolderId });
  const timestamp = nowIso();
  const tx = db.transaction(["folders", "prompts"], "readwrite");
  if (moving.folderId !== nextFolderId) {
    await Promise.all(source.map((prompt, order) => tx.objectStore("prompts").put({
      ...prompt,
      order,
      updatedAt: prompt.order === order ? prompt.updatedAt : timestamp,
    })));
  }
  await Promise.all(destination.map((prompt, order) => tx.objectStore("prompts").put({
    ...prompt,
    order,
    updatedAt: prompt.order === order && prompt.id !== promptId ? prompt.updatedAt : timestamp,
  })));
  await tx.done;
  return true;
}

export async function deletePrompt(id: string): Promise<DeletedBundle> {
  const db = await database();
  const prompt = await db.get("prompts", id);
  if (!prompt) return { folders: [], prompts: [] };
  await db.delete("prompts", id);
  return { folders: [], prompts: [prompt] };
}

export async function deleteFolderSubtree(folderId: string): Promise<DeletedBundle> {
  const db = await database();
  const [folders, prompts] = await Promise.all([db.getAll("folders"), db.getAll("prompts")]);
  const allIds = getDescendantFolderIds(folders, folderId);
  allIds.add(folderId);
  const deletedFolders = folders.filter(({ id }) => allIds.has(id));
  const deletedPrompts = prompts.filter(({ folderId: id }) => allIds.has(id));
  const tx = db.transaction(["folders", "prompts"], "readwrite");
  await Promise.all([
    ...deletedFolders.map(({ id }) => tx.objectStore("folders").delete(id)),
    ...deletedPrompts.map(({ id }) => tx.objectStore("prompts").delete(id)),
  ]);
  await tx.done;
  return { folders: deletedFolders, prompts: deletedPrompts };
}

export async function restoreDeleted(bundle: DeletedBundle): Promise<void> {
  const db = await database();
  const tx = db.transaction(["folders", "prompts"], "readwrite");
  await Promise.all([
    ...bundle.folders.map((folder) => tx.objectStore("folders").put(folder)),
    ...bundle.prompts.map((prompt) => tx.objectStore("prompts").put(prompt)),
  ]);
  await tx.done;
}

export async function createExportData(): Promise<ExportData> {
  const [{ folders, prompts }, settings] = await Promise.all([getSnapshot(), getSettings()]);
  return {
    schemaVersion: 1,
    exportedAt: nowIso(),
    folders,
    prompts,
    settings: { language: settings.language, theme: settings.theme },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isIsoDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isOrder = (value: unknown) => typeof value === "number" && Number.isFinite(value);

function isFolder(value: unknown): value is Folder {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.length > 0
    && typeof value.name === "string"
    && (typeof value.parentId === "string" || value.parentId === null)
    && isOrder(value.order)
    && isIsoDate(value.createdAt)
    && isIsoDate(value.updatedAt);
}

function isPrompt(value: unknown): value is Prompt {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.length > 0
    && typeof value.folderId === "string"
    && typeof value.title === "string"
    && typeof value.content === "string"
    && isOrder(value.order)
    && isIsoDate(value.createdAt)
    && isIsoDate(value.updatedAt);
}

export function validateExportData(value: unknown): value is ExportData {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || !isIsoDate(value.exportedAt)
    || !Array.isArray(value.folders)
    || !value.folders.every(isFolder)
    || !Array.isArray(value.prompts)
    || !value.prompts.every(isPrompt)
    || !isRecord(value.settings)
    || (value.settings.language !== "fa" && value.settings.language !== "en")
    || (value.settings.theme !== "light" && value.settings.theme !== "dark")) return false;

  const folderIds = new Set(value.folders.map(({ id }) => id));
  if (folderIds.size !== value.folders.length) return false;
  if (new Set(value.prompts.map(({ id }) => id)).size !== value.prompts.length) return false;
  if (value.folders.some(({ parentId }) => parentId !== null && !folderIds.has(parentId))) return false;
  if (value.prompts.some(({ folderId }) => !folderIds.has(folderId))) return false;

  const parentById = new Map(value.folders.map(({ id, parentId }) => [id, parentId]));
  for (const folder of value.folders) {
    const seen = new Set<string>([folder.id]);
    let parentId = folder.parentId;
    while (parentId) {
      if (seen.has(parentId)) return false;
      seen.add(parentId);
      parentId = parentById.get(parentId) ?? null;
    }
  }
  return true;
}

export async function replaceWithImport(data: ExportData): Promise<AppSettings> {
  await replaceDatabaseData(data);
  const current = await getSettings();
  const next = { ...current, ...data.settings };
  await saveSettings(next);
  return next;
}

export async function replaceDatabaseData(data: Pick<ExportData, "folders" | "prompts">): Promise<void> {
  const db = await database();
  const tx = db.transaction(["folders", "prompts"], "readwrite");
  await tx.objectStore("folders").clear();
  await tx.objectStore("prompts").clear();
  await Promise.all([
    ...data.folders.map((folder) => tx.objectStore("folders").put(folder)),
    ...data.prompts.map((prompt) => tx.objectStore("prompts").put(prompt)),
  ]);
  await tx.done;
}

export interface PreparedMergeImport {
  snapshot: DatabaseSnapshot;
  folders: Folder[];
  prompts: Prompt[];
}

export function prepareMergeImport(data: ExportData, existing: DatabaseSnapshot): PreparedMergeImport {
  const idMap = new Map(data.folders.map(({ id }) => [id, createId()]));
  const timestamp = nowIso();
  const currentRootMax = existing.folders
    .filter(({ parentId }) => parentId === null)
    .reduce((maximum, { order }) => Math.max(maximum, order), -1);
  const importedRoots = sortedByOrder(data.folders.filter(({ parentId }) => parentId === null));
  const rootRank = new Map(importedRoots.map(({ id }, index) => [id, index]));
  const folders: Folder[] = data.folders.map((folder) => ({
    ...folder,
    id: idMap.get(folder.id)!,
    parentId: folder.parentId ? idMap.get(folder.parentId)! : null,
    order: folder.parentId === null ? currentRootMax + 1 + rootRank.get(folder.id)! : folder.order,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const prompts: Prompt[] = data.prompts.map((prompt) => ({
    ...prompt,
    id: createId(),
    folderId: idMap.get(prompt.folderId)!,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  return {
    folders,
    prompts,
    snapshot: {
      folders: [...existing.folders, ...folders],
      prompts: [...existing.prompts, ...prompts],
    },
  };
}

export async function mergeImport(data: ExportData): Promise<void> {
  const prepared = prepareMergeImport(data, await getSnapshot());
  const db = await database();
  const tx = db.transaction(["folders", "prompts"], "readwrite");
  await Promise.all([
    ...prepared.folders.map((folder) => tx.objectStore("folders").put(folder)),
    ...prepared.prompts.map((prompt) => tx.objectStore("prompts").put(prompt)),
  ]);
  await tx.done;
}

export function exportSettingsOnly(settings: AppSettings): ExportSettings {
  return { language: settings.language, theme: settings.theme };
}
