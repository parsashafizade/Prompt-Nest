export type Language = "fa" | "en";
export type Theme = "light" | "dark";
export type TextDirection = "ltr" | "rtl";
export type AccentPalette = "violet" | "ocean" | "sage" | "terracotta";
export type PromptSortMode = "newest" | "oldest" | "name-asc" | "name-desc" | "most-used" | "custom";

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImageNoteAttachment {
  id: string;
  kind: "image";
  blobId: string;
  name: string;
  mimeType: string;
  caption: string;
  createdAt: string;
}

export interface ReferenceNoteAttachment {
  id: string;
  kind: "reference";
  header: string;
  location: string;
  createdAt: string;
}

export type NoteAttachment = ImageNoteAttachment | ReferenceNoteAttachment;

export interface Prompt {
  id: string;
  folderId: string;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  usageCount: number;
  tags: string[];
  contextBlockIds: string[];
  note: string;
  noteAttachments: NoteAttachment[];
}

export interface ContextBlock {
  id: string;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type PromptVersion = {
  id: string;
  promptId: string;
  createdAt: string;
} & (
  | { kind: "content"; content: string }
  | { kind: "note"; note: string; noteAttachments: NoteAttachment[] }
);

export interface AttachmentBlob {
  id: string;
  name: string;
  mimeType: string;
  createdAt: string;
  data: Blob;
}

export interface PortableAttachmentImage {
  id: string;
  name: string;
  mimeType: string;
  createdAt: string;
  dataUrl: string;
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
  includeNotesInExport: boolean;
}

export interface ExportPromptV1 {
  id: string;
  folderId: string;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExportDataV1 {
  schemaVersion: 1;
  exportedAt: string;
  folders: Folder[];
  prompts: ExportPromptV1[];
  settings: ExportSettings;
}

export interface ExportDataV2 {
  schemaVersion: 2;
  exportedAt: string;
  folders: Folder[];
  prompts: Prompt[];
  contextBlocks: ContextBlock[];
  promptVersions: PromptVersion[];
  attachmentImages: PortableAttachmentImage[];
  settings: ExportSettings;
}

export type ExportData = ExportDataV1 | ExportDataV2;

export interface DatabaseSnapshot {
  folders: Folder[];
  prompts: Prompt[];
  contextBlocks: ContextBlock[];
}

export interface DeletedBundle {
  folders: Folder[];
  prompts: Prompt[];
}

export interface DeletedContextBlockBundle {
  contextBlock: ContextBlock;
  promptsBeforeDetach: Prompt[];
}

export type DragPayload =
  | { type: "folder"; id: string }
  | { type: "prompt"; id: string };

export type FolderDropPosition = "before" | "inside" | "after";

export type Translator = (key: string, variables?: Record<string, string | number>) => string;
