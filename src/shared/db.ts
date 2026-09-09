import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import browser from "webextension-polyfill";
import type {
  AppSettings,
  AccentPalette,
  AttachmentBlob,
  ContextBlock,
  DatabaseSnapshot,
  DeletedBundle,
  ExportData,
  ExportDataV2,
  ExportPromptV1,
  Folder,
  Language,
  NoteAttachment,
  PortableAttachmentImage,
  Prompt,
  PromptSortMode,
  PromptVersion,
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
  contextBlocks: {
    key: string;
    value: ContextBlock;
    indexes: { "by-order": number; "by-updated": string };
  };
  promptVersions: {
    key: string;
    value: PromptVersion;
    indexes: { "by-prompt": string; "by-created": string };
  };
  attachmentBlobs: {
    key: string;
    value: AttachmentBlob;
    indexes: { "by-created": string };
  };
}

type DataTransaction = IDBPTransaction<PromptNestSchema, ("folders" | "prompts")[], "readwrite">;

const DB_NAME = "prompt-nest";
const DB_VERSION = 2;
const SETTINGS_KEY = "promptNestSettings";

let databasePromise: Promise<IDBPDatabase<PromptNestSchema>> | undefined;

function database() {
  databasePromise ??= openDB<PromptNestSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const folders = db.createObjectStore("folders", { keyPath: "id" });
        folders.createIndex("by-parent", "parentId");
        folders.createIndex("by-order", "order");

        const prompts = db.createObjectStore("prompts", { keyPath: "id" });
        prompts.createIndex("by-folder", "folderId");
        prompts.createIndex("by-order", "order");
        prompts.createIndex("by-updated", "updatedAt");
      }
      if (oldVersion < 2) {
        const contextBlocks = db.createObjectStore("contextBlocks", { keyPath: "id" });
        contextBlocks.createIndex("by-order", "order");
        contextBlocks.createIndex("by-updated", "updatedAt");

        const promptVersions = db.createObjectStore("promptVersions", { keyPath: "id" });
        promptVersions.createIndex("by-prompt", "promptId");
        promptVersions.createIndex("by-created", "createdAt");

        const attachmentBlobs = db.createObjectStore("attachmentBlobs", { keyPath: "id" });
        attachmentBlobs.createIndex("by-created", "createdAt");
      }
    },
  });
  return databasePromise;
}

function defaultLanguage(): Language {
  return navigator.language.toLowerCase().startsWith("fa") ? "fa" : "en";
}

function defaultTheme(): Theme { return "light"; }

const ACCENTS: AccentPalette[] = ["violet", "ocean", "sage", "terracotta"];
const PROMPT_SORTS: PromptSortMode[] = ["newest", "oldest", "name-asc", "name-desc", "most-used", "custom"];

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
    includeNotesInExport: value?.includeNotesInExport === true,
  };
}

export async function saveSettings(next: AppSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
}

export async function getSnapshot(): Promise<DatabaseSnapshot> {
  const db = await database();
  const [folders, storedPrompts, contextBlocks] = await Promise.all([
    db.getAll("folders"),
    db.getAll("prompts"),
    db.getAll("contextBlocks"),
  ]);
  const prompts = storedPrompts.map(normalizePrompt);
  void cleanupOrphanedPromptData(db).catch(() => undefined);
  return { folders, prompts, contextBlocks };
}

