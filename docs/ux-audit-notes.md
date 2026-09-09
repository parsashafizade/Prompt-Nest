# UX audit notes

Items below require product decisions beyond low-risk release polish and were intentionally
not added to this release.

1. **High — Protect unsaved prompt edits when opening a linked context block.** Add a discard/save
   decision or draft preservation before navigating away from the edit modal.
2. **High — Offer an explicit history-retention policy for image-heavy libraries.** Unlimited
   history matches the current specification but can eventually exhaust browser storage.
3. **Medium — Add context-block ordering and reference reordering controls.** Copy output honors
   stored reference order, but a dedicated reordering interaction needs a deliberate compact UI.
4. **Medium — Add attachment-storage diagnostics.** A storage-usage view would help users understand
   large embedded-image backups, but it introduces quota estimation and management decisions.
5. **Medium — Consolidate prompt-detail toolbar actions on very narrow layouts.** The new history,
   favorite, edit, share, and close actions fit the current popup, but an overflow pattern would scale
   better if more actions or longer localized titles are added later.
6. **Low — Disambiguate duplicate folder paths in pickers.** Duplicate folder names are supported by
   design, so fully identical breadcrumb paths can still require a future secondary identifier.
7. **Low — Localize the fixed `Shared Prompts` data-folder name.** Keeping one exact cross-language
   name makes import reuse deterministic; localization would need a stable internal marker/migration.
