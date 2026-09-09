import { ArrowLeft, FolderPlus, Folders, Pencil, Plus, Settings } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  getSettings,
  getSnapshot,
  persistFolders,
  persistPrompts,
  prepareMergeImport,
  removeDeletedBundle,
  replaceDatabaseData,
  restoreDeleted,
  saveSettings,
} from "../shared/db";
import en from "../shared/i18n/en.json";
import fa from "../shared/i18n/fa.json";
import type {
  AccentPalette,
  AppSettings,
  DatabaseSnapshot,
  DeletedBundle,
  DragPayload,
  ExportData,
  Folder,
  FolderDropPosition,
  Language,
  Prompt,
  PromptSortMode,
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

type FormState =
  | { kind: "folder"; mode: "add"; parentId: string | null }
  | { kind: "folder"; mode: "rename"; folder: Folder }
  | { kind: "prompt"; mode: "add"; folderId: string }
  | { kind: "prompt"; mode: "rename"; prompt: Prompt };

interface SnackbarState {
  id: number;
  message: string;
  deleted?: DeletedBundle;
}

type SnapshotAction = { type: "replace"; snapshot: DatabaseSnapshot };

interface MoveResult<T> {
  snapshot: DatabaseSnapshot;
  changed: T[];
}

const EMPTY_SNAPSHOT: DatabaseSnapshot = { folders: [], prompts: [] };
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
  const [searchFields, setSearchFields] = useState<SearchFields>({ titles: true, content: true });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);

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

  const showNotice = useCallback((message: string, deleted?: DeletedBundle) => {
    setSnackbar({ id: Date.now(), message, deleted });
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
    });
    return () => { active = false; };
  }, [commitSnapshot]);

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
      if (form) setForm(null);
      else if (selectedPromptId) setSelectedPromptId(null);
      else if (settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeTopLayer);
    return () => window.removeEventListener("keydown", closeTopLayer);
  }, [form, selectedPromptId, settingsOpen]);

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

  const searchResults = useMemo(() => {
    if (!debouncedQuery) return [];
    return snapshot.prompts
      .filter((prompt) => !scopedFolderIds || scopedFolderIds.has(prompt.folderId))
      .map((prompt) => {
        const titleMatches = searchFields.titles && prompt.title.toLocaleLowerCase().includes(debouncedQuery);
        const contentMatches = searchFields.content && prompt.content.toLocaleLowerCase().includes(debouncedQuery);
        return { prompt, score: titleMatches ? 0 : contentMatches ? 1 : -1 };
      })
      .filter(({ score }) => score >= 0)
      .sort((a, b) => a.score - b.score || b.prompt.createdAt.localeCompare(a.prompt.createdAt))
      .map(({ prompt }) => prompt);
  }, [debouncedQuery, scopedFolderIds, searchFields.content, searchFields.titles, snapshot.prompts]);

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
  const toggleSearchField = useCallback((field: keyof SearchFields) => {
    setSearchFields((current) => {
      const other = field === "titles" ? "content" : "titles";
      if (current[field] && !current[other]) return current;
      return { ...current, [field]: !current[field] };
    });
  }, []);

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
    if (!snackbar?.deleted) return;
    const current = snapshotRef.current;
    const existingFolders = new Set(current.folders.map(({ id }) => id));
    const existingPrompts = new Set(current.prompts.map(({ id }) => id));
    commitSnapshot({
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

  const submitForm = useCallback(async (name: string, content: string) => {
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
      const siblings = current.prompts.filter(({ folderId }) => folderId === form.folderId);
      const prompt: Prompt = {
        id: createId(),
        folderId: form.folderId,
        title: name.trim(),
        content,
        order: siblings.length ? Math.max(...siblings.map(({ order }) => order)) + 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      commitSnapshot({ ...current, prompts: [...current.prompts, prompt] });
      persistOperation(persistPrompts([prompt]));
    } else {
      const next = { ...form.prompt, title: name.trim(), updatedAt: timestamp };
      commitSnapshot(replacePromptRecords(current, [next]));
      persistOperation(persistPrompts([next]));
    }
  }, [commitSnapshot, form, persistOperation]);

  const saveSelectedPromptContent = useCallback(async (content: string) => {
    if (!selectedPromptId) return;
    const current = snapshotRef.current;
    const prompt = current.prompts.find(({ id }) => id === selectedPromptId);
    if (!prompt) return;
    const next = { ...prompt, content, updatedAt: nowIso() };
    commitSnapshot(replacePromptRecords(current, [next]));
    persistOperation(persistPrompts([next]));
  }, [commitSnapshot, persistOperation, selectedPromptId]);

  const importData = useCallback(async (data: ExportData, mode: "replace" | "merge") => {
    const currentSettings = settingsRef.current;
    if (!currentSettings) return;
    if (mode === "replace") {
      const nextSnapshot = { folders: data.folders, prompts: data.prompts };
      const workspace = findWorkspaceFolder(nextSnapshot.folders);
      const nextSettings: AppSettings = {
        ...currentSettings,
        ...data.settings,
        workspaceFolderId: workspace?.id,
      };
      commitSnapshot(nextSnapshot);
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      setCurrentFolderId(null);
      setSelectedPromptId(null);
      persistOperation(replaceDatabaseData(data).then(() => saveSettings(nextSettings)));
      return;
    }
    const prepared = prepareMergeImport(data, snapshotRef.current);
    commitSnapshot(prepared.snapshot);
    persistOperation(Promise.all([persistFolders(prepared.folders), persistPrompts(prepared.prompts)]));
    if (!currentSettings.workspaceFolderId) {
      const workspace = findWorkspaceFolder(prepared.snapshot.folders);
      if (workspace) await applySettingsPatch({ workspaceFolderId: workspace.id });
    }
  }, [applySettingsPatch, commitSnapshot, persistOperation]);

  const openAddFolder = useCallback(() => setForm({ kind: "folder", mode: "add", parentId: browsingParentId }), [browsingParentId]);
  const openAddPrompt = useCallback(() => {
    if (currentFolder) setForm({ kind: "prompt", mode: "add", folderId: currentFolder.id });
  }, [currentFolder]);
  const openWorkspaceRename = useCallback(() => {
    if (workspaceFolder) setForm({ kind: "folder", mode: "rename", folder: workspaceFolder });
  }, [workspaceFolder]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen((value) => !value), []);
  const closePrompt = useCallback(() => setSelectedPromptId(null), []);
  const closeForm = useCallback(() => setForm(null), []);
  const dismissSnackbar = useCallback(() => setSnackbar(null), []);
  const hasUserFolders = snapshot.folders.some(({ id }) => id !== workspaceFolder?.id);

  if (!settings) return <main className="app-shell" aria-busy="true"><div className="spinner" /></main>;
  if (!settings.onboardingComplete) {
    return <div className="app-shell"><OnboardingFlow onComplete={finishOnboarding} t={t} /></div>;
  }

  return (
    <main className="app-shell">
      <div className="top-bar">
        <SearchBar
          fallbackDirection={fallbackDirection}
          fields={searchFields}
          onChange={setQuery}
          onToggleField={toggleSearchField}
          scopeName={currentFolder?.name}
          t={t}
          value={query}
        />
        <button aria-label={t("settings")} className="icon-button toolbar-button" onClick={openSettings} type="button">
          <Settings aria-hidden="true" size={20} />
        </button>
      </div>

      {settingsOpen ? (
        <Suspense fallback={<div className="screen-spinner"><div className="spinner" /></div>}>
          <SettingsPanel
            fallbackDirection={fallbackDirection}
            onAccent={changeAccent}
            onBack={closeSettings}
            onImport={importData}
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
              {debouncedQuery
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

          {debouncedQuery ? (
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
            onNotice={showNotice}
            onSaveContent={saveSelectedPromptContent}
            prompt={selectedPrompt}
            t={t}
          />
        </Suspense>
      )}

      {form && (
        <ItemFormModal
          fallbackDirection={fallbackDirection}
          initialContent={form.kind === "prompt" && form.mode === "add" ? "" : undefined}
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
          onUndo={snackbar.deleted ? undoDelete : undefined}
          t={t}
        />
      )}
    </main>
  );
}