async function cleanupOrphanedPromptData(db: IDBPDatabase<PromptNestSchema>) {
  const tx = db.transaction(["prompts", "promptVersions", "attachmentBlobs"], "readwrite");
  const [storedPrompts, versions, storedBlobIds] = await Promise.all([
    tx.objectStore("prompts").getAll(),
    tx.objectStore("promptVersions").getAll(),
    tx.objectStore("attachmentBlobs").getAllKeys(),
  ]);
  const prompts = storedPrompts.map(normalizePrompt);
  const promptIds = new Set(prompts.map(({ id }) => id));
  const orphanedVersions = versions.filter(({ promptId }) => !promptIds.has(promptId));
  const retainedVersions = versions.filter(({ promptId }) => promptIds.has(promptId));
  const referencedBlobIds = new Set([
    ...prompts.flatMap(({ noteAttachments }) => noteAttachments),
    ...retainedVersions.flatMap((version) => version.kind === "note" ? version.noteAttachments : []),
  ].flatMap((attachment) => attachment.kind === "image" ? [attachment.blobId] : []));
  const orphanedBlobIds = storedBlobIds.filter((id) => !referencedBlobIds.has(id));
  if (orphanedVersions.length || orphanedBlobIds.length) {
    await Promise.all([
      ...orphanedVersions.map(({ id }) => tx.objectStore("promptVersions").delete(id)),
      ...orphanedBlobIds.map((id) => tx.objectStore("attachmentBlobs").delete(id)),
    ]);
  }
  await tx.done;
}

