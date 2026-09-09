import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ExportData } from "./types";

const storage = vi.hoisted(() => {
  const values: Record<string, unknown> = {};
  return {
    get: vi.fn(async (key: string) => ({ [key]: values[key] })),
    set: vi.fn(async (next: Record<string, unknown>) => { Object.assign(values, next); }),
  };
});

vi.mock("webextension-polyfill", () => ({
  default: { storage: { local: storage } },
}));

describe("database layer", () => {
  let db: typeof import("./db");

  beforeAll(async () => {
    db = await import("./db");
  });

  it("persists, cascade-deletes, and restores a complete nested subtree", async () => {
    const root = await db.addFolder("Root", null);
    const child = await db.addFolder("Child", root.id);
    const prompt = await db.addPrompt(child.id, "Mixed title فارسی", "Hello\nسلام");

    expect(await db.moveFolder(root.id, child.id)).toBe(false);
    const deleted = await db.deleteFolderSubtree(root.id);
    expect(deleted.folders.map(({ id }) => id).sort()).toEqual([child.id, root.id].sort());
    expect(deleted.prompts.map(({ id }) => id)).toEqual([prompt.id]);
    expect(await db.getSnapshot()).toEqual({ folders: [], prompts: [] });

    await db.restoreDeleted(deleted);
    const restored = await db.getSnapshot();
    expect(restored.folders).toHaveLength(2);
    expect(restored.prompts).toHaveLength(1);
  });

  it("validates references and cycles in imported data", () => {
    const valid: ExportData = {
      schemaVersion: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      folders: [{
        id: "a",
        name: "A",
        parentId: null,
        order: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      prompts: [],
      settings: { language: "en", theme: "light" },
    };
    expect(db.validateExportData(valid)).toBe(true);
    expect(db.validateExportData({ ...valid, folders: [{ ...valid.folders[0], parentId: "missing" }] })).toBe(false);
    expect(db.validateExportData({
      ...valid,
      folders: [
        { ...valid.folders[0], parentId: "b" },
        { ...valid.folders[0], id: "b", parentId: "a" },
      ],
    })).toBe(false);
  });
});
