import { ArrowLeft, Blocks, FolderPlus, Folders, Pencil, Plus, Settings } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  deleteContextBlockWithDetachedPrompts,
  getSettings,
  getSnapshot,
  persistAttachmentBlob,
  persistContextBlocks,
  persistFolders,
  persistPrompts,
  persistSharedImport,
  prepareSharedImport,
  removeDeletedBundle,
  restoreContextBlockWithPromptReferences,
  restoreDeleted,
  savePromptEdits,
  saveSettings,
} from "../shared/db";
import { consumePendingPromptDraft } from "../shared/pendingPromptDraft";
import { composePromptSource, getPromptVariableNames, substitutePromptVariables } from "../shared/promptOutput";
import en from "../shared/i18n/en.json";
import fa from "../shared/i18n/fa.json";
import type {
  AccentPalette,
  AppSettings,
  ContextBlock,
  DatabaseSnapshot,
  DeletedContextBlockBundle,
  DeletedBundle,
  DragPayload,
  ExportDataV2,
  Folder,
  FolderDropPosition,
  Language,
  ImageNoteAttachment,
  Prompt,
  PromptSortMode,
  PromptVersion,
  Theme,
  Translator,
} from "../shared/types";
import { createId, getDescendantFolderIds, interfaceDirection, isFolderMoveValid, nowIso, sortedByOrder } from "../shared/utils";
import { BidiText } from "./components/BidiText";
import { ConfirmUndoSnackbar } from "./components/ConfirmUndoSnackbar";
import { DragDropTree } from "./components/DragDropTree";
import { FolderTree } from "./components/FolderTree";
import { ItemFormModal } from "./components/ItemFormModal";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { PromptList } from "./components/PromptList";
import { PromptSortMenu } from "./components/PromptSortMenu";
import { SearchBar, type SearchFields } from "./components/SearchBar";

const SettingsPanel = lazy(() => import("./components/SettingsPanel").then((module) => ({
  default: module.SettingsPanel,
})));
const PromptDetailActions = lazy(() => import("./components/PromptDetailActions").then((module) => ({
  default: module.PromptDetailActions,
})));
const ContextBlocksPanel = lazy(() => import("./components/ContextBlocksPanel").then((module) => ({
  default: module.ContextBlocksPanel,
})));
const VariableFillModal = lazy(() => import("./components/VariableFillModal").then((module) => ({
  default: module.VariableFillModal,
})));

type FormState =
  | { kind: "folder"; mode: "add"; parentId: string | null }
  | { kind: "folder"; mode: "rename"; folder: Folder }
  | { kind: "prompt"; mode: "add"; folderId: string; initialContent?: string; chooseFolder?: boolean }
  | { kind: "prompt"; mode: "rename"; prompt: Prompt };

interface SnackbarState {
  id: number;
  message: string;
  deleted?: DeletedBundle;
  deletedContext?: DeletedContextBlockBundle;
}

interface PendingCopy {
  promptId: string;
  source: string;
  names: string[];
  resolve: (copied: boolean) => void;
}

type SnapshotAction = { type: "replace"; snapshot: DatabaseSnapshot };

interface MoveResult<T> {
  snapshot: DatabaseSnapshot;
  changed: T[];
}

const EMPTY_SNAPSHOT: DatabaseSnapshot = { folders: [], prompts: [], contextBlocks: [] };
const dictionaries = { en, fa } as const;

function snapshotReducer(_state: DatabaseSnapshot, action: SnapshotAction) {
  return action.snapshot;
}

function replaceFolderRecords(snapshot: DatabaseSnapshot, replacements: Folder[]) {
  const byId = new Map(replacements.map((folder) => [folder.id, folder]));
  return { ...snapshot, folders: snapshot.folders.map((folder) => byId.get(folder.id) ?? folder) };
}

function replacePromptRecords(snapshot: DatabaseSnapshot, replacements: Prompt[]) {
  const byId = new Map(replacements.map((prompt) => [prompt.id, prompt]));
  return { ...snapshot, prompts: snapshot.prompts.map((prompt) => byId.get(prompt.id) ?? prompt) };
}

function moveFolderInMemory(
  snapshot: DatabaseSnapshot,
  folderId: string,
  nextParentId: string | null,
  destinationIndex?: number,
): MoveResult<Folder> | null {
  if (!isFolderMoveValid(snapshot.folders, folderId, nextParentId)) return null;
  const moving = snapshot.folders.find(({ id }) => id === folderId);
  if (!moving) return null;
  const timestamp = nowIso();
  const source = sortedByOrder(snapshot.folders.filter(
    ({ parentId, id }) => parentId === moving.parentId && id !== folderId,
  ));
  const destination = sortedByOrder(snapshot.folders.filter(
    ({ parentId, id }) => parentId === nextParentId && id !== folderId,
  ));
  const insertAt = Math.max(0, Math.min(destinationIndex ?? destination.length, destination.length));
  destination.splice(insertAt, 0, { ...moving, parentId: nextParentId });
  const changedById = new Map<string, Folder>();
  const normalize = (folders: Folder[], parentId: string | null) => {
    folders.forEach((folder, order) => {
      const parentChanged = folder.parentId !== parentId;
      const orderChanged = folder.order !== order;
      if (parentChanged || orderChanged || folder.id === folderId) {
        changedById.set(folder.id, { ...folder, parentId, order, updatedAt: timestamp });
      }
    });
  };
  if (moving.parentId !== nextParentId) normalize(source, moving.parentId);
  normalize(destination, nextParentId);
  const changed = [...changedById.values()];
  return { snapshot: replaceFolderRecords(snapshot, changed), changed };
}

