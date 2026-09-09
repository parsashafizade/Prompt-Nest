# Prompt Nest

Prompt Nest is a fully local, bilingual prompt-library browser extension for Chrome and
Firefox. It organizes Markdown prompts without a server, account, analytics, remote assets,
or AI connection. Folders, prompts, history, context blocks, and note media stay in
IndexedDB on the current device; lightweight preferences stay in extension-local storage.

## Features

- Nested folders with rename, move, drag-and-drop ordering, copy-to-folder, and undo deletion
- English and Persian UI with fully mirrored LTR/RTL layouts, light/dark themes, and four accents
- Per-line Persian/Arabic and Latin direction in the CodeMirror editor and every read-only view
- Inline Markdown and KaTeX live preview while preserving the original Markdown source
- Global or folder-scoped search across titles, bodies, and tags, with optional note search
- Favorites, tag filters, custom/date/name sorting, and automatic most-used sorting
- `{{variable_name}}` placeholders filled only when a prompt is copied
- Reusable Markdown context blocks expanded by reference when a prompt is copied
- Standalone editing, edit-before-copy, unlimited local version history, preview, and rollback
- Private per-prompt notes with stored images or manual device-location reminders
- Local PNG share cards for Story, square Post, and LinkedIn/X ratios, with opt-in note text,
  attachment captions, and reference reminders (attached images themselves are never drawn on cards)
- Selective compact-JSON export and backward-compatible v1/v2 import
- A selection-only webpage context menu that opens the normal New Prompt form prefilled

Imports never replace the local library. Selected prompts are assigned fresh IDs and added
to one reused `Shared Prompts` folder beneath the current workspace root. Imported favorites
and usage counters reset, while tags, referenced context blocks, and history are retained.

## Privacy and permissions

Prompt Nest makes no network requests. Its extension-page content security policy explicitly
sets `connect-src 'none'`, and the manifest contains no host permissions.

- `storage` stores UI preferences and transfers one selected-text draft to the popup.
- `contextMenus` adds the selection-only “Save selection as a new prompt” action. The browser
  supplies the selected text directly, so webpage-reading permission is not required.
- `activeTab` and `scripting` are used only after Share is clicked to mount a temporary local
  share-card overlay. Restricted pages fall back to local PNG download/copy.

## Setup

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run build
```

The unpacked extension is written to `dist/`. No separate code generation, migration, or
external service is required; IndexedDB upgrades run locally when the extension opens.

### Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository's `dist` directory.

### Load temporarily in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `dist/manifest.json`.

## Development commands

```sh
npm run dev       # Vite development server
npm run check     # strict TypeScript check
npm test          # Vitest suite
npm run audit     # typecheck, tests, build, and offline/permission audit
npm run package   # production build and ZIP package
```

The final package is written to `prompt-nest-extension.zip`.

## Backup format

New exports use compact schema version 2 JSON. Prompt content and context-block bodies remain
plain Markdown strings. Imports also accept version 1 backups. Personal notes and attachment
image data are excluded by default; enable **Include personal notes** in Settings when a
portable backup should contain them. Embedded images can make that JSON substantially larger.

## Storage considerations

Version history has no application-imposed cap, as designed. Browser IndexedDB storage is
still subject to browser- and device-specific quota and free-space limits, especially when
many note images are retained.

## License

No open-source license has been selected yet. Until a `LICENSE` file is added, copyright law
does not grant general permission to copy, modify, or redistribute this project.
