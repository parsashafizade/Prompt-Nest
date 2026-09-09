import { describe, expect, it } from "vitest";
import type { Folder } from "./types";
import { getDescendantFolderIds, isFolderMoveValid } from "./utils";

const folder = (id: string, parentId: string | null): Folder => ({
  id,
  parentId,
  name: id,
  order: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("folder tree guards", () => {
  const folders = [folder("root", null), folder("child", "root"), folder("grandchild", "child")];

  it("finds the complete subtree", () => {
    expect([...getDescendantFolderIds(folders, "root")]).toEqual(["child", "grandchild"]);
  });

  it("blocks self and descendant moves while allowing valid parents", () => {
    expect(isFolderMoveValid(folders, "root", "root")).toBe(false);
    expect(isFolderMoveValid(folders, "root", "grandchild")).toBe(false);
    expect(isFolderMoveValid(folders, "child", null)).toBe(true);
  });
});
