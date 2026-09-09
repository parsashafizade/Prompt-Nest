# Prompt Nest browser extension

Prompt Nest is a fully local Manifest V3 prompt manager for Chrome and Firefox. Prompt and
folder data stays in IndexedDB; language, theme, accent, sort, and onboarding state use extension local
storage. The extension contains no backend, analytics, remote assets, or external API calls.

The popup loads its IndexedDB snapshot once per open and performs navigation, scoped search,
and sorting in memory. Backup screens support tri-state selective export/import, while share
cards fall back to local PNG download or clipboard copy on pages where overlay injection is
restricted.

## Build

```sh
npm install
npm run audit
npm run package
```

The unpacked build is written to `dist/`, and the packaged build to
`prompt-nest-extension.zip`.

## Load in Chrome

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the
`dist` directory.

## Load in Firefox

Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select
`dist/manifest.json`.

## Verification

- `npm run check` performs strict TypeScript checking.
- `npm test` covers bidi direction, tree-cycle guards, IndexedDB cascade/undo, import
  validation, and share-overlay canvas mounting.
- `npm run audit` rebuilds and rejects unapproved permissions or runtime network primitives.