function movePromptInMemory(
  snapshot: DatabaseSnapshot,
  promptId: string,
  nextFolderId: string,
  destinationIndex?: number,
): MoveResult<Prompt> | null {
  const moving = snapshot.prompts.find(({ id }) => id === promptId);
  if (!moving || !snapshot.folders.some(({ id }) => id === nextFolderId)) return null;
  const timestamp = nowIso();
  const source = sortedByOrder(snapshot.prompts.filter(
    ({ folderId, id }) => folderId === moving.folderId && id !== promptId,
  ));
  const destination = sortedByOrder(snapshot.prompts.filter(
    ({ folderId, id }) => folderId === nextFolderId && id !== promptId,
  ));
  const insertAt = Math.max(0, Math.min(destinationIndex ?? destination.length, destination.length));
  destination.splice(insertAt, 0, { ...moving, folderId: nextFolderId });
  const changedById = new Map<string, Prompt>();
  const normalize = (prompts: Prompt[], folderId: string) => {
    prompts.forEach((prompt, order) => {
      const folderChanged = prompt.folderId !== folderId;
      const orderChanged = prompt.order !== order;
      if (folderChanged || orderChanged || prompt.id === promptId) {
        changedById.set(prompt.id, { ...prompt, folderId, order, updatedAt: timestamp });
      }
    });
  };
  if (moving.folderId !== nextFolderId) normalize(source, moving.folderId);
  normalize(destination, nextFolderId);
  const changed = [...changedById.values()];
  return { snapshot: replacePromptRecords(snapshot, changed), changed };
}

function findWorkspaceFolder(folders: Folder[], requestedId?: string) {
  if (requestedId) {
    const requested = folders.find(({ id, parentId }) => id === requestedId && parentId === null);
    if (requested) return requested;
  }
  return sortedByOrder(folders.filter(({ parentId, name }) => (
    parentId === null && (name === "Folders" || name === "پوشه‌ها")
  )))[0] ?? null;
}