export function normalizePrompt(prompt: Partial<Prompt> & Pick<Prompt, "id" | "folderId" | "title" | "content" | "order" | "createdAt" | "updatedAt">): Prompt {
  return {
    ...prompt,
    favorite: prompt.favorite === true,
    usageCount: typeof prompt.usageCount === "number" && Number.isFinite(prompt.usageCount)
      ? Math.max(0, prompt.usageCount) : 0,
    tags: Array.isArray(prompt.tags) ? [...new Set(prompt.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map((tag) => tag.trim()))] : [],
    contextBlockIds: Array.isArray(prompt.contextBlockIds)
      ? [...new Set(prompt.contextBlockIds.filter((id): id is string => typeof id === "string" && Boolean(id)))] : [],
    note: typeof prompt.note === "string" ? prompt.note : "",
    noteAttachments: Array.isArray(prompt.noteAttachments) ? prompt.noteAttachments.filter(isNoteAttachment) : [],
  };
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

export async function persistContextBlocks(contextBlocks: ContextBlock[]): Promise<void> {
  if (!contextBlocks.length) return;
  const db = await database();
  const tx = db.transaction("contextBlocks", "readwrite");
  await Promise.all(contextBlocks.map((contextBlock) => tx.store.put(contextBlock)));
  await tx.done;
}

export async function deleteContextBlockWithDetachedPrompts(
  contextBlockId: string,
  detachedPrompts: Prompt[],
): Promise<void> {
  const db = await database();
  const tx = db.transaction(["contextBlocks", "prompts"], "readwrite");
  await Promise.all([
    tx.objectStore("contextBlocks").delete(contextBlockId),
    ...detachedPrompts.map((prompt) => tx.objectStore("prompts").put(prompt)),
  ]);
  await tx.done;
}

export async function restoreContextBlockWithPromptReferences(
  contextBlock: ContextBlock,
  restoredPrompts: Prompt[],
): Promise<void> {
  const db = await database();
  const tx = db.transaction(["contextBlocks", "prompts"], "readwrite");
  await Promise.all([
    tx.objectStore("contextBlocks").put(contextBlock),
    ...restoredPrompts.map((prompt) => tx.objectStore("prompts").put(prompt)),
  ]);
  await tx.done;
}

export async function persistAttachmentBlob(blob: AttachmentBlob): Promise<void> {
  await (await database()).put("attachmentBlobs", blob);
}

export async function getAttachmentBlob(id: string): Promise<AttachmentBlob | undefined> {
  return (await database()).get("attachmentBlobs", id);
}

export async function getPromptVersions(promptId: string): Promise<PromptVersion[]> {
  const versions = await (await database()).getAllFromIndex("promptVersions", "by-prompt", promptId);
  return versions.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

export async function savePromptEdits(
  previous: Prompt,
  next: Prompt,
  kinds: Array<"content" | "note">,
): Promise<void> {
  if (!kinds.length) {
    await persistPrompts([next]);
    return;
  }
  const timestamp = nowIso();
  const versions: PromptVersion[] = kinds.map((kind) => kind === "content"
    ? { id: createId(), promptId: previous.id, kind, content: previous.content, createdAt: timestamp }
    : {
        id: createId(),
        promptId: previous.id,
        kind,
        note: previous.note,
        noteAttachments: previous.noteAttachments,
        createdAt: timestamp,
      });
  const db = await database();
  const tx = db.transaction(["prompts", "promptVersions"], "readwrite");
  await Promise.all([
    tx.objectStore("prompts").put(next),
    ...versions.map((version) => tx.objectStore("promptVersions").put(version)),
  ]);
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
  return sortedByOrder((await db.getAllFromIndex("prompts", "by-folder", folderId)).map(normalizePrompt));
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
    favorite: false,
    usageCount: 0,
    tags: [],
    contextBlockIds: [],
    note: "",
    noteAttachments: [],
  };
  await (await database()).put("prompts", prompt);
  return prompt;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isIsoDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isOrder = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

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

function isPromptBase(value: unknown): value is ExportPromptV1 {
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

function isNoteAttachment(value: unknown): value is NoteAttachment {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !isIsoDate(value.createdAt)) return false;
  if (value.kind === "image") {
    return typeof value.blobId === "string"
      && typeof value.name === "string"
      && typeof value.mimeType === "string"
      && typeof value.caption === "string";
  }
  return value.kind === "reference"
    && typeof value.header === "string"
    && typeof value.location === "string";
}

function isPromptV2(value: unknown): value is Prompt {
  if (!isPromptBase(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return typeof record.favorite === "boolean"
    && typeof record.usageCount === "number" && Number.isFinite(record.usageCount)
    && isStringArray(record.tags)
    && isStringArray(record.contextBlockIds)
    && typeof record.note === "string"
    && Array.isArray(record.noteAttachments)
    && record.noteAttachments.every(isNoteAttachment);
}

function isContextBlock(value: unknown): value is ContextBlock {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.content === "string"
    && isOrder(value.order)
    && isIsoDate(value.createdAt)
    && isIsoDate(value.updatedAt);
}

function isPromptVersion(value: unknown): value is PromptVersion {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.promptId !== "string"
    || !isIsoDate(value.createdAt)) return false;
  if (value.kind === "content") return typeof value.content === "string";
  return value.kind === "note"
    && typeof value.note === "string"
    && Array.isArray(value.noteAttachments)
    && value.noteAttachments.every(isNoteAttachment);
}

function isPortableImage(value: unknown): value is PortableAttachmentImage {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.mimeType === "string" && value.mimeType.startsWith("image/")
    && isIsoDate(value.createdAt)
    && typeof value.dataUrl === "string"
    && value.dataUrl.startsWith("data:image/");
}

export function validateExportData(value: unknown): value is ExportData {
  if (!isRecord(value)
    || (value.schemaVersion !== 1 && value.schemaVersion !== 2)
    || !isIsoDate(value.exportedAt)
    || !Array.isArray(value.folders)
    || !value.folders.every(isFolder)
    || !Array.isArray(value.prompts)
    || !value.prompts.every(value.schemaVersion === 2 ? isPromptV2 : isPromptBase)
    || !isRecord(value.settings)
    || (value.settings.language !== "fa" && value.settings.language !== "en")
    || (value.settings.theme !== "light" && value.settings.theme !== "dark")) return false;

  if (value.schemaVersion === 2 && (
    !Array.isArray(value.contextBlocks)
    || !value.contextBlocks.every(isContextBlock)
    || !Array.isArray(value.promptVersions)
    || !value.promptVersions.every(isPromptVersion)
    || !Array.isArray(value.attachmentImages)
    || !value.attachmentImages.every(isPortableImage)
  )) return false;

  const folderIds = new Set(value.folders.map(({ id }) => id));
  if (folderIds.size !== value.folders.length) return false;
  if (new Set(value.prompts.map(({ id }) => id)).size !== value.prompts.length) return false;
  if (value.folders.some(({ parentId }) => parentId !== null && !folderIds.has(parentId))) return false;
  if (value.prompts.some(({ folderId }) => !folderIds.has(folderId))) return false;

  if (value.schemaVersion === 2) {
    const v2 = value as unknown as ExportDataV2;
    const promptIds = new Set(value.prompts.map(({ id }) => id));
    const contextIds = new Set(v2.contextBlocks.map(({ id }) => id));
    const versionIds = new Set(v2.promptVersions.map(({ id }) => id));
    const imageIds = new Set(v2.attachmentImages.map(({ id }) => id));

    if (contextIds.size !== v2.contextBlocks.length
      || versionIds.size !== v2.promptVersions.length
      || imageIds.size !== v2.attachmentImages.length) return false;

    if (v2.promptVersions.some(({ promptId }) => !promptIds.has(promptId))) return false;

    if (v2.prompts.some(({ contextBlockIds }) =>
      contextBlockIds.some((id) => !contextIds.has(id))
    )) return false;

    const attachments = [
      ...v2.prompts.flatMap(({ noteAttachments }) => noteAttachments),
      ...v2.promptVersions.flatMap((version) =>
        version.kind === "note" ? version.noteAttachments : []
      ),
    ];
    if (attachments.some((attachment) => attachment.kind === "image" && !imageIds.has(attachment.blobId))) return false;
  }

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

export function normalizeExportData(data: ExportData): ExportDataV2 {
  if (data.schemaVersion === 2) return data;
  return {
    ...data,
    schemaVersion: 2,
    prompts: data.prompts.map(normalizePrompt),
    contextBlocks: [],
    promptVersions: [],
    attachmentImages: [],
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const separator = dataUrl.indexOf(",");
  const metadata = dataUrl.slice(5, separator);
  const encoded = dataUrl.slice(separator + 1);
  const mimeType = metadata.split(";")[0] || "application/octet-stream";
  const binary = metadata.includes(";base64") ? atob(encoded) : decodeURIComponent(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

export async function createPortableExport(
  folders: Folder[],
  prompts: Prompt[],
  contextBlocks: ContextBlock[],
  settings: ExportDataV2["settings"],
  includeNotes: boolean,
): Promise<ExportDataV2> {
  const db = await database();
  const promptIds = new Set(prompts.map(({ id }) => id));
  const referencedContextIds = new Set(prompts.flatMap(({ contextBlockIds }) => contextBlockIds));
  const exportedPrompts = prompts.map((prompt) => includeNotes ? prompt : {
    ...prompt,
    note: "",
    noteAttachments: [],
  });
  const promptVersions = (await db.getAll("promptVersions"))
    .filter((version) => promptIds.has(version.promptId) && (includeNotes || version.kind !== "note"));
  const attachmentIds = new Set<string>();
  if (includeNotes) {
    for (const attachment of [
      ...exportedPrompts.flatMap(({ noteAttachments }) => noteAttachments),
      ...promptVersions.flatMap((version) => version.kind === "note" ? version.noteAttachments : []),
    ]) {
      if (attachment.kind === "image") attachmentIds.add(attachment.blobId);
    }
  }
  const storedImages = await Promise.all([...attachmentIds].map((id) => db.get("attachmentBlobs", id)));
  const attachmentImages: PortableAttachmentImage[] = [];
  for (const stored of storedImages) {
    if (!stored) continue;
    attachmentImages.push({
      id: stored.id,
      name: stored.name,
      mimeType: stored.mimeType,
      createdAt: stored.createdAt,
      dataUrl: await blobToDataUrl(stored.data),
    });
  }
  return {
    schemaVersion: 2,
    exportedAt: nowIso(),
    folders,
    prompts: exportedPrompts,
    contextBlocks: contextBlocks.filter(({ id }) => referencedContextIds.has(id)),
    promptVersions,
    attachmentImages,
    settings,
  };
}

export interface PreparedSharedImport {
  snapshot: DatabaseSnapshot;
  folders: Folder[];
  prompts: Prompt[];
  contextBlocks: ContextBlock[];
  promptVersions: PromptVersion[];
  attachmentBlobs: AttachmentBlob[];
}

function remapAttachments(attachments: NoteAttachment[], blobIdMap: ReadonlyMap<string, string>): NoteAttachment[] {
  return attachments.map((attachment) => attachment.kind === "image"
    ? { ...attachment, id: createId(), blobId: blobIdMap.get(attachment.blobId) ?? attachment.blobId }
    : { ...attachment, id: createId() });
}

export function prepareSharedImport(
  data: ExportDataV2,
  existing: DatabaseSnapshot,
  workspaceFolderId: string,
): PreparedSharedImport {
  const timestamp = nowIso();
  let sharedFolder = existing.folders.find(({ name, parentId }) => (
    name === "Shared Prompts" && parentId === workspaceFolderId
  ));
  const folders: Folder[] = [];
  if (!sharedFolder) {
    const siblings = existing.folders.filter(({ parentId }) => parentId === workspaceFolderId);
    sharedFolder = {
      id: createId(),
      name: "Shared Prompts",
      parentId: workspaceFolderId,
      order: siblings.length ? Math.max(...siblings.map(({ order }) => order)) + 1 : 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    folders.push(sharedFolder);
  }

  const contextIdMap = new Map(data.contextBlocks.map(({ id }) => [id, createId()]));
  const promptIdMap = new Map(data.prompts.map(({ id }) => [id, createId()]));
  const blobIdMap = new Map(data.attachmentImages.map(({ id }) => [id, createId()]));
  const startingContextOrder = existing.contextBlocks
    .reduce((maximum, { order }) => Math.max(maximum, order), -1) + 1;
  const contextBlocks = data.contextBlocks.map((block, order) => ({
    ...block,
    id: contextIdMap.get(block.id)!,
    order: startingContextOrder + order,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const startingOrder = existing.prompts.filter(({ folderId }) => folderId === sharedFolder.id)
    .reduce((maximum, { order }) => Math.max(maximum, order), -1) + 1;
  const prompts = data.prompts.map((sourcePrompt, index) => normalizePrompt({
    ...sourcePrompt,
    id: promptIdMap.get(sourcePrompt.id)!,
    folderId: sharedFolder!.id,
    order: startingOrder + index,
    createdAt: timestamp,
    updatedAt: timestamp,
    favorite: false,
    usageCount: 0,
    contextBlockIds: sourcePrompt.contextBlockIds.flatMap((id) => contextIdMap.get(id) ?? []),
    noteAttachments: remapAttachments(sourcePrompt.noteAttachments, blobIdMap),
  }));
  const promptVersions = data.promptVersions.flatMap((version): PromptVersion[] => {
    const promptId = promptIdMap.get(version.promptId);
    if (!promptId) return [];
    return [version.kind === "content"
      ? { ...version, id: createId(), promptId }
      : {
          ...version,
          id: createId(),
          promptId,
          noteAttachments: remapAttachments(version.noteAttachments, blobIdMap),
        }];
  });
  const attachmentBlobs = data.attachmentImages.map((image) => ({
    id: blobIdMap.get(image.id)!,
    name: image.name,
    mimeType: image.mimeType,
    createdAt: image.createdAt,
    data: dataUrlToBlob(image.dataUrl),
  }));
  return {
    folders,
    prompts,
    contextBlocks,
    promptVersions,
    attachmentBlobs,
    snapshot: {
      folders: [...existing.folders, ...folders],
      prompts: [...existing.prompts, ...prompts],
      contextBlocks: [...existing.contextBlocks, ...contextBlocks],
    },
  };
}

export async function persistSharedImport(prepared: PreparedSharedImport): Promise<void> {
  const db = await database();
  const tx = db.transaction(
    ["folders", "prompts", "contextBlocks", "promptVersions", "attachmentBlobs"],
    "readwrite",
  );
  await Promise.all([
    ...prepared.folders.map((folder) => tx.objectStore("folders").put(folder)),
    ...prepared.prompts.map((prompt) => tx.objectStore("prompts").put(prompt)),
    ...prepared.contextBlocks.map((block) => tx.objectStore("contextBlocks").put(block)),
    ...prepared.promptVersions.map((version) => tx.objectStore("promptVersions").put(version)),
    ...prepared.attachmentBlobs.map((blob) => tx.objectStore("attachmentBlobs").put(blob)),
  ]);
  await tx.done;
}
