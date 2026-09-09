export type Language = "fa" | "en";
export type Theme = "light" | "dark";
export type TextDirection = "ltr" | "rtl";
export type AccentPalette = "violet" | "ocean" | "sage" | "terracotta";
export type PromptSortMode = "newest" | "oldest" | "name-asc" | "name-desc" | "custom";

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Prompt {
  id: string;
  folderId: string;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExportSettings {
  language: Language;
  theme: Theme;
}

export interface AppSettings extends ExportSettings {
  onboardingComplete: boolean;
  accent: AccentPalette;
  promptSort: PromptSortMode;
  workspaceFolderId?: string;
}

export interface ExportData {
  schemaVersion: 1;
  exportedAt: string;
  folders: Folder[];
  prompts: Prompt[];
  settings: ExportSettings;
}

export interface DatabaseSnapshot {
  folders: Folder[];
  prompts: Prompt[];
}

export interface DeletedBundle {
  folders: Folder[];
  prompts: Prompt[];
}

export type DragPayload =
  | { type: "folder"; id: string }
  | { type: "prompt"; id: string };

export type FolderDropPosition = "before" | "inside" | "after";

export type Translator = (key: string, variables?: Record<string, string | number>) => string;