export default function App() {
  const [snapshot, dispatchSnapshot] = useReducer(snapshotReducer, EMPTY_SNAPSHOT);
  const snapshotRef = useRef(snapshot);
  const initialLoadRef = useRef<Promise<[DatabaseSnapshot, AppSettings]> | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchFields, setSearchFields] = useState<SearchFields>({ titles: true, content: true, notes: false });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextBlocksOpen, setContextBlocksOpen] = useState(false);
  const [contextBlockEditId, setContextBlockEditId] = useState<string | undefined>();
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const [pendingCopy, setPendingCopy] = useState<PendingCopy | null>(null);
  const [pendingDraftContent, setPendingDraftContent] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const commitSnapshot = useCallback((next: DatabaseSnapshot) => {
    snapshotRef.current = next;
    dispatchSnapshot({ type: "replace", snapshot: next });
  }, []);

  const t = useCallback<Translator>((key, variables) => {
    const language = settings?.language ?? "en";
    let value = (dictionaries[language] as Record<string, string>)[key] ?? key;
    for (const [name, replacement] of Object.entries(variables ?? {})) {
      value = value.replaceAll(`{{${name}}}`, String(replacement));
    }
    return value;
  }, [settings?.language]);

  const showNotice = useCallback((message: string, deleted?: DeletedBundle, deletedContext?: DeletedContextBlockBundle) => {
    setSnackbar({ id: Date.now(), message, deleted, deletedContext });
  }, []);

  const persistOperation = useCallback((operation: Promise<unknown>) => {
    void operation.catch(() => showNotice(t("saveFailed")));
  }, [showNotice, t]);

  const applySettingsPatch = useCallback(async (patch: Partial<AppSettings>) => {
    if (!settingsRef.current) return;
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    persistOperation(saveSettings(next));
  }, [persistOperation]);

  useEffect(() => {
    let active = true;
    initialLoadRef.current ??= Promise.all([getSnapshot(), getSettings()]);
    initialLoadRef.current.then(([nextSnapshot, storedSettings]) => {
      if (!active) return;
      const workspace = findWorkspaceFolder(nextSnapshot.folders, storedSettings.workspaceFolderId);
      const nextSettings = workspace && workspace.id !== storedSettings.workspaceFolderId
        ? { ...storedSettings, workspaceFolderId: workspace.id }
        : storedSettings;
      commitSnapshot(nextSnapshot);
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      if (nextSettings !== storedSettings) void saveSettings(nextSettings);
    }).catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [commitSnapshot]);

  useEffect(() => {
    let active = true;
    void consumePendingPromptDraft().then((draft) => {
      if (active && draft) setPendingDraftContent(draft.content);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedQuery(query.trim().toLocaleLowerCase()), 200);
    return () => globalThis.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.lang = settings.language;
    document.documentElement.dir = interfaceDirection(settings.language);
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    document.documentElement.dataset.accent = settings.accent;
  }, [settings]);

  useEffect(() => {
    if (!snackbar) return;
    const timer = globalThis.setTimeout(() => setSnackbar(null), 5000);
    return () => globalThis.clearTimeout(timer);
  }, [snackbar]);

  useEffect(() => {
    const closeTopLayer = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pendingCopy) {
        pendingCopy.resolve(false);
        setPendingCopy(null);
      } else if (form) setForm(null);
      else if (selectedPromptId) setSelectedPromptId(null);
      else if (contextBlocksOpen) setContextBlocksOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeTopLayer);
    return () => window.removeEventListener("keydown", closeTopLayer);
  }, [contextBlocksOpen, form, pendingCopy, selectedPromptId, settingsOpen]);

  const fallbackDirection = interfaceDirection(settings?.language ?? "en");
  const workspaceFolder = useMemo(
    () => findWorkspaceFolder(snapshot.folders, settings?.workspaceFolderId),
    [settings?.workspaceFolderId, snapshot.folders],
  );
  const homeParentId = workspaceFolder?.id ?? null;
  const browsingParentId = currentFolderId ?? homeParentId;
  const currentFolder = useMemo(
    () => snapshot.folders.find(({ id }) => id === currentFolderId) ?? null,
    [currentFolderId, snapshot.folders],
  );
  const selectedPrompt = useMemo(
    () => snapshot.prompts.find(({ id }) => id === selectedPromptId) ?? null,
    [selectedPromptId, snapshot.prompts],
  );
  const visibleFolders = useMemo(() => {
    const directChildren = snapshot.folders.filter(({ parentId }) => parentId === browsingParentId);
    if (currentFolderId || !workspaceFolder) return directChildren;
    const legacyTopLevel = snapshot.folders.filter(({ id, parentId }) => (
      parentId === null && id !== workspaceFolder.id
    ));
    return [...directChildren, ...legacyTopLevel];
  }, [browsingParentId, currentFolderId, snapshot.folders, workspaceFolder]);
  const visiblePrompts = useMemo(
    () => browsingParentId ? snapshot.prompts.filter(({ folderId }) => folderId === browsingParentId) : [],
    [browsingParentId, snapshot.prompts],
  );
  const scopedFolderIds = useMemo(() => {
    if (!currentFolderId) return null;
    const ids = getDescendantFolderIds(snapshot.folders, currentFolderId);
    ids.add(currentFolderId);
    return ids;
  }, [currentFolderId, snapshot.folders]);

  useEffect(() => {
    if (!pendingDraftContent || !settings?.onboardingComplete || !workspaceFolder) return;
    setForm({
      kind: "prompt",
      mode: "add",
      folderId: workspaceFolder.id,
      initialContent: pendingDraftContent,
      chooseFolder: true,
    });
    setPendingDraftContent(null);
  }, [pendingDraftContent, settings?.onboardingComplete, workspaceFolder]);

  const scopedPrompts = useMemo(() => snapshot.prompts.filter((prompt) => (
    !scopedFolderIds || scopedFolderIds.has(prompt.folderId)
  )), [scopedFolderIds, snapshot.prompts]);
  const availableTags = useMemo(() => [...new Set([...selectedTags, ...scopedPrompts.flatMap(({ tags }) => tags)])]
    .sort((first, second) => first.localeCompare(second)), [scopedPrompts, selectedTags]);
  const filterMode = Boolean(debouncedQuery || favoritesOnly || selectedTags.length);

  const searchResults = useMemo(() => {
    return scopedPrompts
      .map((prompt) => {
        const normalizedTags = prompt.tags.map((tag) => tag.toLocaleLowerCase());
        const titleMatches = searchFields.titles && prompt.title.toLocaleLowerCase().includes(debouncedQuery);
        const contentMatches = searchFields.content && prompt.content.toLocaleLowerCase().includes(debouncedQuery);
        const tagTextMatches = normalizedTags.some((tag) => tag.includes(debouncedQuery));
        const noteAttachmentText = prompt.noteAttachments.map((attachment) => attachment.kind === "image"
          ? attachment.caption : `${attachment.header}\n${attachment.location}`).join("\n");
        const noteMatches = searchFields.notes
          && `${prompt.note}\n${noteAttachmentText}`.toLocaleLowerCase().includes(debouncedQuery);
        const queryMatches = !debouncedQuery || titleMatches || contentMatches || tagTextMatches || noteMatches;
        const tagsMatch = selectedTags.every((tag) => prompt.tags.includes(tag));
        const favoriteMatches = !favoritesOnly || prompt.favorite;
        return { prompt, score: titleMatches ? 0 : contentMatches ? 1 : tagTextMatches ? 2 : noteMatches ? 3 : 4, matches: queryMatches && tagsMatch && favoriteMatches };
      })
      .filter(({ matches }) => matches)
      .sort((a, b) => a.score - b.score || b.prompt.createdAt.localeCompare(a.prompt.createdAt))
      .map(({ prompt }) => prompt);
  }, [debouncedQuery, favoritesOnly, scopedPrompts, searchFields.content, searchFields.notes, searchFields.titles, selectedTags]);

  const finishOnboarding = useCallback(async () => {
    if (snapshotRef.current.folders.length === 0) {
      const timestamp = nowIso();
      const workspace: Folder = {
        id: createId(),
        name: "Folders",
        parentId: null,
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      commitSnapshot({ ...snapshotRef.current, folders: [workspace] });
      persistOperation(persistFolders([workspace]));
      await applySettingsPatch({ onboardingComplete: true, workspaceFolderId: workspace.id });
      return;
    }
    await applySettingsPatch({ onboardingComplete: true });
  }, [applySettingsPatch, commitSnapshot, persistOperation]);

  const changeLanguage = useCallback((language: Language) => applySettingsPatch({ language }), [applySettingsPatch]);
  const changeTheme = useCallback((theme: Theme) => applySettingsPatch({ theme }), [applySettingsPatch]);
  const changeAccent = useCallback((accent: AccentPalette) => applySettingsPatch({ accent }), [applySettingsPatch]);
  const changeSort = useCallback((promptSort: PromptSortMode) => applySettingsPatch({ promptSort }), [applySettingsPatch]);
  const changeIncludeNotesInExport = useCallback((includeNotesInExport: boolean) => applySettingsPatch({ includeNotesInExport }), [applySettingsPatch]);
  const toggleSearchField = useCallback((field: keyof SearchFields) => {
    setSearchFields((current) => {
      if (field === "notes") return { ...current, notes: !current.notes };
      const other = field === "titles" ? "content" : "titles";
      if (current[field] && !current[other]) return current;
      return { ...current, [field]: !current[field] };
    });
  }, []);
  const toggleTag = useCallback((tag: string) => setSelectedTags((current) => current.includes(tag)
    ? current.filter((item) => item !== tag) : [...current, tag]), []);
  const toggleFavorites = useCallback(() => setFavoritesOnly((current) => !current), []);

  const navigateBack = useCallback(() => {
    const current = snapshotRef.current.folders.find(({ id }) => id === currentFolderId);
    setCurrentFolderId(!current || current.parentId === homeParentId ? null : current.parentId);
  }, [currentFolderId, homeParentId]);
  const openFolder = useCallback((folderId: string) => setCurrentFolderId(folderId), []);
  const openPrompt = useCallback((prompt: Prompt) => setSelectedPromptId(prompt.id), []);
  const renameFolder = useCallback((folder: Folder) => setForm({ kind: "folder", mode: "rename", folder }), []);
  const renamePrompt = useCallback((prompt: Prompt) => setForm({ kind: "prompt", mode: "rename", prompt }), []);
  const clearDrag = useCallback(() => setActiveDrag(null), []);

  const deleteFolderNow = useCallback((folder: Folder) => {
    const current = snapshotRef.current;
    const folderIds = getDescendantFolderIds(current.folders, folder.id);
    folderIds.add(folder.id);
    const deleted: DeletedBundle = {
      folders: current.folders.filter(({ id }) => folderIds.has(id)),
      prompts: current.prompts.filter(({ folderId }) => folderIds.has(folderId)),
    };
    commitSnapshot({
      ...current,
      folders: current.folders.filter(({ id }) => !folderIds.has(id)),
      prompts: current.prompts.filter(({ folderId }) => !folderIds.has(folderId)),
    });
    setCurrentFolderId((currentId) => (
      currentId && folderIds.has(currentId) ? (folder.parentId === homeParentId ? null : folder.parentId) : currentId
    ));
    persistOperation(removeDeletedBundle(deleted));
    showNotice(t("deletedFolder"), deleted);
  }, [commitSnapshot, homeParentId, persistOperation, showNotice, t]);

  const deletePromptNow = useCallback((prompt: Prompt) => {
    const current = snapshotRef.current;
    const deleted: DeletedBundle = { folders: [], prompts: [prompt] };
    commitSnapshot({ ...current, prompts: current.prompts.filter(({ id }) => id !== prompt.id) });
    setSelectedPromptId((currentId) => currentId === prompt.id ? null : currentId);
    persistOperation(removeDeletedBundle(deleted));
    showNotice(t("deletedPrompt"), deleted);
  }, [commitSnapshot, persistOperation, showNotice, t]);

  const undoDelete = useCallback(() => {
    if (snackbar?.deletedContext) {
      const current = snapshotRef.current;
      const restored = snackbar.deletedContext;
      const currentPromptsById = new Map(current.prompts.map((prompt) => [prompt.id, prompt]));
      const restoredPrompts = restored.promptsBeforeDetach.flatMap((previousPrompt) => {
        const currentPrompt = currentPromptsById.get(previousPrompt.id);
        if (!currentPrompt || currentPrompt.contextBlockIds.includes(restored.contextBlock.id)) return [];
        const previousIndex = previousPrompt.contextBlockIds.indexOf(restored.contextBlock.id);
        const contextBlockIds = [...currentPrompt.contextBlockIds];
        contextBlockIds.splice(Math.min(Math.max(previousIndex, 0), contextBlockIds.length), 0, restored.contextBlock.id);
        return [{ ...currentPrompt, contextBlockIds, updatedAt: nowIso() }];
      });
      commitSnapshot({
        ...replacePromptRecords(current, restoredPrompts),
        contextBlocks: [...current.contextBlocks, restored.contextBlock],
      });
      persistOperation(restoreContextBlockWithPromptReferences(restored.contextBlock, restoredPrompts));
      setSnackbar(null);
      return;
    }
    if (!snackbar?.deleted) return;
    const current = snapshotRef.current;
    const existingFolders = new Set(current.folders.map(({ id }) => id));
    const existingPrompts = new Set(current.prompts.map(({ id }) => id));
    commitSnapshot({
      ...current,
      folders: [...current.folders, ...snackbar.deleted.folders.filter(({ id }) => !existingFolders.has(id))],
      prompts: [...current.prompts, ...snackbar.deleted.prompts.filter(({ id }) => !existingPrompts.has(id))],
    });
    persistOperation(restoreDeleted(snackbar.deleted));
    setSnackbar(null);
  }, [commitSnapshot, persistOperation, snackbar]);

  const moveFolderTo = useCallback((folder: Folder, parentId: string | null, index?: number) => {
    const result = moveFolderInMemory(snapshotRef.current, folder.id, parentId, index);
    if (!result) {
      showNotice(t("invalidMove"));
      return;
    }
    commitSnapshot(result.snapshot);
    persistOperation(persistFolders(result.changed));
  }, [commitSnapshot, persistOperation, showNotice, t]);

  const moveFolderStep = useCallback((folder: Folder, direction: -1 | 1) => {
    const current = snapshotRef.current;
    const allSiblings = sortedByOrder(current.folders.filter(({ parentId }) => parentId === folder.parentId));
    const visibleSiblings = folder.parentId === null && workspaceFolder
      ? allSiblings.filter(({ id }) => id !== workspaceFolder.id)
      : allSiblings;
    const currentIndex = visibleSiblings.findIndex(({ id }) => id === folder.id);
    const neighbor = visibleSiblings[currentIndex + direction];
    if (!neighbor) return;
    const destination = allSiblings.filter(({ id }) => id !== folder.id);
    const neighborIndex = destination.findIndex(({ id }) => id === neighbor.id);
    moveFolderTo(folder, folder.parentId, neighborIndex + (direction === 1 ? 1 : 0));
  }, [moveFolderTo, workspaceFolder]);

  const dropFolder = useCallback((folderId: string, targetId: string, position: FolderDropPosition) => {
    const current = snapshotRef.current;
    const moving = current.folders.find(({ id }) => id === folderId);
    const target = current.folders.find(({ id }) => id === targetId);
    if (!moving || !target) return;
    if (position === "inside") {
      moveFolderTo(moving, target.id);
      return;
    }
    const siblings = sortedByOrder(current.folders.filter(
      ({ parentId, id }) => parentId === target.parentId && id !== moving.id,
    ));
    const targetIndex = siblings.findIndex(({ id }) => id === target.id);
    moveFolderTo(moving, target.parentId, targetIndex + (position === "after" ? 1 : 0));
  }, [moveFolderTo]);

  const movePromptTo = useCallback((prompt: Prompt, folderId: string, index?: number) => {
    const result = movePromptInMemory(snapshotRef.current, prompt.id, folderId, index);
    if (!result) return;
    commitSnapshot(result.snapshot);
    persistOperation(persistPrompts(result.changed));
  }, [commitSnapshot, persistOperation]);

  const copyPromptTo = useCallback((prompt: Prompt, folderId: string) => {
    const current = snapshotRef.current;
    if (!current.folders.some(({ id }) => id === folderId)) return;
    const destination = current.prompts.filter((item) => item.folderId === folderId);
    const timestamp = nowIso();
    const duplicate: Prompt = {
      ...prompt,
      id: createId(),
      folderId,
      order: destination.length ? Math.max(...destination.map(({ order }) => order)) + 1 : 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      favorite: false,
      usageCount: 0,
    };
    commitSnapshot({ ...current, prompts: [...current.prompts, duplicate] });
    persistOperation(persistPrompts([duplicate]));
    showNotice(t("promptCopied"));
  }, [commitSnapshot, persistOperation, showNotice, t]);

  const movePromptStep = useCallback((prompt: Prompt, direction: -1 | 1) => {
    const current = snapshotRef.current;
    const siblings = sortedByOrder(current.prompts.filter(({ folderId }) => folderId === prompt.folderId));
    movePromptTo(prompt, prompt.folderId, siblings.findIndex(({ id }) => id === prompt.id) + direction);
  }, [movePromptTo]);

  const dropPromptOnPrompt = useCallback((promptId: string, targetPromptId: string, position: "before" | "after") => {
    const current = snapshotRef.current;
    const moving = current.prompts.find(({ id }) => id === promptId);
    const target = current.prompts.find(({ id }) => id === targetPromptId);
    if (!moving || !target) return;
    const siblings = sortedByOrder(current.prompts.filter(
      ({ folderId, id }) => folderId === target.folderId && id !== moving.id,
    ));
    const targetIndex = siblings.findIndex(({ id }) => id === target.id);
    movePromptTo(moving, target.folderId, targetIndex + (position === "after" ? 1 : 0));
  }, [movePromptTo]);

  const dropPromptOnFolder = useCallback((promptId: string, folderId: string) => {
    const prompt = snapshotRef.current.prompts.find(({ id }) => id === promptId);
    if (prompt) movePromptTo(prompt, folderId);
  }, [movePromptTo]);

  const dropAtCurrentLevel = useCallback(() => {
    if (!activeDrag) return;
    if (activeDrag.type === "folder") {
      const folder = snapshotRef.current.folders.find(({ id }) => id === activeDrag.id);
      if (folder) moveFolderTo(folder, browsingParentId);
    } else if (browsingParentId) {
      const prompt = snapshotRef.current.prompts.find(({ id }) => id === activeDrag.id);
      if (prompt) movePromptTo(prompt, browsingParentId);
    }
    setActiveDrag(null);
  }, [activeDrag, browsingParentId, moveFolderTo, movePromptTo]);

  const submitForm = useCallback(async (name: string, content: string, selectedFolderId?: string) => {
    if (!form) return;
    const current = snapshotRef.current;
    const timestamp = nowIso();
    if (form.kind === "folder" && form.mode === "add") {
      const siblings = current.folders.filter(({ parentId }) => parentId === form.parentId);
      const folder: Folder = {
        id: createId(),
        name: name.trim(),
        parentId: form.parentId,
        order: siblings.length ? Math.max(...siblings.map(({ order }) => order)) + 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      commitSnapshot({ ...current, folders: [...current.folders, folder] });
      persistOperation(persistFolders([folder]));
    } else if (form.kind === "folder") {
      const next = { ...form.folder, name: name.trim(), updatedAt: timestamp };
      commitSnapshot(replaceFolderRecords(current, [next]));
      persistOperation(persistFolders([next]));
    } else if (form.mode === "add") {
      const folderId = selectedFolderId && current.folders.some(({ id }) => id === selectedFolderId)
        ? selectedFolderId : form.folderId;
      const siblings = current.prompts.filter((prompt) => prompt.folderId === folderId);
      const prompt: Prompt = {
        id: createId(),
        folderId,
        title: name.trim(),
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
      commitSnapshot({ ...current, prompts: [...current.prompts, prompt] });
      persistOperation(persistPrompts([prompt]));
    } else {
      const next = { ...form.prompt, title: name.trim(), updatedAt: timestamp };
      commitSnapshot(replacePromptRecords(current, [next]));
      persistOperation(persistPrompts([next]));
    }
  }, [commitSnapshot, form, persistOperation]);

  const saveSelectedPrompt = useCallback(async (
    patch: Pick<Prompt, "content" | "tags" | "contextBlockIds" | "note" | "noteAttachments">,
  ) => {
    if (!selectedPromptId) return;
    const current = snapshotRef.current;
    const prompt = current.prompts.find(({ id }) => id === selectedPromptId);
    if (!prompt) return;
    const next = { ...prompt, ...patch, updatedAt: nowIso() };
    const kinds: Array<"content" | "note"> = [];
    if (prompt.content !== next.content) kinds.push("content");
    if (prompt.note !== next.note || JSON.stringify(prompt.noteAttachments) !== JSON.stringify(next.noteAttachments)) kinds.push("note");
    commitSnapshot(replacePromptRecords(current, [next]));
    persistOperation(savePromptEdits(prompt, next, kinds));
  }, [commitSnapshot, persistOperation, selectedPromptId]);

  const saveSelectedPromptContent = useCallback(async (content: string) => {
    const prompt = snapshotRef.current.prompts.find(({ id }) => id === selectedPromptId);
    if (!prompt) return;
    await saveSelectedPrompt({
      content,
      tags: prompt.tags,
      contextBlockIds: prompt.contextBlockIds,
      note: prompt.note,
      noteAttachments: prompt.noteAttachments,
    });
  }, [saveSelectedPrompt, selectedPromptId]);

  const restoreSelectedPromptVersion = useCallback(async (version: PromptVersion) => {
    const prompt = snapshotRef.current.prompts.find(({ id }) => id === selectedPromptId);
    if (!prompt || version.promptId !== prompt.id) return;
    await saveSelectedPrompt({
      content: version.kind === "content" ? version.content : prompt.content,
      tags: prompt.tags,
      contextBlockIds: prompt.contextBlockIds,
      note: version.kind === "note" ? version.note : prompt.note,
      noteAttachments: version.kind === "note" ? version.noteAttachments : prompt.noteAttachments,
    });
  }, [saveSelectedPrompt, selectedPromptId]);

  const storeImageAttachment = useCallback(async (file: File): Promise<ImageNoteAttachment> => {
    const timestamp = nowIso();
    const blobId = createId();
    await persistAttachmentBlob({
      id: blobId,
      name: file.name,
      mimeType: file.type,
      createdAt: timestamp,
      data: file,
    });
    return {
      id: createId(),
      kind: "image",
      blobId,
      name: file.name,
      mimeType: file.type,
      caption: t("defaultImageCaption"),
      createdAt: timestamp,
    };
  }, [t]);

  const updatePromptMetadata = useCallback((promptId: string, patch: Partial<Prompt>) => {
    const current = snapshotRef.current;
    const prompt = current.prompts.find(({ id }) => id === promptId);
    if (!prompt) return;
    const next = { ...prompt, ...patch, updatedAt: nowIso() };
    commitSnapshot(replacePromptRecords(current, [next]));
    persistOperation(persistPrompts([next]));
  }, [commitSnapshot, persistOperation]);

  const togglePromptFavorite = useCallback((prompt: Prompt) => {
    updatePromptMetadata(prompt.id, { favorite: !prompt.favorite });
  }, [updatePromptMetadata]);

  const completeCopy = useCallback(async (promptId: string, source: string) => {
    await navigator.clipboard.writeText(source);
    const prompt = snapshotRef.current.prompts.find(({ id }) => id === promptId);
    if (prompt) updatePromptMetadata(promptId, { usageCount: prompt.usageCount + 1 });
  }, [updatePromptMetadata]);

  const requestPromptCopy = useCallback((promptId: string, contentOverride?: string): Promise<boolean> => {
    const prompt = snapshotRef.current.prompts.find(({ id }) => id === promptId);
    if (!prompt) return Promise.resolve(false);
    const source = composePromptSource(contentOverride ?? prompt.content, prompt.contextBlockIds, snapshotRef.current.contextBlocks);
    const names = getPromptVariableNames(source);
    if (!names.length) return completeCopy(promptId, source).then(() => true).catch(() => {
      showNotice(t("copyFailed"));
      return false;
    });
    return new Promise((resolve) => setPendingCopy({ promptId, source, names, resolve }));
  }, [completeCopy, showNotice, t]);

  const submitVariables = useCallback(async (values: Record<string, string>) => {
    if (!pendingCopy) return;
    try {
      await completeCopy(pendingCopy.promptId, substitutePromptVariables(pendingCopy.source, values));
      pendingCopy.resolve(true);
      setPendingCopy(null);
    } catch {
      showNotice(t("copyFailed"));
    }
  }, [completeCopy, pendingCopy, showNotice, t]);

  const cancelVariables = useCallback(() => {
    pendingCopy?.resolve(false);
    setPendingCopy(null);
  }, [pendingCopy]);

  const importData = useCallback(async (data: ExportDataV2) => {
    const currentSettings = settingsRef.current;
    const current = snapshotRef.current;
    const workspace = findWorkspaceFolder(current.folders, currentSettings?.workspaceFolderId);
    if (!currentSettings || !workspace) throw new Error("Workspace root is unavailable");
    const prepared = prepareSharedImport(data, current, workspace.id);
    commitSnapshot(prepared.snapshot);
    try {
      await persistSharedImport(prepared);
    } catch (error) {
      commitSnapshot(current);
      throw error;
    }
  }, [commitSnapshot]);

  const openAddFolder = useCallback(() => setForm({ kind: "folder", mode: "add", parentId: browsingParentId }), [browsingParentId]);
  const openAddPrompt = useCallback(() => {
    if (currentFolder) setForm({ kind: "prompt", mode: "add", folderId: currentFolder.id });
  }, [currentFolder]);
  const saveContextBlock = useCallback(async (existing: ContextBlock | null, title: string, content: string) => {
    const current = snapshotRef.current;
    const timestamp = nowIso();
    const block: ContextBlock = existing
      ? { ...existing, title, content, updatedAt: timestamp }
      : {
          id: createId(),
          title,
          content,
          order: current.contextBlocks.length
            ? Math.max(...current.contextBlocks.map(({ order }) => order)) + 1 : 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
    commitSnapshot({
      ...current,
      contextBlocks: existing
        ? current.contextBlocks.map((item) => item.id === existing.id ? block : item)
        : [...current.contextBlocks, block],
    });
    persistOperation(persistContextBlocks([block]));
  }, [commitSnapshot, persistOperation]);
  const deleteContextBlock = useCallback((contextBlock: ContextBlock) => {
    const current = snapshotRef.current;
    const promptsBeforeDetach = current.prompts.filter(({ contextBlockIds }) => contextBlockIds.includes(contextBlock.id));
    const detached = promptsBeforeDetach.map((prompt) => ({
      ...prompt,
      contextBlockIds: prompt.contextBlockIds.filter((id) => id !== contextBlock.id),
      updatedAt: nowIso(),
    }));
    commitSnapshot({
      ...replacePromptRecords(current, detached),
      contextBlocks: current.contextBlocks.filter(({ id }) => id !== contextBlock.id),
    });
    persistOperation(deleteContextBlockWithDetachedPrompts(contextBlock.id, detached));
    showNotice(t("contextBlockDeleted"), undefined, { contextBlock, promptsBeforeDetach });
  }, [commitSnapshot, persistOperation, showNotice, t]);
  const openContextBlocks = useCallback(() => {
    setSettingsOpen(false);
    setContextBlockEditId(undefined);
    setContextBlocksOpen(true);
  }, []);
  const openContextBlock = useCallback((id: string) => {
    setSelectedPromptId(null);
    setSettingsOpen(false);
    setContextBlockEditId(id);
    setContextBlocksOpen(true);
  }, []);
  const closeContextBlocks = useCallback(() => {
    setContextBlocksOpen(false);
    setContextBlockEditId(undefined);
  }, []);
  const openWorkspaceRename = useCallback(() => {
    if (workspaceFolder) setForm({ kind: "folder", mode: "rename", folder: workspaceFolder });
  }, [workspaceFolder]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => {
    setContextBlocksOpen(false);
    setContextBlockEditId(undefined);
    setSettingsOpen((value) => !value);
  }, []);
  const closePrompt = useCallback(() => setSelectedPromptId(null), []);
  const closeForm = useCallback(() => setForm(null), []);
  const dismissSnackbar = useCallback(() => setSnackbar(null), []);
  const hasUserFolders = snapshot.folders.some(({ id }) => id !== workspaceFolder?.id);

  if (loadFailed) return <main className="app-shell"><div className="empty-state" role="alert"><span>{t("loadFailed")}</span></div></main>;
  if (!settings) return <main className="app-shell" aria-busy="true"><span className="sr-only">{t("loading")}</span><div className="spinner" /></main>;
  if (!settings.onboardingComplete) {
    return <div className="app-shell"><OnboardingFlow onComplete={finishOnboarding} t={t} /></div>;
  }

  return (
    <main className="app-shell">
      <div className="top-bar">
        <SearchBar
          availableTags={availableTags}
          fallbackDirection={fallbackDirection}
          favoritesOnly={favoritesOnly}
          fields={searchFields}
          onChange={setQuery}
          onToggleFavorite={toggleFavorites}
          onToggleField={toggleSearchField}
          onToggleTag={toggleTag}
          selectedTags={selectedTags}
          scopeName={currentFolder?.name}
          t={t}
          value={query}
        />
        <button aria-label={t("contextBlocks")} className="icon-button toolbar-button" onClick={openContextBlocks} title={t("contextBlocks")} type="button">
          <Blocks aria-hidden="true" size={20} />
        </button>
        <button aria-label={t("settings")} className="icon-button toolbar-button" onClick={openSettings} title={t("settings")} type="button">
          <Settings aria-hidden="true" size={20} />
        </button>
      </div>

      {contextBlocksOpen ? (
        <Suspense fallback={<div className="screen-spinner"><div className="spinner" /></div>}>
          <ContextBlocksPanel
            contextBlocks={snapshot.contextBlocks}
            editId={contextBlockEditId}
            fallbackDirection={fallbackDirection}
            onBack={closeContextBlocks}
            onDelete={deleteContextBlock}
            onSave={saveContextBlock}
            t={t}
          />
        </Suspense>
      ) : settingsOpen ? (
        <Suspense fallback={<div className="screen-spinner"><div className="spinner" /></div>}>
          <SettingsPanel
            fallbackDirection={fallbackDirection}
            onAccent={changeAccent}
            onBack={closeSettings}
            onImport={importData}
            onIncludeNotesInExport={changeIncludeNotesInExport}
            onLanguage={changeLanguage}
            onNotice={showNotice}
            onTheme={changeTheme}
            settings={settings}
            snapshot={snapshot}
            t={t}
          />
        </Suspense>
      ) : (
        <div className="scroll-area">
          <header className="view-header">
            {currentFolder && (
              <button aria-label={t("back")} className="icon-button compact" onClick={navigateBack} type="button">
                <ArrowLeft aria-hidden="true" className="back-icon" size={20} />
              </button>
            )}
            <h1>
              {filterMode
                ? t("search")
                : currentFolder
                  ? <BidiText fallbackDirection={fallbackDirection} text={currentFolder.name} />
                  : workspaceFolder
                    ? (
                      <button className="workspace-title-button" onClick={openWorkspaceRename} type="button">
                        <BidiText fallbackDirection={fallbackDirection} text={workspaceFolder.name} />
                        <Pencil aria-hidden="true" size={20} />
                        <span className="sr-only">{t("rename")}</span>
                      </button>
                    )
                    : <span className="sr-only">{t("appName")}</span>}
            </h1>
          </header>

          {filterMode ? (
            searchResults.length ? (
              <PromptList
                activeDrag={activeDrag}
                allPrompts={snapshot.prompts}
                fallbackDirection={fallbackDirection}
                folders={snapshot.folders}
                onCopyTo={copyPromptTo}
                onDelete={deletePromptNow}
                onDragEnd={clearDrag}
                onDragStart={setActiveDrag}
                onDropPrompt={dropPromptOnPrompt}
                onMoveStep={movePromptStep}
                onMoveTo={movePromptTo}
                onOpen={openPrompt}
                onFavorite={togglePromptFavorite}
                onRename={renamePrompt}
                prompts={searchResults}
                searchMode
                sortMode="newest"
                t={t}
              />
            ) : <div className="empty-state"><span>{t("noResults")}</span></div>
          ) : (
            <>
              <div className={`add-actions ${currentFolder ? "" : "single"}`}>
                <button className="primary-button btn-primary pinned-add-button" onClick={openAddFolder} type="button">
                  <FolderPlus aria-hidden="true" size={18} />
                  {!hasUserFolders ? t("firstFolder") : t("addFolder")}
                </button>
                {currentFolder && (
                  <button className="primary-button btn-primary pinned-add-button" onClick={openAddPrompt} type="button">
                    <Plus aria-hidden="true" size={18} /> {t("addPrompt")}
                  </button>
                )}
              </div>

              <DragDropTree
                activeDrag={activeDrag}
                canDropAtCurrentLevel={activeDrag?.type === "folder" || Boolean(browsingParentId)}
                onDragEnd={clearDrag}
                onDropAtCurrentLevel={dropAtCurrentLevel}
                t={t}
              >
                {visibleFolders.length > 0 && <div className="section-label">{t("folders")}</div>}
                <FolderTree
                  activeDrag={activeDrag}
                  fallbackDirection={fallbackDirection}
                  folders={snapshot.folders}
                  includeRootSiblings={!currentFolderId && Boolean(workspaceFolder)}
                  onDelete={deleteFolderNow}
                  onDragEnd={clearDrag}
                  onDragStart={setActiveDrag}
                  onDropFolder={dropFolder}
                  onDropPrompt={dropPromptOnFolder}
                  onMoveStep={moveFolderStep}
                  onMoveTo={moveFolderTo}
                  onOpen={openFolder}
                  onRename={renameFolder}
                  parentId={browsingParentId}
                  rootParentId={homeParentId}
                  t={t}
                />
                {visiblePrompts.length > 0 && (
                  <div className="section-heading">
                    <div className="section-label">{t("prompts")}</div>
                    {currentFolder && <PromptSortMenu onChange={changeSort} t={t} value={settings.promptSort} />}
                  </div>
                )}
                <PromptList
                  activeDrag={activeDrag}
                  allPrompts={snapshot.prompts}
                  fallbackDirection={fallbackDirection}
                  folders={snapshot.folders}
                  onCopyTo={copyPromptTo}
                  onDelete={deletePromptNow}
                  onDragEnd={clearDrag}
                  onDragStart={setActiveDrag}
                  onDropPrompt={dropPromptOnPrompt}
                  onMoveStep={movePromptStep}
                  onMoveTo={movePromptTo}
                  onOpen={openPrompt}
                  onFavorite={togglePromptFavorite}
                  onRename={renamePrompt}
                  prompts={visiblePrompts}
                  sortMode={settings.promptSort}
                  t={t}
                />
              </DragDropTree>

              {visibleFolders.length === 0 && visiblePrompts.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon"><Folders aria-hidden="true" size={28} /></div>
                  <span>{currentFolder ? t("emptyFolder") : t("emptyRoot")}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selectedPrompt && (
        <Suspense fallback={null}>
          <PromptDetailActions
            fallbackDirection={fallbackDirection}
            language={settings.language}
            onClose={closePrompt}
            contextBlocks={snapshot.contextBlocks}
            onCopyContent={(content) => requestPromptCopy(selectedPrompt.id, content)}
            onFavorite={() => togglePromptFavorite(selectedPrompt)}
            onNotice={showNotice}
            onOpenContextBlock={openContextBlock}
            onRestoreVersion={restoreSelectedPromptVersion}
            onSavePrompt={saveSelectedPrompt}
            onSaveContent={saveSelectedPromptContent}
            onStoreImage={storeImageAttachment}
            prompt={selectedPrompt}
            t={t}
          />
        </Suspense>
      )}

      {form && (
        <ItemFormModal
          fallbackDirection={fallbackDirection}
          destinationFolders={form.kind === "prompt" && form.mode === "add" && form.chooseFolder ? snapshot.folders : undefined}
          initialContent={form.kind === "prompt" && form.mode === "add" ? form.initialContent ?? "" : undefined}
          initialFolderId={form.kind === "prompt" && form.mode === "add" ? form.folderId : undefined}
          initialName={
            form.kind === "folder" && form.mode === "rename" ? form.folder.name
              : form.kind === "prompt" && form.mode === "rename" ? form.prompt.title
                : ""
          }
          kind={form.kind}
          mode={form.mode}
          onClose={closeForm}
          onSubmit={submitForm}
          t={t}
        />
      )}

      {snackbar && (
        <ConfirmUndoSnackbar
          key={snackbar.id}
          message={snackbar.message}
          onDismiss={dismissSnackbar}
          onUndo={snackbar.deleted || snackbar.deletedContext ? undoDelete : undefined}
          t={t}
        />
      )}
      {pendingCopy && (
        <Suspense fallback={null}>
          <VariableFillModal
            fallbackDirection={fallbackDirection}
            names={pendingCopy.names}
            onCancel={cancelVariables}
            onSubmit={submitVariables}
            t={t}
          />
        </Suspense>
      )}
    </main>
  );
}
